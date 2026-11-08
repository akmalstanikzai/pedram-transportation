import { useEffect, useRef, useState } from 'react'
import { Check, Eye, EyeOff, KeyRound } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { explain } from '../lib/operations'
import { Modal } from './RecordTools'
import { branchAccountError } from '../lib/branchAccountError'

async function accountAction(body) {
  const { data, error } = await supabase.functions.invoke('manage-branch-account', { body })
  if (error || data?.error) {
    throw await branchAccountError(data, error)
  }
  return data
}

export default function BranchPassword({ branch, language, onClose, onSaved }) {
  const t = (en, fa) => language === 'fa' ? fa : en
  const [login, setLogin] = useState('')
  const [newLogin, setNewLogin] = useState('')
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [visible, setVisible] = useState(false)
  const [storedPassword, setStoredPassword] = useState('')
  const [storedVisible, setStoredVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const pending = useRef(false)
  useEffect(() => {
    let active = true
    accountAction({ branch_id: branch.id, action: 'details' }).then(data => {
      if (active) { setLogin(data.login); setNewLogin(data.login); setReady(true) }
    }).catch(e => { if (active) setError(e) })
    return () => { active = false }
  }, [branch.id])

  async function submit(event) {
    event.preventDefault()
    if (pending.current || !ready) return
    setError(null)
    if (password.length < 8) { setError(new Error('PASSWORD_TOO_SHORT')); return }
    if (password !== confirm) { setError(new Error('PASSWORD_MISMATCH')); return }
    pending.current = true
    setBusy(true)
    try {
      await accountAction({ branch_id: branch.id, action: 'password', password })
      setPassword(''); setConfirm('')
      onSaved()
    } catch (e) { setError(e) }
    finally { pending.current = false; setBusy(false) }
  }

  async function revealStoredPassword() {
    if (pending.current || !ready) return
    setError(null); setBusy(true)
    try {
      const data = await accountAction({ branch_id: branch.id, action: 'vault' })
      setStoredPassword(data.password || '')
      setStoredVisible(true)
    } catch (e) { setError(e) }
    finally { setBusy(false) }
  }

  async function saveLogin(event) {
    event.preventDefault()
    if (!ready || !newLogin.trim() || newLogin.trim() === login) return
    setError(null); setBusy(true)
    try {
      const data = await accountAction({ branch_id: branch.id, action: 'login', login: newLogin })
      setLogin(data.login); setNewLogin(data.login)
    } catch (e) { setError(e) }
    finally { setBusy(false) }
  }

  return <Modal title={t('Branch password', 'رمز عبور شعبه')} onClose={onClose} busy={busy} className="branch-password-modal">
    <form className="registry-form branch-password-form" onSubmit={submit}>
      <strong className="wide branch-password-name"><KeyRound size={24} />{branch.name}</strong>
      {ready ? <div className="wide branch-login-editor"><label><span>{t('Email or username', 'ایمیل یا نام کاربری')}</span><input dir="ltr" autoComplete="off" disabled={busy} value={newLogin} onChange={event => setNewLogin(event.target.value)} /></label><button type="button" className="registry-secondary" disabled={busy || !newLogin.trim() || newLogin.trim() === login} onClick={event => void saveLogin(event)}>{t('Save login', 'ثبت نام ورود')}</button></div> : !error && <p role="status" className="wide">{t('Loading…', 'در حال بارگیری…')}</p>}
      {!storedPassword ? <div className="wide"><button type="button" className="registry-secondary" disabled={!ready || busy} onClick={revealStoredPassword}><Eye size={18}/>{t('View saved password', 'نمایش رمز عبور ذخیره‌شده')}</button><p className="booking-help">{t('Passwords saved before the vault was enabled must be reset once before they can be viewed here.', 'رمزهای ذخیره‌شده قبل از فعال شدن صندوق رمز، باید یک بار تغییر داده شوند تا در اینجا قابل نمایش گردند.')}</p></div> : <label className="wide"><span>{t('Saved password', 'رمز عبور ذخیره‌شده')}</span><div className="branch-password-input"><input readOnly dir="ltr" type={storedVisible ? 'text' : 'password'} autoComplete="off" value={storedPassword}/><button type="button" aria-label={storedVisible ? t('Hide password', 'پنهان کردن رمز عبور') : t('Show password', 'نمایش رمز عبور')} aria-pressed={storedVisible} onClick={() => setStoredVisible(!storedVisible)}>{storedVisible ? <EyeOff size={20} /> : <Eye size={20} />}</button></div></label>}
      <label className="wide"><span>{t('New password (at least 8 characters)', 'رمز عبور جدید (حداقل 8 حرف)')} *</span><div className="branch-password-input"><input required minLength={8} dir="ltr" type={visible ? 'text' : 'password'} autoComplete="new-password" disabled={!ready || busy} value={password} onChange={e => setPassword(e.target.value)} /><button type="button" disabled={!ready || busy} aria-label={visible ? t('Hide password', 'پنهان کردن رمز عبور') : t('Show password', 'نمایش رمز عبور')} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={20} /> : <Eye size={20} />}</button></div></label>
      <label className="wide"><span>{t('Confirm password', 'تکرار رمز عبور')} *</span><input required minLength={8} dir="ltr" type={visible ? 'text' : 'password'} autoComplete="new-password" disabled={!ready || busy} value={confirm} onChange={e => setConfirm(e.target.value)} /></label>
      {error && <p role="alert" className="wide registry-notice error">{explain(error, language)}</p>}
      <div className="registry-form-actions"><button type="button" disabled={busy} onClick={onClose}>{t('Cancel', 'انصراف')}</button><button className="registry-primary" disabled={!ready || busy}>{busy ? <span className="spinner" /> : <Check size={20} />}{t('Save password', 'ثبت رمز عبور')}</button></div>
    </form>
  </Modal>
}
