import { useEffect, useRef, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { explain } from '../lib/operations'
import { normalizeLogin } from '../lib/loginIdentity'
import { Modal } from './RecordTools'
import { branchAccountError } from '../lib/branchAccountError'

async function accountAction(body) {
  const {data,error} = await supabase.functions.invoke('manage-branch-account',{body})
  if (error || data?.error) throw await branchAccountError(data,error)
  return data
}
export default function BranchPassword({branch, language, onClose, onUpdated}) {
  const t = (en,fa) => language === 'fa' ? fa : en
  const [login,setLogin] = useState(''), [ready,setReady] = useState(false)
  const [password,setPassword] = useState(''), [confirm,setConfirm] = useState('')
  const [visible,setVisible] = useState(false), [storedPassword,setStoredPassword] = useState('')
  const [storedVisible,setStoredVisible] = useState(false)
  const [busy,setBusy] = useState(false), [error,setError] = useState(null), [notice,setNotice] = useState('')
  const pending = useRef(false)
  useEffect(() => {
    let active = true
    accountAction({branch_id:branch.id,action:'details'}).then(data => {
      if (active) { setLogin(data.login); setReady(true) }
    }).catch(failure => { if (active) setError(failure) })
    return () => { active = false }
  },[branch.id])
  async function act(task) {
    if (pending.current) return
    pending.current = true; setBusy(true); setError(null); setNotice('')
    try { await task() } catch (failure) { setError(failure) }
    finally { pending.current = false; setBusy(false) }
  }
  function retry() {
    void act(async () => { const data = await accountAction({branch_id:branch.id,action:'details'}); setLogin(data.login); setReady(true) })
  }
  function saveLogin(event) {
    event.preventDefault()
    if (!ready) return
    void act(async () => {
      const candidate = normalizeLogin(login)
      const data = await accountAction({branch_id:branch.id,action:'login',login:candidate})
      setLogin(data.login); setNotice(t('Username saved. Use it for the next sign-in.','نام کاربری ثبت شد. برای ورود بعدی از آن استفاده کنید.'))
      void onUpdated?.()
    })
  }
  function savePassword(event) {
    event.preventDefault()
    if (!ready) return
    void act(async () => {
      if (password.length < 8) throw new Error('PASSWORD_TOO_SHORT')
      if (password !== confirm) throw new Error('PASSWORD_MISMATCH')
      setStoredPassword(''); setStoredVisible(false)
      await accountAction({branch_id:branch.id,action:'password',password})
      setPassword(''); setConfirm(''); setVisible(false)
      setNotice(branch.manager?.account_enabled ? t('Password saved. The manager can sign in with the new password.','رمز عبور ثبت شد. مدیر می‌تواند با رمز جدید وارد شود.') : t('Password saved. Enable the branch login using the power button to allow sign-in.','رمز ثبت شد. برای ورود، حساب شعبه را با دکمه روشن/خاموش فعال کنید.'))
      void onUpdated?.()
    })
  }
  function viewPassword() {
    if (storedPassword) { setStoredVisible(!storedVisible); return }
    void act(async () => {
      const data = await accountAction({branch_id:branch.id,action:'vault'})
      setStoredPassword(data.password); setStoredVisible(true)
    })
  }
  return <Modal title={t('Branch login','ورود شعبه')} busy={busy} onClose={onClose} className="branch-password-modal">
    <div className="record-modal-body branch-account-settings">
      <strong className="branch-account-name">{branch.name}</strong>
      {notice && <p className="registry-notice" role="status">{notice}</p>}
      {error && <p className="registry-notice error" role="alert">{explain(error,language)}</p>}
      {!ready ? <>{!error ? <p role="status">{t('Loading…','در حال بارگیری…')}</p> : <button className="registry-secondary" disabled={busy} onClick={retry}>{t('Retry','کوشش مجدد')}</button>}</> : <>
        <form className="branch-account-section" onSubmit={saveLogin}>
          <label><span>{t('Username or email','نام کاربری یا ایمیل')}</span><input dir="auto" required maxLength={120} autoComplete="off" autoCapitalize="none" spellCheck={false} disabled={busy} value={login} onChange={event => setLogin(event.target.value)}/></label>
          <small>{t('Dari, English, spaces and symbols are supported. Each account needs a different username.','حروف دری، انگلیسی، فاصله و علامت‌ها قابل استفاده است. نام کاربری هر حساب باید جدا باشد.')}</small>
          <button className="registry-primary" disabled={busy || !login.trim()}>{t('Save username','ثبت نام کاربری')}</button>
        </form>
        <section className="branch-account-section">
          <strong>{t('Current password','رمز عبور فعلی')}</strong>
          {storedPassword && <input readOnly dir="ltr" type={storedVisible ? 'text' : 'password'} autoComplete="off" aria-label={t('Saved password','رمز عبور ذخیره‌شده')} value={storedPassword}/>}
          <button type="button" className="registry-secondary" disabled={busy} onClick={viewPassword}>{storedVisible ? <EyeOff size={18}/> : <Eye size={18}/>} {storedVisible ? t('Hide password','پنهان کردن رمز') : t('Show password','نمایش رمز')}</button>
        </section>
        <details className="branch-account-section">
          <summary>{t('Change password','تغییر رمز عبور')}</summary>
          <form className="branch-account-password-form" onSubmit={savePassword}>
            <label><span>{t('New password','رمز عبور جدید')}</span><input required minLength={8} dir="ltr" type={visible ? 'text' : 'password'} autoComplete="new-password" disabled={busy} value={password} onChange={event => setPassword(event.target.value)}/></label>
            <label><span>{t('Repeat password','تکرار رمز عبور')}</span><input required minLength={8} dir="ltr" type={visible ? 'text' : 'password'} autoComplete="new-password" disabled={busy} value={confirm} onChange={event => setConfirm(event.target.value)}/></label>
            <label className="branch-password-show"><input type="checkbox" checked={visible} disabled={busy} onChange={event => setVisible(event.target.checked)}/><span>{t('Show passwords','نمایش رمزها')}</span></label>
            <small>{t('Use at least 8 characters.','حداقل 8 حرف وارد کنید.')}</small>
            <button className="registry-primary" disabled={busy}>{t('Save password','ثبت رمز عبور')}</button>
          </form>
        </details>
      </>}
      <button type="button" className="registry-secondary" disabled={busy} onClick={onClose}>{t('Close','بستن')}</button>
    </div>
  </Modal>
}
