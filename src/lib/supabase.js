import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

// Keep one auth refresh timer and storage listener across Vite hot reloads.
export const supabase = supabaseUrl && supabaseKey
  ? (import.meta.hot?.data.supabase ?? createClient(supabaseUrl, supabaseKey))
  : null

if (import.meta.hot) import.meta.hot.data.supabase = supabase

export async function signOutCurrentSession() {
  if (!supabase) return
  try {
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    if (!error) return
  } catch {
    // A failed refresh must not trap the user on the account error screen.
  }
  await supabase.auth.stopAutoRefresh()
  const storageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`
  for (const suffix of ['', '-user', '-code-verifier']) {
    localStorage.removeItem(`${storageKey}${suffix}`)
  }
  // Recreate the SDK too, so it cannot keep using its in-memory session.
  window.location.reload()
}
