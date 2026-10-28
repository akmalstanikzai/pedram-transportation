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

  async function submit(event) {
    event.preventDefault()
    if (!supabase) return setMessage('Supabase is not configured.')
    setLoading(true)
    setMessage(null)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) return setMessage(error.message)
    onSignedIn(data.session)
  }

  return <main className="auth-layout"><section className="auth-visual"><div className="visual-copy"><h1>Pedram<br /><em>Transportation</em></h1></div></section><section className="auth-panel"><div className="auth-card"><Brand /><div className="card-heading"><div className="welcome-badge">Welcome back</div><h2>Sign in to your portal</h2><p>Use your Pedram Transportation account to continue.</p></div>{message && <div className="notice error"><Icon name="lock" size={17} /><span>{message}</span></div>}<form onSubmit={submit}><Field label="Work email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@pedramtransportation.com" icon="mail" /><Field label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" icon="lock" /><button className="primary-button" disabled={loading}>{loading ? <span className="spinner" /> : 'Continue'}</button></form></div></section></main>
}
