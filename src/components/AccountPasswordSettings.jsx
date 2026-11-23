import { useEffect, useRef, useState } from 'react'
import { Check, Eye, EyeOff } from 'lucide-react'
import { explain } from '../lib/operations'
import './AccountPasswordSettings.css'

export default function AccountPasswordSettings({ login, language, savedLabel, onAction, onBusyChange, disabled = false }) {
  const t = (en, fa) => language === 'fa' ? fa : en
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [stored, setStored] = useState('')
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)
  const pending = useRef(false)
  const locked = busy || disabled

  useEffect(() => {
    if (!stored) return
    const hide = () => setStored('')
    const timer = window.setTimeout(hide, 30000)
    window.addEventListener('blur', hide)
    return () => { window.clearTimeout(timer); window.removeEventListener('blur', hide) }
  }, [stored])

  async function run(task) {
    if (pending.current || disabled) return
    pending.current = true
    setBusy(true)
    setError(null)
    onBusyChange?.(true)
    try { await task() }
    catch (failure) { setError(failure) }
    finally {
      pending.current = false
      setBusy(false)
      onBusyChange?.(false)
    }
  }

  function reveal() {
    if (stored) { setStored(''); return }
    void run(async () => {
      const result = await onAction('vault')
      if (document.visibilityState === 'visible' && document.hasFocus()) setStored(result.password)
    })
  }

  function submit(event) {
    event.preventDefault()
    void run(async () => {
      setSaved(false)
      if (password.length < 8) throw new Error('PASSWORD_TOO_SHORT')
      if (password !== confirm) throw new Error('PASSWORD_MISMATCH')
      setStored('')
      await onAction('password', password)
      setPassword('')
      setConfirm('')
      setVisible(false)
      setSaved(true)
    })
  }

  return <div className="account-password-settings">
    <section className="branch-account-section">
      <label><span>{t('Email or username', 'ایمیل یا نام کاربری')}</span><input readOnly dir="auto" autoComplete="off" value={login} /></label>
      {stored && <input readOnly dir="ltr" autoComplete="off" aria-label={savedLabel} value={stored} />}
      <button type="button" className="registry-secondary" disabled={locked} aria-pressed={!!stored} onClick={reveal}>
        {stored ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        {stored ? t('Hide saved password', 'پنهان کردن رمز ذخیره‌شده') : t('Show saved password', 'نمایش رمز ذخیره‌شده')}
      </button>
    </section>
    {error && <p className="registry-notice error" role="alert">{explain(error, language)}</p>}
    {saved && <p className="registry-notice success" role="status">{t('Password saved.', 'رمز عبور ثبت شد.')}</p>}
    <details className="branch-account-section">
      <summary>{t('Change password', 'تغییر رمز عبور')}</summary>
      <form className="registry-form account-password-form" onSubmit={submit}>
        <label>
          <span>{t('New password', 'رمز عبور جدید')} *</span>
          <div className="branch-password-input">
            <input required minLength={8} disabled={locked} dir="ltr" type={visible ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={e=>{setPassword(e.target.value);setSaved(false)}} />
            <button type="button" disabled={locked} aria-label={visible ? t('Hide password', 'پنهان کردن رمز عبور') : t('Show password', 'نمایش رمز عبور')} aria-pressed={visible} onClick={()=>setVisible(!visible)}>
              {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </button>
          </div>
        </label>
        <label><span>{t('Confirm password', 'تکرار رمز عبور')} *</span><input required minLength={8} disabled={locked} dir="ltr" type={visible ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={e=>{setConfirm(e.target.value);setSaved(false)}} /></label>
        <small className="wide">{t('Use at least 8 characters.', 'حداقل ۸ حرف وارد کنید.')}</small>
        <div className="registry-form-actions"><button className="registry-primary" disabled={locked}>{busy ? <span className="spinner" /> : <Check size={18} aria-hidden="true" />}{t('Save password', 'ثبت رمز عبور')}</button></div>
      </form>
    </details>
  </div>
}
