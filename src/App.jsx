import { useEffect, useMemo, useState } from 'react'
import Brand from './components/Brand'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import { supabase } from './lib/supabase'
import { getTranslation } from './lib/i18n'
import './App.css'

export default function App() {
  const [language, setLanguage] = useState(() => localStorage.getItem('pedram-language') || 'en')
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [checking, setChecking] = useState(Boolean(supabase))

  useEffect(() => {
    localStorage.setItem('pedram-language', language)
    document.documentElement.lang = language === 'fa' ? 'fa' : 'en'
    document.documentElement.dir = language === 'fa' ? 'rtl' : 'ltr'
    document.title = language === 'fa' ? 'پدرام | سیستم مدیریت' : 'Pedram | Management System'
  }, [language])

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
    const text = getTranslation(language)
    if (checking) return <div className="loading-screen"><Brand text={text} /><span className="spinner dark" /></div>
    if (!session) return <LoginPage language={language} onLanguageChange={setLanguage} onSignedIn={setSession} />
    return <DashboardPage language={language} onLanguageChange={setLanguage} session={session} profile={profile} onSignOut={() => supabase?.auth.signOut()} />
  }, [checking, session, profile, language])
}
