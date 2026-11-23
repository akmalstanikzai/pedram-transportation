import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type','Content-Type':'application/json','Cache-Control':'no-store'}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const base64=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes))
const fromBase64=(value:string)=>Uint8Array.from(atob(value),char=>char.charCodeAt(0))
async function vaultKey(){
 const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),url=Deno.env.get('SUPABASE_URL')
 if(!service||!url)throw new Error('VAULT_KEY_MISSING')
 const material=new TextEncoder().encode(`pedram-trader-password-v1\0${url}\0${service}`)
 const raw=await crypto.subtle.digest('SHA-256',material)
 return crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['encrypt','decrypt'])
}
async function seal(password:string,traderId:string){
 const iv=crypto.getRandomValues(new Uint8Array(12))
 const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(traderId)},await vaultKey(),new TextEncoder().encode(password))
 return {ciphertext:base64(new Uint8Array(encrypted)),iv:base64(iv)}
}
async function open(ciphertext:string,iv:string,traderId:string){
 const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromBase64(iv),additionalData:new TextEncoder().encode(traderId)},await vaultKey(),fromBase64(ciphertext))
 return new TextDecoder().decode(plain)
}

const reply = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers })

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers })
  if (request.method !== 'POST') return reply({ error: 'METHOD_NOT_ALLOWED' }, 405)

  try {
    const token = request.headers.get('Authorization')
    if (!token) return reply({ error: 'ACCESS_DENIED' }, 401)
    const url = Deno.env.get('SUPABASE_URL')!
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: token } } })
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data: { user }, error: userError } = await caller.auth.getUser()
    if (userError || !user) return reply({ error: 'ACCESS_DENIED' }, 401)
    const { data: actor } = await admin.from('profiles').select('role,account_enabled').eq('id', user.id).single()
    if (actor?.role !== 'president' || !actor.account_enabled) return reply({ error: 'ACCESS_DENIED' }, 403)
    const body = await request.json()
    if (typeof body?.trader_id !== 'string' || !uuid.test(body.trader_id) ||
      !['details','password','vault','create'].includes(body.action)) throw new Error('REQUIRED_FIELDS')
    const { data: trader, error: traderError } = await admin.from('traders').select('id,full_name,archived_at,user_id').eq('id', body.trader_id).single()
    if (traderError || !trader || trader.archived_at) throw new Error('RESOURCE_UNAVAILABLE')

    const vault = (account: string, operation: string, args = {}) => admin.rpc('trader_login_password', {
      p_actor: user.id, p_trader: trader.id, p_user: account, p_operation: operation, ...args,
    })
    const store = async (account: { id: string, updated_at?: string }, encrypted: { ciphertext: string, iv: string }) => {
      if (!account.updated_at) return false
      const { data, error } = await vault(account.id, 'store', {
        p_auth_updated_at: account.updated_at, p_ciphertext: encrypted.ciphertext, p_iv: encrypted.iv,
      })
      return !error && data?.saved === true
    }

    if (body.action !== 'create') {
      if (!trader.user_id) throw new Error('ACCOUNT_MISSING')
      const { data: profile } = await admin.from('profiles').select('id,role,username,account_enabled').eq('id', trader.user_id).single()
      if (profile?.role !== 'trader' || profile.id === user.id) return reply({ error: 'ACCESS_DENIED' }, 403)

      if (body.action === 'details') {
        const { data, error } = await admin.auth.admin.getUserById(profile.id)
        if (error || !data.user) throw new Error('ACCOUNT_MISSING')
        return reply({ login: profile.username || data.user.email || '', enabled: profile.account_enabled })
      }

      if (body.action === 'vault') {
        const { data: encrypted, error } = await vault(profile.id, 'reveal')
        if (error || !encrypted) {
          if (error?.message === 'PASSWORD_NOT_VAULTED') throw new Error('TRADER_PASSWORD_NOT_VAULTED')
          if (error?.message === 'ACCESS_DENIED') return reply({ error: 'ACCESS_DENIED' }, 403)
          throw new Error('TRADER_VAULT_UNAVAILABLE')
        }
        let password: string
        try { password = await open(encrypted.ciphertext, encrypted.iv, trader.id) }
        catch { throw new Error('VAULT_LEGACY_UNREADABLE') }
        return reply({ password, verified: true })
      }

      if (typeof body.password !== 'string' || body.password.length < 8) throw new Error('PASSWORD_TOO_SHORT')
      const ready = await vault(profile.id, 'status')
      if (ready.error) {
        if (ready.error.message === 'ACCESS_DENIED') return reply({ error: 'ACCESS_DENIED' }, 403)
        throw new Error('TRADER_VAULT_UNAVAILABLE')
      }
      const encrypted = await seal(body.password, trader.id)
      const { data, error } = await admin.auth.admin.updateUserById(profile.id, {
        password: body.password, app_metadata: { pedram_trader_password_iv: encrypted.iv },
      })
      if (error?.code === 'same_password') throw new Error('TRADER_PASSWORD_UNCHANGED')
      if (error) throw new Error('PASSWORD_REJECTED')
      if (!data.user || !await store(data.user, encrypted)) throw new Error('VAULT_WRITE_FAILED')
      return reply({ success: true, vault_saved: true })
    }

    const { request_id: id, password } = body
    const login = String(body.login || '').trim().toLowerCase()
    if (typeof id !== 'string' || !uuid.test(id)) throw new Error('REQUEST_CONFLICT')
    if (!login) throw new Error('INVALID_LOGIN')
    if (typeof password !== 'string' || password.length < 8) throw new Error('PASSWORD_TOO_SHORT')
    const isEmail = login.includes('@')
    if (isEmail ? !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(login) : !/^[a-z0-9._-]+$/.test(login)) throw new Error('INVALID_LOGIN')
    const email = isEmail ? login : `${login}@users.pedram.local`
    const username = isEmail ? null : login
    if (trader.user_id) {
      const { data: existing } = await admin.auth.admin.getUserById(trader.user_id)
      const metadata = existing.user?.app_metadata
      if (metadata?.pedram_trader_request !== id || metadata?.pedram_trader_actor !== user.id ||
        metadata?.pedram_trader_id !== trader.id || existing.user?.email !== email) throw new Error('ACCOUNT_ALREADY_LINKED')
      // An idempotent replay may carry a password that has since been replaced.
      // Return the linked login without writing or assuming these credentials.
      const { data } = await vault(trader.user_id, 'status')
      return reply({ user_id: trader.user_id, login: username || email, vault_saved: data?.saved === true })
    }
    const lookup = { p_actor: user.id, p_trader: trader.id, p_request: id, p_email: email }
    const found = await admin.rpc('find_trader_account', lookup)
    if (found.error) throw new Error(found.error.message || 'TRADER_ACCOUNT_UPDATE_FAILED')
    let account = found.data
    let createdAuth: { id: string, updated_at?: string } | null = null
    const encrypted = account ? null : await seal(password, trader.id)
    if (!account && encrypted) {
      const created = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { full_name: trader.full_name },
        app_metadata: { pedram_trader_request: id, pedram_trader_actor: user.id, pedram_trader_id: trader.id, pedram_trader_password_iv: encrypted.iv },
      })
      if (created.error) {
        const recovered = await admin.rpc('find_trader_account', lookup)
        if (recovered.error || !recovered.data) {
          throw new Error(['email_exists','user_already_exists'].includes(created.error.code || '') ? 'LOGIN_TAKEN' : 'TRADER_ACCOUNT_UPDATE_FAILED')
        }
        account = recovered.data
      } else {
        createdAuth = created.data.user
        account = createdAuth?.id
      }
    }
    if (!account) throw new Error('TRADER_ACCOUNT_UPDATE_FAILED')
    const linked = await admin.rpc('link_trader_account', { p_actor: user.id, p_trader: trader.id, p_user: account, p_request: id, p_username: username })
    if (linked.error) throw new Error(linked.error.message || 'TRADER_ACCOUNT_UPDATE_FAILED')
    const saved = createdAuth && encrypted
      ? await store(createdAuth, encrypted)
      : (await vault(account, 'status')).data?.saved === true
    return reply({ user_id: linked.data, login: username || email, vault_saved: saved })
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : 'TRADER_ACCOUNT_UPDATE_FAILED' }, 400)
  }
})
