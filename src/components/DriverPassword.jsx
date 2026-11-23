import { useEffect, useRef, useState } from 'react'
import { Check, Eye, EyeOff } from 'lucide-react'
import { driverAccountAction } from '../lib/driverAccount'
import { explain } from '../lib/operations'

export default function DriverPassword({ driverId, language, onBusyChange, disabled = false }) {
  const t = (en, fa) => language === 'fa' ? fa : en
  const [login, setLogin] = useState(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [stored, setStored] = useState('')
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)
  const pending = useRef(false)
  useEffect(() => {
    let active = true
    driverAccountAction({ action: 'details', driver_id: driverId }).then(data => { if (active) setLogin(data.login) }).catch(e => { if (active) setError(e) })
    return () => { active = false }
  }, [driverId])

  useEffect(() => {
    if (!stored) return
    const timeout = window.setTimeout(() => setStored(''), 30000)
    const hide = () => setStored('')
    window.addEventListener('blur', hide)
    return () => { window.clearTimeout(timeout); window.removeEventListener('blur', hide) }
  }, [stored])

  async function reveal() {
    if (stored) { setStored(''); return }
    if (pending.current || disabled || login === null) return
    pending.current = true; setBusy(true); onBusyChange?.(true); setError(null)
    try {
      const result = await driverAccountAction({ action: 'vault', driver_id: driverId })
      if (document.visibilityState === 'visible' && document.hasFocus()) setStored(result.password)
    } catch (failure) { setError(failure) }
    finally { pending.current = false; setBusy(false); onBusyChange?.(false) }
  }

  async function submit(event) {
    event.preventDefault()
    if (pending.current || disabled || login === null) return
    setError(null); setSaved(false)
    if (password.length < 8) { setError(new Error('PASSWORD_TOO_SHORT')); return }
    if (password !== confirm) { setError(new Error('PASSWORD_MISMATCH')); return }
    pending.current = true; setBusy(true); onBusyChange?.(true); setStored('')
    try {
      await driverAccountAction({ action: 'password', driver_id: driverId, password })
      setPassword(''); setConfirm(''); setVisible(false); setSaved(true)
    } catch (e) { setError(e) }
    finally { pending.current = false; setBusy(false); onBusyChange?.(false) }
  }

  return <div className="driver-password-settings">
    <section className="branch-account-section">
      {login !== null ? <label><span>{t('Email or username', 'ایمیل یا نام کاربری')}</span><input readOnly dir="auto" autoComplete="off" value={login} /></label> : !error && <p role="status">{t('Loading…', 'در حال بارگیری…')}</p>}
      {login !== null && <>
        {stored && <input readOnly dir="ltr" autoComplete="off" aria-label={t('Saved driver password', 'رمز عبور ذخیره‌شده راننده')} value={stored} />}
        <button type="button" className="registry-secondary" disabled={busy || disabled} aria-pressed={!!stored} onClick={reveal}>
          {stored ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
          {stored ? t('Hide saved password', 'پنهان کردن رمز ذخیره‌شده') : t('Show saved password', 'نمایش رمز ذخیره‌شده')}
        </button>
      </>}
    </section>
    {error && <p className="registry-notice error" role="alert">{explain(error, language)}</p>}
    {saved && <p className="registry-notice success" role="status">{t('Password saved.', 'رمز عبور ثبت شد.')}</p>}
    {login !== null && <details className="branch-account-section">
    <summary>{t('Change password', 'تغییر رمز عبور')}</summary>
    <form className="registry-form driver-password-form" onSubmit={submit}>
    <label className="wide"><span>{t('New password (at least 8 characters)', 'رمز عبور جدید (حداقل 8 حرف)')} *</span><div className="branch-password-input"><input required minLength={8} disabled={busy || disabled || login === null} dir="ltr" type={visible ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={e => { setPassword(e.target.value); setSaved(false) }} /><button type="button" disabled={busy || disabled || login === null} aria-label={visible ? t('Hide password', 'پنهان کردن رمز عبور') : t('Show password', 'نمایش رمز عبور')} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={20} /> : <Eye size={20} />}</button></div></label>
    <label className="wide"><span>{t('Confirm password', 'تکرار رمز عبور')} *</span><input required minLength={8} disabled={busy || disabled || login === null} dir="ltr" type={visible ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={e => { setConfirm(e.target.value); setSaved(false) }} /></label>
    <div className="registry-form-actions"><button className="registry-primary" disabled={busy || disabled || login === null}>{busy ? <span className="spinner" /> : <Check size={20} />}{t('Save password', 'ثبت رمز عبور')}</button></div>
    </form>
    </details>}
  </div>
}
