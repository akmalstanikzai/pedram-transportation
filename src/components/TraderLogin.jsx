import { useEffect, useRef, useState } from 'react'
import { KeyRound, Power } from 'lucide-react'
import AccountPasswordSettings from './AccountPasswordSettings'
import { explain, rpc } from '../lib/operations'
import { traderAccountAction } from '../lib/traderAccount'

export default function TraderLogin({ trader, language, onChanged, onBusyChange }) {
  const t = (en, fa) => language === 'fa' ? fa : en
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [current, setCurrent] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState('')
  const request = useRef(null)
  const pending = useRef(false)

  useEffect(() => {
    if (!trader.user_id) return
    let active = true
    traderAccountAction({ action: 'details', trader_id: trader.id })
      .then(result => { if (active) setCurrent(result) })
      .catch(failure => { if (active) setLoadError(failure) })
    return () => { active = false }
  }, [trader.id, trader.user_id, attempt])

  function setWorking(working) {
    pending.current = working
    setBusy(working)
    onBusyChange?.(working)
  }

  async function run(task) {
    if (pending.current) return
    setWorking(true)
    setError(null)
    setNotice('')
    try { await task() }
    catch (failure) { setError(failure) }
    finally { setWorking(false) }
  }

  function create(event) {
    event.preventDefault()
    void run(async () => {
      if (password !== confirm) throw new Error('PASSWORD_MISMATCH')
      const key = JSON.stringify({ login: login.trim(), password })
      if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() }
      const result = await traderAccountAction({ action: 'create', trader_id: trader.id, login: login.trim(), password, request_id: request.current.id })
      request.current = null
      setPassword('')
      setConfirm('')
      setNotice(result.vault_saved === true ? t('Login created and password saved.', 'حساب ورود ایجاد و رمز ذخیره شد.') :
        t('Login created. Set a new password once to make it viewable.', 'حساب ورود ایجاد شد. برای نمایش رمز، یک بار رمز جدید تعیین کنید.'))
      await onChanged()
    })
  }

  function toggle() {
    void run(async () => {
      await rpc('set_trader_account_enabled', { p_trader: trader.id, p_enabled: !current.enabled })
      setCurrent({ ...current, enabled: !current.enabled })
      await onChanged()
    })
  }

  return <div className="record-modal-body trader-login">
    <div className="trader-login-current">
      <h3><KeyRound size={20} aria-hidden="true" /><bdi>{trader.full_name}</bdi></h3>
      {current && <span data-enabled={current.enabled}>{current.enabled ? t('Enabled', 'فعال') : t('Disabled', 'غیرفعال')}</span>}
    </div>
    {error && <p className="registry-notice error" role="alert">{explain(error, language)}</p>}
    {notice && <p className="registry-notice success" role="status">{notice}</p>}
    {trader.user_id ? <>
      {loadError ? <>
        <p className="registry-notice error" role="alert">{explain(loadError, language)}</p>
        <button type="button" className="registry-secondary" onClick={()=>{setLoadError(null);setAttempt(value=>value+1)}}>{t('Retry', 'کوشش دوباره')}</button>
      </> : current ? <>
        <AccountPasswordSettings language={language} login={current.login} disabled={busy} onBusyChange={setWorking}
          savedLabel={t('Saved trader password', 'رمز عبور ذخیره‌شده تاجر')}
          onAction={(action, password)=>traderAccountAction({action,trader_id:trader.id,password})} />
        <button type="button" className="registry-secondary" disabled={busy} onClick={toggle}>
          <Power size={17} aria-hidden="true" />{current.enabled ? t('Disable login', 'غیرفعال کردن ورود') : t('Enable login', 'فعال کردن ورود')}
        </button>
      </> : <p role="status">{t('Loading…', 'در حال بارگیری…')}</p>}
    </> : <form className="registry-form trader-login-form" onSubmit={create}>
      <label className="wide"><span>{t('Email or username', 'ایمیل یا نام کاربری')} *</span><input required autoComplete="off" value={login} onChange={e=>setLogin(e.target.value)} disabled={busy} /></label>
      <label><span>{t('Password', 'رمز عبور')} *</span><input required type="password" minLength={8} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} disabled={busy} /></label>
      <label><span>{t('Confirm password', 'تکرار رمز')} *</span><input required type="password" minLength={8} autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)} disabled={busy} /></label>
      <div className="registry-form-actions"><button className="registry-primary" disabled={busy}>{t('Create login', 'ایجاد حساب ورود')}</button></div>
    </form>}
  </div>
}
