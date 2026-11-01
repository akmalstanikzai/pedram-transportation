import { useState } from 'react'
import Brand from '../components/Brand'
import Field from '../components/Field'
import Icon from '../components/Icon'
import { getTranslation } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { normalizeLogin, errorText } from '../lib/operations'

export function LanguageSwitch({ language, onChange }) {
  return (
    <div className="language-switch" aria-label="Language">
      <button
        className={language === 'en' ? 'active' : ''}
        onClick={() => onChange('en')}
        type="button"
      >
        EN
      </button>
      <button
        className={language === 'fa' ? 'active' : ''}
        onClick={() => onChange('fa')}
        type="button"
      >
        دری
      </button>
    </div>
  )
}

export default function LoginPage({ language, onLanguageChange, authError }) {
  const text = getTranslation(language)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)

  async function submit(event) {
    event.preventDefault()
    if (loading) return
    if (!supabase) return setMessage('CONFIGURATION')
    setLoading(true)
    setMessage(null)
    try {
      const { email: loginEmail } = normalizeLogin(email)
      const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password })
      if (error)
        throw new Error(
          error.code === 'invalid_credentials'
            ? 'INVALID_CREDENTIALS'
            : error.code === 'user_banned'
              ? 'ACCOUNT_DISABLED'
              : error.message,
        )
    } catch (error) {
      setMessage(error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-visual">
        <div className="visual-copy">
          <h1>
            {text.pedram}
            <br />
            <em>{text.transportation}</em>
          </h1>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-language">
          <LanguageSwitch language={language} onChange={onLanguageChange} />
        </div>
        <div className="auth-card">
          <Brand text={text} />
          <div className="card-heading">
            <div className="welcome-badge">{text.welcomeBack}</div>
            <h2>{text.signInTitle}</h2>
            <p>{text.accountSubtitle}</p>
          </div>
          {(message || authError) && (
            <div role="alert" className="notice error">
              <Icon name="lock" size={17} />
              <span>{errorText(message || authError, language)}</span>
            </div>
          )}
          <form onSubmit={submit}>
            <Field
              label={text.email}
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={text.loginPlaceholder}
              icon="mail"
            />
            <Field
              label={text.password}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={text.passwordPlaceholder}
              icon="lock"
              showLabel={text.showPassword}
              hideLabel={text.hidePassword}
            />
            <button className="primary-button" disabled={loading}>
              {loading ? <span className="spinner" /> : text.continue}
            </button>
          </form>
        </div>
      </section>
    </main>
  )
}
