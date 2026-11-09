import { useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, KeyRound, Power } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { explain, rpc } from '../lib/operations'

async function action(body) {
  const { data, error } = await supabase.functions.invoke('manage-trader-account', { body })
  if (error || data?.error) {
    let message = data?.error || error?.message || 'Account request failed'
    try { const response = await error?.context?.json(); message = response?.error || message } catch { /* Network errors have no response body. */ }
    throw new Error(message)
  }
  return data
}

export default function TraderLogin({ trader, language, onChanged }) {
  const t = (en, fa) => language === 'fa' ? fa : en
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [current, setCurrent] = useState(null)
  const [stored, setStored] = useState('')
  const [visible, setVisible] = useState(false)
  const [mode, setMode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const request = useRef(null)

  useEffect(() => {
    if (trader.user_id) void action({ action: 'details', trader_id: trader.id }).then(setCurrent).catch(e => setError(explain(e, language)))
  }, [trader.id, trader.user_id, language])

  async function create(event) {
    event.preventDefault()
    if (busy || password !== confirm) { setError(t('Passwords do not match.', 'رمزهای عبور یکسان نیست.')); return }
    setBusy(true); setError(''); setNotice('')
    try {
      const key = JSON.stringify({ login, password })
      if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() }
      const result = await action({ action: 'create', trader_id: trader.id, login: login.trim(), password, request_id: request.current.id })
      setPassword(''); setConfirm(''); setStored('')
      setNotice(`${t('Login created', 'حساب ورود ایجاد شد')}: ${result.login}`)
      await onChanged()
    } catch (e) { setError(explain(e, language)) }
    finally { setBusy(false) }
  }

  async function changePassword(event) {
    event.preventDefault()
    if (busy || password !== confirm) { setError(t('Passwords do not match.', 'رمزهای عبور یکسان نیست.')); return }
    setBusy(true); setError(''); setNotice('')
    try {
      await action({ action: 'password', trader_id: trader.id, password })
      setPassword(''); setConfirm(''); setStored(''); setMode('')
      setNotice(t('Password changed and saved.', 'رمز عبور تغییر کرد و ذخیره شد.'))
    } catch (e) { setError(explain(e, language)) }
    finally { setBusy(false) }
  }

  async function reveal() {
    setBusy(true); setError('')
    try { const result = await action({ action: 'vault', trader_id: trader.id }); setStored(result.password); setVisible(true) }
    catch (e) { setError(explain(e, language)) }
    finally { setBusy(false) }
  }

  async function toggle() {
    setBusy(true); setError('')
    try {
      await rpc('set_trader_account_enabled', { p_trader: trader.id, p_enabled: !current.enabled })
      setCurrent({ ...current, enabled: !current.enabled })
      await onChanged()
    } catch (e) { setError(explain(e, language)) }
    finally { setBusy(false) }
  }

  return <div className="record-modal-body trader-login">
    <h3><KeyRound size={20}/>{trader.full_name}</h3>
    <p className="booking-help">{t('This login shows only this trader’s profile and account.', 'این حساب فقط مشخصات و حساب همین تاجر را نشان می‌دهد.')}</p>
    {error && <p className="registry-notice error" role="alert">{error}</p>}
    {notice && <p className="registry-notice success" role="status">{notice}</p>}
    {trader.user_id ? <>
      {current && <p className="trader-login-current"><span>{t('Login', 'نام ورود')}: <strong>{current.login}</strong></span><span>{current.enabled ? t('Enabled', 'فعال') : t('Disabled', 'غیرفعال')}</span></p>}
      <div className="trader-login-actions">
        <button type="button" className="registry-secondary" disabled={busy || !current} onClick={() => { setMode(mode === 'change' ? '' : 'change'); setError('') }}><KeyRound size={17}/>{t('Change password', 'تغییر رمز عبور')}</button>
        <button type="button" className="registry-secondary" disabled={busy || !current} onClick={reveal}><Eye size={17}/>{t('View saved password', 'دیدن رمز ذخیره‌شده')}</button>
        <button type="button" className="registry-secondary" disabled={busy || !current} onClick={toggle}><Power size={17}/>{current?.enabled ? t('Disable login', 'غیرفعال کردن ورود') : t('Enable login', 'فعال کردن ورود')}</button>
      </div>
      {stored && <label className="trader-login-saved"><span>{t('Saved password', 'رمز ذخیره‌شده')}</span><span className="branch-password-input"><input readOnly dir="ltr" type={visible ? 'text' : 'password'} autoComplete="off" value={stored}/><button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? t('Hide password', 'پنهان کردن رمز') : t('Show password', 'نمایش رمز')}>{visible ? <EyeOff size={18}/> : <Eye size={18}/>}</button></span></label>}
      {mode === 'change' && <form className="registry-form trader-login-form" onSubmit={changePassword}>
        <label><span>{t('New password', 'رمز جدید')} *</span><input required type="password" minLength={8} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} disabled={busy}/></label>
        <label><span>{t('Confirm password', 'تکرار رمز')} *</span><input required type="password" minLength={8} autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} disabled={busy}/></label>
        <div className="registry-form-actions"><button type="button" disabled={busy} onClick={() => { setMode(''); setPassword(''); setConfirm('') }}>{t('Cancel', 'انصراف')}</button><button className="registry-primary" disabled={busy}>{t('Save password', 'ثبت رمز عبور')}</button></div>
      </form>}
    </> : <form className="registry-form trader-login-form" onSubmit={create}>
      <label><span>{t('Email or username', 'ایمیل یا نام کاربری')} *</span><input required autoComplete="off" value={login} onChange={e => setLogin(e.target.value)} disabled={busy}/></label>
      <label><span>{t('Password (at least 8 characters)', 'رمز عبور (حداقل ۸ حرف)')} *</span><input required type="password" minLength={8} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} disabled={busy}/></label>
      <label><span>{t('Confirm password', 'تکرار رمز')} *</span><input required type="password" minLength={8} autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} disabled={busy}/></label>
      <button className="registry-primary" disabled={busy}>{t('Create login', 'ایجاد حساب ورود')}</button>
    </form>}
  </div>
}
