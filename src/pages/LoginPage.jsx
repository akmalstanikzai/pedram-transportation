import { useState } from 'react'
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

  return <main className="auth-layout"><section className="auth-visual"><div className="visual-copy"><h1>Pedram<br /><em>Transportation</em></h1></div></section><section className="auth-panel"><div className="auth-card">{message && <div className="notice error"><Icon name="lock" size={17} /><span>{message}</span></div>}<form onSubmit={submit}><Field type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" icon="mail" /><Field type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" icon="lock" /><button className="primary-button" disabled={loading}>{loading ? <span className="spinner" /> : 'Continue'}</button></form></div></section></main>
}
