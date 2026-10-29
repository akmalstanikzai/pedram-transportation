import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authorization = request.headers.get('Authorization')
    if (!authorization) throw new Error('Authentication is required.')

    const url = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } })
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    const { data: { user } } = await callerClient.auth.getUser()
    if (!user) throw new Error('Authentication is required.')
    const { data: caller } = await admin.from('profiles').select('role').eq('id', user.id).single()
    if (caller?.role !== 'president') throw new Error('Only the President can create a branch account.')

    const { branch, manager, credentials } = await request.json()
    if (!branch?.name || !branch?.province || !branch?.city) throw new Error('Complete the required branch fields.')
    if (!manager?.full_name || !manager?.phone) throw new Error('Complete the required manager fields.')
    if (!credentials?.login || !credentials?.password || credentials.password.length < 8) throw new Error('The login and an 8 character password are required.')

    const rawLogin = String(credentials.login).trim().toLowerCase()
    const isEmail = rawLogin.includes('@')
    const username = isEmail ? null : rawLogin.replace(/[^a-z0-9._-]/g, '')
    if (!isEmail && !username) throw new Error('Enter a valid username.')
    const email = isEmail ? rawLogin : `${username}@users.pedram.local`

    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password: credentials.password,
      email_confirm: true,
      user_metadata: { full_name: manager.full_name },
    })
    if (authError) throw authError

    let branchId: string | null = null
    try {
      const { data: newBranch, error: branchError } = await admin.from('branches').insert({
        name: branch.name.trim(), province: branch.province.trim(),
        city: branch.city.trim(), address: branch.address || null, phone: branch.phone || null,
        created_by: user.id,
      }).select('id').single()
      if (branchError) throw branchError
      branchId = newBranch.id

      const { error: profileError } = await admin.from('profiles').update({
        full_name: manager.full_name.trim(), role: 'branch_manager', username, branch_id: branchId,
        phone: manager.phone.trim(), father_name: manager.father_name || null, national_id: manager.national_id || null,
        address: manager.address || null,
        account_enabled: true,
      }).eq('id', authData.user.id)
      if (profileError) throw profileError

      const { error: linkError } = await admin.from('branches').update({ manager_user_id: authData.user.id }).eq('id', branchId)
      if (linkError) throw linkError
    } catch (error) {
      if (branchId) await admin.from('branches').delete().eq('id', branchId)
      await admin.auth.admin.deleteUser(authData.user.id)
      throw error
    }

    return new Response(JSON.stringify({ branch_id: branchId, username, email }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create branch.'
    console.error('create-branch-with-manager:', message)
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
    })
  }
})

