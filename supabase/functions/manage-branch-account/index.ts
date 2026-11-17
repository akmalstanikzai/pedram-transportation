// Standalone Dashboard deployment: paste this entire file into index.ts.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Shared with the standalone Edge Functions; keep copies identical (tested).
function normalizeLogin(value) {
  if (typeof value !== 'string') throw new Error('INVALID_LOGIN')
  const login = value.normalize('NFKC').trim()
  const invisibleControl = [...login].some(char => { const code = char.codePointAt(0); return code < 32 || code >= 127 && code <= 159 || code >= 8234 && code <= 8238 || code >= 8294 && code <= 8297 })
  if (!login || [...login].length > 120 || invisibleControl) throw new Error('INVALID_LOGIN')
  return login
}

async function loginIdentity(value) {
  const login = normalizeLogin(value), key = login.toLowerCase()
  // Preserve existing email sign-ins and the original ASCII username format.
  const [local,domain,...extra] = key.split('@')
  const atom = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+$/i
  const email = !extra.length && local?.length <= 64 && local.split('.').every(part => atom.test(part)) && domain?.includes('.') && domain.split('.').every(part => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(part))
  if (email) return {login, email:key, username:null}
  if (key.length <= 64 && /^[a-z0-9_-]+(?:\.[a-z0-9_-]+)*$/.test(key)) return {login, email:`${key}@users.pedram.local`, username:login}
  // Names, spaces and symbols are encoded into an email accepted by Auth.
  const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key))
  const hash = Array.from(new Uint8Array(digest),byte => byte.toString(16).padStart(2,'0')).join('')
  return {login, email:`${hash}@usernames.pedram.local`, username:login}
}

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization,x-client-info,apikey,content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
}
const reply = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers })
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const fromBase64 = (value: string) => Uint8Array.from(atob(value), char => char.charCodeAt(0))

