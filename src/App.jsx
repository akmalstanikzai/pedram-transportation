import { useEffect, useMemo, useRef, useState } from 'react'
import Brand from './components/Brand'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import { supabase, signOutCurrentSession } from './lib/supabase'
import { loadAccountProfile } from './lib/accountProfile'
import { getTranslation } from './lib/i18n'
import './App.css'

export default function App() {
  const [language, setLanguage] = useState(() => localStorage.getItem('pedram-language') || 'en')
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [profileError,setProfileError]=useState(false)
  const [profileAttempt, setProfileAttempt] = useState(0)
  const [checking, setChecking] = useState(Boolean(supabase))
  const currentUserId = useRef(null)

  useEffect(() => {
    localStorage.setItem('pedram-language', language)
    document.documentElement.lang = language === 'fa' ? 'fa' : 'en'
    document.documentElement.dir = language === 'fa' ? 'rtl' : 'ltr'
    document.title = language === 'fa' ? 'پدرام | سیستم مدیریت' : 'Pedram | Management System'
  }, [language])

  useEffect(() => {
    if (!supabase) return undefined
    let active = true
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      if (currentUserId.current !== nextSession?.user.id) {
        currentUserId.current = nextSession?.user.id
        setProfile(null)
        setProfileError(false)
      }
      if (_event === 'SIGNED_IN' || _event === 'TOKEN_REFRESHED') setProfileError(false)
      setSession(nextSession)
      setChecking(false)
    })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (!session || !supabase) return
    let active = true
    let inFlight = false
    let stopped = false
    let lastAttempt = 0
    const controller = new AbortController()
    const load = async () => {
      if (!active || stopped || inFlight || document.hidden || Date.now() - lastAttempt < 30000) return
      inFlight = true
      lastAttempt = Date.now()
      try {
        const { data, error, status } = await loadAccountProfile(supabase, session.user.id, controller.signal)
        if (!active) return
        if (error) {
          setProfileError({ message: error.message, code: error.code, status })
          // Require an explicit sign-in instead of repeatedly using rejected credentials.
          if (status === 401 || status === 403 || status === 429) stopped = true
          return
        }
        setProfile(data)
        setProfileError(false)
      } catch (error) {
        if (active) setProfileError({ message: error.message || 'Network request failed.' })
      } finally {
        inFlight = false
      }
    }
    void load()
    const timer = setInterval(load, 30000)
    window.addEventListener('focus', load)
    return () => {
      active = false
      controller.abort()
      clearInterval(timer)
      window.removeEventListener('focus', load)
    }
  }, [session, profileAttempt])

  return useMemo(() => {
    const text = getTranslation(language)
    if (checking) return <div className="loading-screen"><Brand text={text} /><span className="spinner dark" /></div>
    if (!session) return <LoginPage language={language} onLanguageChange={setLanguage} onSignedIn={nextSession => { setProfileError(false); setProfile(null); setSession(nextSession); setProfileAttempt(attempt => attempt + 1) }} />
    if (profileError || profile?.account_enabled === false) return <div className="loading-screen">
      <Brand text={text} />
      <p>{profile?.account_enabled === false
        ? (language === 'fa' ? 'حساب شما غیرفعال است. با رئیس تماس بگیرید.' : 'Your account is disabled. Contact the President.')
        : (language === 'fa' ? 'معلومات حساب بارگیری نشد.' : 'Could not load your account.')}</p>
      {profileError && <>
        <p role="alert">{[profileError.status, profileError.code, profileError.message].filter(Boolean).join(' · ')}</p>
        <button className="registry-secondary" onClick={() => { setProfileError(false); setProfileAttempt(attempt => attempt + 1) }}>{language === 'fa' ? 'تلاش دوباره' : 'Retry loading account'}</button>
      </>}
      <button className="registry-secondary" onClick={signOutCurrentSession}>{text.signOut}</button>
    </div>
    if(!profile)return <div className="loading-screen"><span className="spinner dark"/></div>
    return <DashboardPage language={language} onLanguageChange={setLanguage} session={session} profile={profile} onSignOut={signOutCurrentSession} />
  }, [checking, session, profile, profileError, language])
}
