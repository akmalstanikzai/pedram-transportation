export async function loadAccountProfile(client, userId, signal) {
  // getSession refreshes stored credentials when needed. The React session can
  // still contain the previous token while that refresh is completing.
  const { data, error } = await client.auth.getSession()
  if (signal.aborted) return { data: null, error: null }
  if (error) return { data: null, error, status: error.status }
  if (!data.session || data.session.user.id !== userId) {
    return { data: null, error: { message: 'No active session. Please sign in again.' }, status: 401 }
  }
  return client.from('profiles')
    .select('id,full_name,role,branch_id,account_enabled')
    .eq('id', userId).abortSignal(signal).single()
}