async function legacyVaultKey() {
  const encoded = Deno.env.get('BRANCH_PASSWORD_VAULT_KEY')
  if (!encoded) throw new Error('VAULT_KEY_MISSING')
  let raw: Uint8Array
  try { raw = fromBase64(encoded.trim()) } catch { throw new Error('VAULT_KEY_INVALID') }
  if (raw.length !== 32) throw new Error('VAULT_KEY_INVALID')
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}
async function vaultKey(version: number) {
  if (version === 1) return legacyVaultKey()
  if (version !== 2) throw new Error('VAULT_KEY_INVALID')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const projectUrl = Deno.env.get('SUPABASE_URL')
  if (!serviceKey || !projectUrl) throw new Error('VAULT_KEY_MISSING')
  const material = new TextEncoder().encode(`pedram-branch-password-v2\0${projectUrl}\0${serviceKey}`)
  const raw = await crypto.subtle.digest('SHA-256', material)
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}
async function encryptPassword(password: string, branchId: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = new TextEncoder().encode(password)
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(branchId) }, await vaultKey(2), data)
  return { ciphertext: base64(new Uint8Array(encrypted)), iv: base64(iv) }
}
async function decryptPassword(ciphertext: string, iv: string, branchId: string, version: number) {
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(iv), additionalData: new TextEncoder().encode(branchId) }, await vaultKey(version), fromBase64(ciphertext))
  return new TextDecoder().decode(decrypted)
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers })
  if (request.method !== 'POST') return reply({ error: 'METHOD_NOT_ALLOWED' }, 405)
  let requestedAction = ''
  try {
    const token = request.headers.get('Authorization')
    if (!token) return reply({ error: 'ACCESS_DENIED' }, 401)
    const url = Deno.env.get('SUPABASE_URL')!
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: token } } })
    const { data: { user }, error: authError } = await caller.auth.getUser()
    if (authError || !user) return reply({ error: 'ACCESS_DENIED' }, 401)
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data: actor, error: actorError } = await admin.from('profiles').select('role,account_enabled').eq('id', user.id).single()
    if (actorError || actor?.role !== 'president' || !actor.account_enabled) return reply({ error: 'ACCESS_DENIED' }, 403)

    const body = await request.json()
    requestedAction = String(body?.action || '')
    if (body?.action === 'check_vault') {
      await vaultKey(2)
      return reply({ ready: true })
    }
    if (typeof body?.branch_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.branch_id)
      || !['details', 'password', 'vault', 'login'].includes(body.action)) return reply({ error: 'REQUIRED_FIELDS' }, 400)
    const { data: branch, error: branchError } = await admin.from('branches').select('id,manager_user_id,archived_at').eq('id', body.branch_id).single()
    if (branchError || !branch || branch.archived_at) return reply({ error: 'BRANCH_UNAVAILABLE' }, 400)
    if (!branch.manager_user_id) return reply({ error: 'ACCOUNT_MISSING' }, 400)
    const { data: manager, error: managerError } = await admin.from('profiles').select('id,role,branch_id,username').eq('id', branch.manager_user_id).single()
    if (managerError || manager?.role !== 'branch_manager' || manager.branch_id !== branch.id || manager.id === user.id) return reply({ error: 'ACCESS_DENIED' }, 403)

    const {data: authData,error: authReadError} = await admin.auth.admin.getUserById(manager.id)
    if (authReadError || !authData.user?.email) return reply({error:'ACCOUNT_MISSING'},400)
    const authUser = authData.user
    if (body.action === 'details') {
      let login = authUser.email
      for (const candidate of [authUser.app_metadata?.pedram_login,manager.username]) {
        if (!candidate) continue
        try { const identity = await loginIdentity(candidate); if (identity.email === authUser.email.toLowerCase()) { login = identity.login; break } } catch { /* A legacy label is not necessarily a valid sign-in. */ }
      }
      return reply({login})
    }
    if (body.action === 'vault') {
      const { data: vault, error: vaultError } = await admin.from('branch_password_vault').select('ciphertext,iv,key_version').eq('branch_id', branch.id).single()
      if (vaultError || !vault) return reply({ error: 'PASSWORD_NOT_VAULTED' }, 404)
      if (authUser.app_metadata?.pedram_branch_password_iv && authUser.app_metadata.pedram_branch_password_iv !== vault.iv) return reply({error:'PASSWORD_NOT_VAULTED'},404)
      let password: string
      try { password = await decryptPassword(vault.ciphertext, vault.iv, branch.id, vault.key_version) }
      catch { return reply({ error: 'VAULT_LEGACY_UNREADABLE' }, 409) }
      const { error: auditError } = await admin.from('branch_password_vault_audit').insert({ branch_id: branch.id, actor_id: user.id, action: 'viewed' })
      if (auditError) return reply({ error: 'VAULT_AUDIT_FAILED' }, 500)
      return reply({ password })
    }
    if (body.action === 'login') {
      let identity
      try { identity = await loginIdentity(body.login) } catch { return reply({error:'INVALID_LOGIN'},400) }
      const {login,email} = identity
      const {error: authUpdateError} = await admin.auth.admin.updateUserById(manager.id, {email,email_confirm:true,app_metadata:{...authUser.app_metadata,pedram_login:login}})
      if (authUpdateError) return reply({error:['email_exists','user_already_exists'].includes(authUpdateError.code) ? 'LOGIN_TAKEN' : 'LOGIN_REJECTED'},400)
      const {error: profileUpdateError} = await admin.from('profiles').update({username:login}).eq('id',manager.id).select('id').single()
      if (profileUpdateError) {
        const {error: rollbackError} = await admin.auth.admin.updateUserById(manager.id,{email:authUser.email,email_confirm:true,app_metadata:{...authUser.app_metadata,pedram_login:authUser.app_metadata?.pedram_login ?? null}})
        return reply({error:rollbackError ? 'LOGIN_SYNC_FAILED' : profileUpdateError.code === '23505' ? 'LOGIN_TAKEN' : 'LOGIN_PROFILE_FAILED'},rollbackError ? 500 : profileUpdateError.code === '23505' ? 400 : 500)
      }
      return reply({success:true,login})
    }
    if (typeof body.password !== 'string' || body.password.length < 8) return reply({ error: 'PASSWORD_TOO_SHORT' }, 400)
    const sealed = await encryptPassword(body.password, branch.id)
    const metadata = {...authUser.app_metadata,pedram_branch_password_iv:sealed.iv}
    const {error} = await admin.auth.admin.updateUserById(manager.id,{password:body.password,app_metadata:metadata})
    if (error?.code === 'same_password') {
      const {error: markerError} = await admin.auth.admin.updateUserById(manager.id,{app_metadata:metadata})
      if (markerError) return reply({error:'PASSWORD_UPDATE_FAILED'},500)
    } else if (error) return reply({error:'PASSWORD_REJECTED'},400)
    const { error: vaultError } = await admin.from('branch_password_vault').upsert({ branch_id: branch.id, ...sealed, key_version: 2, updated_by: user.id, updated_at: new Date().toISOString() })
    if (vaultError) return reply({ error: 'VAULT_WRITE_FAILED' }, 500)
    const { error: auditError } = await admin.from('branch_password_vault_audit').insert({ branch_id: branch.id, actor_id: user.id, action: 'stored' })
    if (auditError) return reply({ error: 'VAULT_AUDIT_FAILED' }, 500)
    return reply({ success: true })
  } catch (error) {
    const code = error instanceof Error ? error.message : 'ACCOUNT_UPDATE_FAILED'
    // This log contains only the action and technical error; never log credentials or vault data.
    console.error('manage-branch-account failed', { action: requestedAction || 'unknown', error: code })
    const safeCode = ['VAULT_KEY_MISSING', 'VAULT_KEY_INVALID'].includes(code)
      ? code
      : requestedAction === 'login' ? 'LOGIN_UPDATE_FAILED' : requestedAction === 'password' ? 'PASSWORD_UPDATE_FAILED' : 'ACCOUNT_UPDATE_FAILED'
    return reply({ error: safeCode }, 400)
  }
})
