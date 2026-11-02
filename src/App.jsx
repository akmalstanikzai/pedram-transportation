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
  const [profileError,setProfileError]=useState(false)
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
      setProfile(null)
      setSession(nextSession)
      setChecking(false)
    })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (!session || !supabase) return
    let active=true
    const load=()=>supabase.from('profiles').select('id,full_name, role, branch_id,account_enabled').eq('id', session.user.id).single().then(({data,error})=>{if(active){setProfile(data);setProfileError(!!error)}})
    void load()
    const timer=setInterval(load,30000)
    window.addEventListener('focus',load)
    return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',load)}
  }, [session])

  return useMemo(() => {
    const text = getTranslation(language)
    if (checking) return <div className="loading-screen"><Brand text={text} /><span className="spinner dark" /></div>
    if (!session) return <LoginPage language={language} onLanguageChange={setLanguage} onSignedIn={setSession} />
    if(profileError||profile?.account_enabled===false)return <div className="loading-screen"><Brand text={text}/><p>{profile?.account_enabled===false?(language==='fa'?'حساب شما غیرفعال است. با رئیس تماس بگیرید.':'Your account is disabled. Contact the President.'):(language==='fa'?'معلومات حساب بارگیری نشد. دوباره وارد شوید.':'Could not load your account. Sign in again.')}</p><button className="registry-secondary" onClick={()=>supabase.auth.signOut()}>{text.signOut}</button></div>
    if(!profile)return <div className="loading-screen"><span className="spinner dark"/></div>
    return <DashboardPage language={language} onLanguageChange={setLanguage} session={session} profile={profile} onSignOut={() => supabase?.auth.signOut()} />
  }, [checking, session, profile, profileError, language])
}
