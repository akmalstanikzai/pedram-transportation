import { useEffect, useMemo, useState } from 'react'
import Brand from './components/Brand'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import { supabase } from './lib/supabase'
import './App.css'

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [checking, setChecking] = useState(Boolean(supabase))

  useEffect(() => {
    if (!supabase) return undefined
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (active) { setSession(data.session); setChecking(false) }
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setChecking(false)
    })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (!session || !supabase) return
    supabase.from('profiles').select('full_name, role').eq('id', session.user.id).single().then(({ data }) => setProfile(data))
  }, [session])

  return useMemo(() => {
    if (checking) return <div className="loading-screen"><Brand /><span className="spinner dark" /></div>
    if (!session) return <LoginPage onSignedIn={setSession} />
    return <DashboardPage session={session} profile={profile} onSignOut={() => supabase?.auth.signOut()} />
  }, [checking, session, profile])
}
