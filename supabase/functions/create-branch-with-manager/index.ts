import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
const required = (value: unknown, maximum = 160) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maximum)
    throw new Error('REQUIRED_FIELDS')
  return value.trim()
}
const optional = (value: unknown, maximum = 500) =>
  value == null || value === '' ? '' : required(value, maximum)
const known = [
  'ACCESS_DENIED',
  'ACCOUNT_DISABLED',
  'REQUIRED_FIELDS',
  'INVALID_LOGIN',
  'PASSWORD_MISMATCH',
  'DUPLICATE_RECORD',
  'PROFILE_MISSING',
  'REQUEST_CONFLICT',
  'SCHEMA_REQUIRED',
  'PROVISIONING_REVIEW_REQUIRED',
  'STALE_RECORD',
  'MANAGER_ASSIGNED',
  'RECORD_IN_USE',
]

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return reply({ error: 'METHOD_NOT_ALLOWED' }, 405)
  let requestId = ''
  try {
    const authorization = request.headers.get('Authorization')
    if (!authorization?.startsWith('Bearer ')) return reply({ error: 'ACCESS_DENIED' }, 401)
    const url = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !anonKey || !serviceKey) return reply({ error: 'CONFIGURATION' }, 500)
    const callerClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const {
      data: { user },
      error: authError,
    } = await callerClient.auth.getUser()
    if (authError || !user) return reply({ error: 'ACCESS_DENIED' }, 401)
    const { data: caller, error: profileError } = await admin
      .from('profiles')
      .select('role,account_enabled')
      .eq('id', user.id)
      .single()
    if (profileError || caller?.role !== 'president') return reply({ error: 'ACCESS_DENIED' }, 403)
    if (!caller.account_enabled) return reply({ error: 'ACCOUNT_DISABLED' }, 403)
    let body
    try {
      body = await request.json()
    } catch {
      throw new Error('REQUIRED_FIELDS')
    }
    requestId = required(body.request_id, 36)
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId))
      throw new Error('REQUEST_CONFLICT')
    const branchIdToUpdate = body.branch_id == null ? null : required(body.branch_id, 36)
    const expected = branchIdToUpdate ? required(body.expected_updated_at, 60) : null
    if (
      branchIdToUpdate &&
      (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(branchIdToUpdate) ||
        !expected ||
        Number.isNaN(Date.parse(expected)))
    )
      throw new Error('REQUIRED_FIELDS')
    const branch = body.branch
    const manager = body.manager
    const credentials = body.credentials
    const data = {
      name: required(branch?.name),
      province: required(branch?.province),
      city: required(branch?.city),
      address: optional(branch?.address),
      phone: optional(branch?.phone, 40),
      manager_name: required(manager?.full_name),
      manager_phone: required(manager?.phone, 40),
      father_name: optional(manager?.father_name),
      national_id: optional(manager?.national_id, 80),
      manager_address: optional(manager?.address),
      manager_enabled: true,
      archived: branch?.archived === true,
    }
    const login = required(credentials?.login, 254).toLowerCase()
    const isEmail = login.includes('@')
    if (
      isEmail
        ? !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(login)
        : !/^[a-z0-9][a-z0-9._-]{2,63}$/.test(login)
    )
      throw new Error('INVALID_LOGIN')
    if (
      typeof credentials?.password !== 'string' ||
      credentials.password.length < 8 ||
      credentials.password.length > 128
    )
      throw new Error('PASSWORD_MISMATCH')
    const email = isEmail ? login : `${login}@users.pedram.local`
    const username = isEmail ? null : login
    const { data: prior, error: priorError } = await admin
      .from('branches')
      .select('id,created_by')
      .eq('creation_request', requestId)
      .maybeSingle()
    if (priorError) throw new Error('SCHEMA_REQUIRED')
    if (prior)
      return prior.created_by === user.id
        ? reply({ branch_id: prior.id, username })
        : reply({ error: 'ACCESS_DENIED' }, 403)
    const recover = () =>
      admin.rpc('find_branch_provisioning_account', {
        p_actor: user.id,
        p_request: requestId,
        p_email: email,
      })
    const { data: recovered, error: recoveryError } = await recover()
    if (recoveryError) throw new Error('SCHEMA_REQUIRED')
    let accountId = recovered
    let createdHere = false
    if (!accountId) {
      const { data: account, error: createError } = await admin.auth.admin.createUser({
        email,
        password: credentials.password,
        email_confirm: true,
        user_metadata: { full_name: data.manager_name },
        app_metadata: {
          pedram_provisioning_request: requestId,
          pedram_provisioning_actor: user.id,
        },
      })
      if (createError || !account.user) {
        const { data: afterTimeout, error: checkError } = await recover()
        if (afterTimeout) accountId = afterTimeout
        else if (checkError || !createError?.status || createError.status >= 500)
          throw new Error('PROVISIONING_REVIEW_REQUIRED')
        else if (
          createError?.code === 'email_exists' ||
          /already|registered/i.test(createError?.message || '')
        )
          throw new Error('DUPLICATE_RECORD')
        else throw new Error('REQUIRED_FIELDS')
      } else {
        accountId = account.user.id
        createdHere = true
      }
    }
    const { data: branchId, error: failure } = await admin.rpc('provision_branch', {
      p_actor: user.id,
      p_request: requestId,
      p_manager: accountId,
      p_data: data,
      p_username: username,
      p_branch: branchIdToUpdate,
      p_expected: expected,
    })
    if (failure) {
      // Reconcile before compensation: an HTTP timeout can follow a committed RPC.
      const { data: committed, error: checkError } = await admin
        .from('branches')
        .select('id,created_by')
        .eq('creation_request', requestId)
        .maybeSingle()
      if (committed?.created_by === user.id) return reply({ branch_id: committed.id, username })
      if (checkError || !failure.code || failure.code.startsWith('PGRST')) {
        console.error('Branch provisioning needs reconciliation', {
          request_id: requestId,
          user_id: accountId,
        })
        throw new Error('PROVISIONING_REVIEW_REQUIRED')
      }
      if (!createdHere) throw new Error('PROVISIONING_REVIEW_REQUIRED')
      const { error: cleanupError } = await admin.auth.admin.deleteUser(accountId)
      if (cleanupError) {
        console.error('Branch account cleanup needs reconciliation', {
          request_id: requestId,
          user_id: accountId,
        })
        throw new Error('PROVISIONING_REVIEW_REQUIRED')
      }
      throw new Error(known.find((code) => failure.message.includes(code)) || 'REQUIRED_FIELDS')
    }
    return reply({ branch_id: branchId, username })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    const code = known.find((value) => message.includes(value)) || 'UNKNOWN_ERROR'
    console.error('Branch request failed', { request_id: requestId, code })
    return reply(
      { error: code },
      code === 'ACCESS_DENIED' || code === 'ACCOUNT_DISABLED'
        ? 403
        : code === 'UNKNOWN_ERROR' || code === 'PROVISIONING_REVIEW_REQUIRED'
          ? 500
          : 400,
    )
  }
})
