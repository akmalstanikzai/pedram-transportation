import { useEffect, useState } from 'react'
import AccountPasswordSettings from './AccountPasswordSettings'
import { driverAccountAction } from '../lib/driverAccount'
import { explain } from '../lib/operations'

export default function DriverPassword({ driverId, language, onBusyChange, disabled = false }) {
  const t = (en, fa) => language === 'fa' ? fa : en
  const [login, setLogin] = useState(null)
  const [error, setError] = useState(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    driverAccountAction({ action: 'details', driver_id: driverId })
      .then(data => { if (active) setLogin(data.login) })
      .catch(failure => { if (active) setError(failure) })
    return () => { active = false }
  }, [driverId, attempt])

  if (error) return <>
    <p className="registry-notice error" role="alert">{explain(error, language)}</p>
    <button type="button" className="registry-secondary" disabled={disabled} onClick={()=>{setError(null);setAttempt(value=>value+1)}}>{t('Retry', 'کوشش دوباره')}</button>
  </>
  if (login === null) return <p role="status">{t('Loading…', 'در حال بارگیری…')}</p>
  return <AccountPasswordSettings language={language} login={login} disabled={disabled} onBusyChange={onBusyChange}
    savedLabel={t('Saved driver password', 'رمز عبور ذخیره‌شده راننده')}
    onAction={(action,password)=>driverAccountAction({action,driver_id:driverId,password})} />
}
