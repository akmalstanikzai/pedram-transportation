import { useState } from 'react'
import Brand from '../components/Brand'
import Field from '../components/Field'
import Icon from '../components/Icon'
import { getTranslation } from '../lib/i18n'
import { supabase } from '../lib/supabase'

export function LanguageSwitch({ language, onChange }) {
  return <div className="language-switch" aria-label="Language"><button className={language === 'en' ? 'active' : ''} onClick={() => onChange('en')} type="button">EN</button><button className={language === 'fa' ? 'active' : ''} onClick={() => onChange('fa')} type="button">دری</button></div>
}

export default function LoginPage({ language, onLanguageChange, onSignedIn }) {
  const text = getTranslation(language)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)

  async function submit(event) {
    event.preventDefault()
    if (!supabase) return setMessage(text.configurationError)
    setLoading(true)
    setMessage(null)
    const normalizedLogin = email.trim().toLowerCase()
    const loginEmail = normalizedLogin.includes('@') ? normalizedLogin : `${normalizedLogin}@users.pedram.local`
    const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail, password })
    setLoading(false)
    if (error) return setMessage(text.loginError)
    onSignedIn(data.session)
  }

  return <main className="auth-layout"><section className="auth-visual"><div className="visual-copy"><h1>{text.pedram}<br /><em>{text.transportation}</em></h1></div></section><section className="auth-panel"><div className="auth-language"><LanguageSwitch language={language} onChange={onLanguageChange} /></div><div className="auth-card"><Brand text={text} /><div className="card-heading"><div className="welcome-badge">{text.welcomeBack}</div><h2>{text.signInTitle}</h2><p>{text.accountSubtitle}</p></div>{message && <div className="notice error"><Icon name="lock" size={17} /><span>{message}</span></div>}<form onSubmit={submit}><Field label={text.email} type="text" value={email} onChange={e => setEmail(e.target.value)} placeholder={text.loginPlaceholder} icon="mail" /><Field label={text.password} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={text.passwordPlaceholder} icon="lock" showLabel={text.showPassword} hideLabel={text.hidePassword} /><button className="primary-button" disabled={loading}>{loading ? <span className="spinner" /> : text.continue}</button></form></div></section></main>
}
