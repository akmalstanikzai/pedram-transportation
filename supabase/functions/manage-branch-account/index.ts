// Standalone Dashboard deployment: paste this entire file into index.ts.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization,x-client-info,apikey,content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}
const reply = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers })

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers })
  if (request.method !== 'POST') return reply({ error: 'METHOD_NOT_ALLOWED' }, 405)
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
    if (typeof body?.branch_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.branch_id)
      || !['details', 'password'].includes(body.action)) return reply({ error: 'REQUIRED_FIELDS' }, 400)
    const { data: branch, error: branchError } = await admin.from('branches').select('id,manager_user_id,archived_at').eq('id', body.branch_id).single()
    if (branchError || !branch || branch.archived_at) return reply({ error: 'BRANCH_UNAVAILABLE' }, 400)
    if (!branch.manager_user_id) return reply({ error: 'ACCOUNT_MISSING' }, 400)
    const { data: manager, error: managerError } = await admin.from('profiles').select('id,role,branch_id,username').eq('id', branch.manager_user_id).single()
    if (managerError || manager?.role !== 'branch_manager' || manager.branch_id !== branch.id || manager.id === user.id) return reply({ error: 'ACCESS_DENIED' }, 403)

    if (body.action === 'details') {
      const { data, error } = await admin.auth.admin.getUserById(manager.id)
      if (error || !data.user) return reply({ error: 'ACCOUNT_MISSING' }, 400)
      return reply({ login: manager.username || data.user.email || '' })
    }
    if (typeof body.password !== 'string' || body.password.length < 8) return reply({ error: 'PASSWORD_TOO_SHORT' }, 400)
    // Never accept a caller-supplied user ID, return a password, or store it in profiles.
    const { error } = await admin.auth.admin.updateUserById(manager.id, { password: body.password })
    if (error && error.code !== 'same_password') return reply({ error: 'PASSWORD_REJECTED' }, 400)
    return reply({ success: true })
  } catch {
    return reply({ error: 'ACCOUNT_UPDATE_FAILED' }, 400)
  }
})
