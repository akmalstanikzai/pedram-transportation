import { useEffect, useRef, useState } from 'react'
import { Check, Eye, EyeOff } from 'lucide-react'
import { driverAccountAction } from '../lib/driverAccount'
import { explain } from '../lib/operations'

export default function DriverPassword({ driverId, language, onBusyChange, disabled = false }) {
  const t = (en, fa) => language === 'fa' ? fa : en
  const [login, setLogin] = useState(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
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

  async function submit(event) {
    event.preventDefault()
    if (pending.current || disabled || login === null) return
    setError(null); setSaved(false)
    if (password.length < 8) { setError(new Error('PASSWORD_TOO_SHORT')); return }
    if (password !== confirm) { setError(new Error('PASSWORD_MISMATCH')); return }
    pending.current = true; setBusy(true); onBusyChange(true)
    try {
      await driverAccountAction({ action: 'password', driver_id: driverId, password })
      setPassword(''); setConfirm(''); setSaved(true)
    } catch (e) { setError(e) }
    finally { pending.current = false; setBusy(false); onBusyChange(false) }
  }

  return <form className="registry-form driver-password-form" onSubmit={submit}>
    {login !== null ? <label className="wide"><span>{t('Email or username', 'ایمیل یا نام کاربری')}</span><input readOnly dir="ltr" autoComplete="off" value={login} /></label> : !error && <p className="wide" role="status">{t('Loading…', 'در حال بارگیری…')}</p>}
    <label className="wide"><span>{t('New password (at least 8 characters)', 'رمز عبور جدید (حداقل 8 حرف)')} *</span><div className="branch-password-input"><input required minLength={8} disabled={busy || disabled || login === null} dir="ltr" type={visible ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={e => { setPassword(e.target.value); setSaved(false) }} /><button type="button" disabled={busy || disabled || login === null} aria-label={visible ? t('Hide password', 'پنهان کردن رمز عبور') : t('Show password', 'نمایش رمز عبور')} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={20} /> : <Eye size={20} />}</button></div></label>
    <label className="wide"><span>{t('Confirm password', 'تکرار رمز عبور')} *</span><input required minLength={8} disabled={busy || disabled || login === null} dir="ltr" type={visible ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={e => { setConfirm(e.target.value); setSaved(false) }} /></label>
    {error && <p className="wide registry-notice error" role="alert">{explain(error, language)}</p>}
    {saved && <p className="wide registry-notice success" role="status">{t('Password saved.', 'رمز عبور ثبت شد.')}</p>}
    <div className="registry-form-actions"><button className="registry-primary" disabled={busy || disabled || login === null}>{busy ? <span className="spinner" /> : <Check size={20} />}{t('Save password', 'ثبت رمز عبور')}</button></div>
  </form>
}
