import { useEffect, useState } from 'react'
import Brand from './components/Brand'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import ErrorBoundary from './components/ErrorBoundary'
import { supabase } from './lib/supabase'
import { getTranslation } from './lib/i18n'
import { errorText } from './lib/operations'
import './App.css'
import './workspace.css'
import './workspace-tools.css'
import './notifications.css'

export default function App() {
  const [language, setLanguage] = useState(() => {
    try {
      return localStorage.getItem('pedram-language') === 'fa' ? 'fa' : 'en'
    } catch {
      return 'en'
    }
  })
  const [auth, setAuth] = useState({ session: null, checking: Boolean(supabase), error: null })
  useEffect(() => {
    try {
      localStorage.setItem('pedram-language', language)
    } catch {
      /* Storage can be disabled. */
    }
    document.documentElement.lang = language
    document.documentElement.dir = language === 'fa' ? 'rtl' : 'ltr'
    document.title = language === 'fa' ? 'پدرام | سیستم مدیریت' : 'Pedram | Management System'
  }, [language])
  useEffect(() => {
    if (!supabase) return undefined
    let active = true
    let eventReceived = false
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      eventReceived = true
      if (active) setAuth({ session, checking: false, error: null })
    })
    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (active && !eventReceived)
          setAuth({ session: data?.session || null, checking: false, error })
      })
      .catch((error) => {
        if (active) setAuth({ session: null, checking: false, error })
      })
    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])
  if (auth.checking)
    return (
      <div className="loading-screen" role="status">
        <Brand text={getTranslation(language)} />
        <span className="spinner dark" />
      </div>
    )
  if (!auth.session)
    return <LoginPage language={language} onLanguageChange={setLanguage} authError={auth.error} />
  return (
    <StaffWorkspace
      key={auth.session.user.id}
      session={auth.session}
      language={language}
      onLanguageChange={setLanguage}
    />
  )
}

function StaffWorkspace({ session, language, onLanguageChange }) {
  const [state, setState] = useState({ profile: null, error: null })
  const [attempt, setAttempt] = useState(0)
  const [signingOut, setSigningOut] = useState(false)
  useEffect(() => {
    let active = true
    let revision = 0
    async function load() {
      const request = ++revision
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, phone, username, role, branch_id, account_enabled')
          .eq('id', session.user.id)
          .abortSignal(AbortSignal.timeout(15000))
          .single()
        if (error || !data) throw new Error('PROFILE_MISSING')
        if (!data.account_enabled) throw new Error('ACCOUNT_DISABLED')
        if (active && request === revision) setState({ profile: data, error: null })
      } catch (error) {
        if (active && request === revision) setState({ profile: null, error })
      }
    }
    void load()
    const timer = window.setInterval(load, 60000)
    window.addEventListener('focus', load)
    return () => {
      active = false
      clearInterval(timer)
      window.removeEventListener('focus', load)
    }
  }, [session.user.id, attempt])
  async function signOut() {
    if (signingOut) return
    setSigningOut(true)
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (error) throw error
      window.location.hash = ''
    } catch (error) {
      setState((current) => ({ ...current, error }))
    } finally {
      setSigningOut(false)
    }
  }
  if (state.error || !state.profile)
    return (
      <div className="loading-screen">
        <Brand text={getTranslation(language)} />
        {state.error ? (
          <>
            <p role="alert">{errorText(state.error, language)}</p>
            <div className="page-heading-actions">
              <button
                className="registry-secondary"
                onClick={() => {
                  setState({ profile: null, error: null })
                  setAttempt((value) => value + 1)
                }}
              >
                {language === 'fa' ? 'کوشش مجدد' : 'Retry'}
              </button>
              <button className="registry-primary" disabled={signingOut} onClick={signOut}>
                {language === 'fa' ? 'خروج' : 'Sign out'}
              </button>
            </div>
          </>
        ) : (
          <span className="spinner dark" />
        )}
      </div>
    )
  return (
    <ErrorBoundary language={language}>
      <DashboardPage
        key={`${state.profile.role}:${state.profile.branch_id || 'central'}`}
        language={language}
        onLanguageChange={onLanguageChange}
        session={session}
        profile={state.profile}
        onSignOut={signOut}
        signingOut={signingOut}
        onProfileUpdated={(updated) =>
          setState((current) => ({ ...current, profile: { ...current.profile, ...updated } }))
        }
      />
    </ErrorBoundary>
  )
}
