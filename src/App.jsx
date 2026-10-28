import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import './App.css'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null

const roleLabels = { president: 'President', vice_president: 'Vice-president', departmental_manager: 'Departmental manager', branch_manager: 'Branch manager', driver: 'Driver' }
const roleDescriptions = { president: 'Company-wide visibility and control', vice_president: 'Executive operations and oversight', departmental_manager: 'Department performance and teams', branch_manager: 'Branch schedules and operations', driver: 'Your routes, trips and assignments' }

function Icon({ name, size = 20 }) {
  const paths = {
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />, back: <path d="m15 18-6-6 6-6" />,
    check: <path d="m5 12 4 4L19 6" />, eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="2.5" /></>,
    eyeOff: <><path d="m3 3 18 18M10.6 5.1A10.7 10.7 0 0 1 12 5c6.5 0 10 7 10 7a17.4 17.4 0 0 1-3.1 3.8M6.2 6.3C3.5 8.2 2 12 2 12s3.5 7 10 7c1.6 0 3-.4 4.2-1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>,
    lock: <><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>, mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" /></>, shield: <path d="M12 3 20 6v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3Z" />,
    truck: <><path d="M3 6h11v10H3zM14 9h4l3 3v4h-7z" /><circle cx="7" cy="18" r="2" /><circle cx="18" cy="18" r="2" /></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function Brand() { return <div className="brand"><div className="brand-mark"><Icon name="truck" size={22} /></div><div><strong>Pedram</strong><span>Transportation</span></div></div> }

function Field({ label, type = 'text', value, onChange, placeholder, icon }) {
  const [visible, setVisible] = useState(false)
  const isPassword = type === 'password'
  return <label className="field"><span className="field-label">{label}</span><span className="input-wrap"><Icon name={icon} size={18} /><input type={isPassword && visible ? 'text' : type} value={value} onChange={onChange} placeholder={placeholder} autoComplete={isPassword ? 'current-password' : 'email'} required />{isPassword && <button type="button" className="visibility" onClick={() => setVisible(!visible)} aria-label={visible ? 'Hide password' : 'Show password'}><Icon name={visible ? 'eyeOff' : 'eye'} size={18} /></button>}</span></label>
}

function Login({ onSignedIn }) {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [loading, setLoading] = useState(false); const [message, setMessage] = useState(null); const [mode, setMode] = useState('login')
  async function submit(event) {
    event.preventDefault(); if (!supabase) return setMessage({ type: 'error', text: 'Supabase is not configured. Check your .env file.' })
    setLoading(true); setMessage(null)
    const result = mode === 'reset' ? await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin }) : await supabase.auth.signInWithPassword({ email, password })
    setLoading(false); if (result.error) return setMessage({ type: 'error', text: result.error.message })
    if (mode === 'reset') setMessage({ type: 'success', text: 'Check your inbox for a password reset link.' }); else onSignedIn(result.data.session)
  }
  const reset = mode === 'reset'
  return <main className="auth-layout"><section className="auth-visual"><div className="visual-top"><Brand /><span className="secure-label"><Icon name="shield" size={15} /> Secure portal</span></div><div className="visual-copy"><div className="eyebrow">Built to keep you moving</div><h1>One connected home<br /><em>for every journey.</em></h1><p>Manage your people, routes and operations from one simple, dependable workspace.</p></div><div className="visual-footer"><span><span className="status-dot" /> Systems operational</span><span className="footer-divider" /> © 2024 Pedram Transportation</div></section><section className="auth-panel"><div className="auth-card"><Brand /><div className="card-heading">{reset ? <><button className="back-link" onClick={() => { setMode('login'); setMessage(null) }}><Icon name="back" size={16} /> Back to sign in</button><h2>Reset your password</h2><p>Enter your work email and we’ll send you a secure reset link.</p></> : <><div className="welcome-badge">Welcome back</div><h2>Sign in to your portal</h2><p>Use your Pedram Transportation account to continue.</p></>}</div>{message && <div className={`notice ${message.type}`}><Icon name={message.type === 'success' ? 'check' : 'shield'} size={17} /><span>{message.text}</span></div>}<form onSubmit={submit}><Field label="Work email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@pedramtransportation.com" icon="mail" />{!reset && <Field label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" icon="lock" />} {!reset && <div className="form-options"><label className="remember"><input type="checkbox" /> <span>Remember me</span></label><button type="button" className="text-button" onClick={() => { setMode('reset'); setMessage(null) }}>Forgot password?</button></div>}<button className="primary-button" disabled={loading}>{loading ? <span className="spinner" /> : reset ? 'Send reset link' : <>Sign in <Icon name="arrow" size={18} /></>}</button></form><div className="help-text">Need access to the portal? <a href="mailto:admin@pedramtransportation.com">Contact your administrator</a></div></div><div className="mobile-footer"><span className="status-dot" /> Systems operational</div></section></main>
}

function Dashboard({ session, profile, onSignOut }) {
  const role = profile?.role || 'driver'; const displayName = profile?.full_name || session?.user?.email?.split('@')[0] || 'there'; const roleLabel = roleLabels[role] || 'Team member'
  const cards = role === 'driver' ? [['Today’s route', 'No route assigned', 'Assignments will appear here'], ['Safety status', 'All clear', 'Your profile is up to date']] : [['Team overview', 'Ready for review', roleDescriptions[role] || 'Your workspace overview'], ['Operations', 'On track', 'No urgent items right now']]
  return <main className="dashboard"><header className="dashboard-header"><Brand /><div className="header-actions"><div className="user-chip"><span className="avatar">{displayName.charAt(0).toUpperCase()}</span><span><strong>{displayName}</strong><small>{roleLabel}</small></span></div><button className="logout-button" onClick={onSignOut}><Icon name="logout" size={17} /> Sign out</button></div></header><section className="dashboard-content"><div className="dashboard-intro"><div><div className="eyebrow">Your workspace</div><h1>Good morning, {displayName.split(' ')[0]}.</h1><p>Here’s what’s happening across your Pedram Transportation workspace.</p></div><span className="role-pill"><Icon name="shield" size={15} /> {roleLabel}</span></div><div className="dashboard-grid">{cards.map(([title, value, detail]) => <article className="dashboard-card" key={title}><span className="card-kicker">{title}</span><h3>{value}</h3><p>{detail}</p><span className="card-arrow"><Icon name="arrow" size={17} /></span></article>)}</div><article className="role-notice"><div className="notice-icon"><Icon name="shield" size={21} /></div><div><h3>Your access level</h3><p>You are signed in as <strong>{roleLabel}</strong>. Your access is managed by your organization administrator.</p></div></article></section></main>
}

function App() {
  const [session, setSession] = useState(null); const [profile, setProfile] = useState(null); const [checking, setChecking] = useState(true)
  useEffect(() => { if (!supabase) return setChecking(false); let active = true; supabase.auth.getSession().then(({ data }) => { if (active) { setSession(data.session); setChecking(false) } }); const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => { setSession(nextSession); setChecking(false) }); return () => { active = false; listener.subscription.unsubscribe() } }, [])
  useEffect(() => { if (!session || !supabase) return; supabase.from('profiles').select('full_name, role').eq('id', session.user.id).single().then(({ data }) => setProfile(data)) }, [session])
  return useMemo(() => { if (checking) return <div className="loading-screen"><Brand /><span className="spinner dark" /></div>; return session ? <Dashboard session={session} profile={profile} onSignOut={() => supabase?.auth.signOut()} /> : <Login onSignedIn={setSession} /> }, [checking, session, profile])
}

export default App
