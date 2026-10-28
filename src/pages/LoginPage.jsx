import { useState } from 'react'
import Brand from '../components/Brand'
import Field from '../components/Field'
import Icon from '../components/Icon'
import { supabase } from '../lib/supabase'

export default function LoginPage({ onSignedIn }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)
  const [resetMode, setResetMode] = useState(false)

  async function submit(event) {
    event.preventDefault()
    if (!supabase) return setMessage({ type: 'error', text: 'Supabase is not configured.' })
    setLoading(true)
    setMessage(null)
    const result = resetMode
      ? await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
      : await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (result.error) return setMessage({ type: 'error', text: result.error.message })
    if (resetMode) setMessage({ type: 'success', text: 'Check your inbox for a password reset link.' })
    else onSignedIn(result.data.session)
  }

  return <main className="auth-layout"><section className="auth-visual"><div className="visual-top"><Brand /><span className="secure-label">Secure portal</span></div><div className="visual-copy"><h1>Pedram<br /><em>Transportation</em></h1></div><div className="visual-footer"><span><span className="status-dot" /> Systems operational</span></div></section><section className="auth-panel"><div className="auth-card"><Brand /><div className="card-heading">{resetMode ? <><button className="back-link" onClick={() => { setResetMode(false); setMessage(null) }}><Icon name="back" size={16} /> Back to sign in</button><h2>Reset password</h2></> : <><h2>Sign in</h2></>}</div>{message && <div className={`notice ${message.type}`}><Icon name={message.type === 'success' ? 'check' : 'lock'} size={17} /><span>{message.text}</span></div>}<form onSubmit={submit}><Field label="Work email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@pedramtransportation.com" icon="mail" />{!resetMode && <Field label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" icon="lock" />} {!resetMode && <div className="form-options"><label className="remember"><input type="checkbox" /> <span>Remember me</span></label><button type="button" className="text-button" onClick={() => { setResetMode(true); setMessage(null) }}>Forgot password?</button></div>}<button className="primary-button" disabled={loading}>{loading ? <span className="spinner" /> : resetMode ? 'Send reset link' : 'Continue'}</button></form></div><div className="mobile-footer"><span className="status-dot" /> Systems operational</div></section></main>
}
