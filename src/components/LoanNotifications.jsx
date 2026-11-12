import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { kabulToday } from '../lib/cashbook'
import { dueLoanAlerts } from '../lib/loanNotifications'
import { formatSolarHijri } from '../lib/solarHijri'

export default function LoanNotifications({ language, userId }) {
  const t = (en, fa) => language === 'fa' ? fa : en
  const root = useRef(null)
  const inFlight = useRef(false)
  const [alerts, setAlerts] = useState([])
  const [open, setOpen] = useState(false)
  const [toast, setToast] = useState(false)
  const [error, setError] = useState(false)
  const todayCount = alerts.filter(item => item.timing === 'today').length

  const refresh = useCallback(async () => {
    if (inFlight.current || document.hidden) return
    inFlight.current = true
    try {
      const { data, error: loadError } = await supabase.rpc('open_cashbook_loans')
      if (loadError) throw loadError
      const today = kabulToday()
      const next = dueLoanAlerts(data, today)
      setAlerts(next)
      setError(false)
      const newToday = next.filter(item => item.timing === 'today' && !sessionStorage.getItem(`pedram-loan-notified:${userId}:${today}:${item.id}`))
      if (newToday.length) {
        for (const item of newToday) sessionStorage.setItem(`pedram-loan-notified:${userId}:${today}:${item.id}`, '1')
        setToast(true)
      }
    } catch {
      setError(true)
    } finally {
      inFlight.current = false
    }
  }, [userId])

  useEffect(() => {
    void Promise.resolve().then(refresh)
    const timer = window.setInterval(refresh, 60000)
    const onVisible = () => { if (!document.hidden) void refresh() }
    const onFocus = () => void refresh()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onFocus)
    window.addEventListener('pedram:cashbook-changed', onFocus)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('pedram:cashbook-changed', onFocus)
    }
  }, [refresh])

  useEffect(() => {
    if (!open) return undefined
    const onPointer = event => { if (!root.current?.contains(event.target)) setOpen(false) }
    const onKey = event => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function viewCashbook() {
    setOpen(false)
    setToast(false)
    window.location.hash = '/cashbook'
  }

  return <div className="loan-notification-root" ref={root}>
    <button type="button" className="loan-notification-button" aria-label={`${t('Loan notifications', 'اعلان‌های قرض')}${alerts.length ? ` (${alerts.length})` : ''}`} aria-expanded={open} aria-haspopup="dialog" onClick={() => { setOpen(value => !value); void refresh() }}>
      <Bell size={19} />{alerts.length > 0 && <span className="loan-notification-badge">{alerts.length > 99 ? '99+' : alerts.length}</span>}
    </button>
    {open && <div className="loan-notification-panel" role="dialog" aria-label={t('Loan notifications', 'اعلان‌های قرض')}>
      <div className="loan-notification-head"><strong>{t('Loan notifications', 'اعلان‌های قرض')}</strong><button type="button" aria-label={t('Close', 'بستن')} onClick={() => setOpen(false)}><X size={18} /></button></div>
      {error ? <p role="alert">{t('Could not load loan reminders. Try again.', 'اعلان‌های قرض بارگیری نشد. دوباره تلاش کنید.')}</p>
        : alerts.length ? <><p>{todayCount ? t(`${todayCount} due today`, `${todayCount} قرض امروز سررسید می‌شود`) : t('No loans due today.', 'امروز قرضی سررسید نمی‌شود.')}</p><ul>{alerts.map(item => <li key={item.id}><strong>{item.person || '—'} · #{item.receipt_number}</strong><span className={item.timing === 'overdue' ? 'loan-overdue' : 'loan-due-today'}>{item.timing === 'today' ? t('Due today', 'سررسید امروز') : t('Overdue', 'گذشته از موعد')} · {formatSolarHijri(item.due_date)}</span><small>{t('Remaining', 'باقی‌مانده')}: {Number(item.remaining).toLocaleString(language === 'fa' ? 'fa-AF' : 'en-US')} {item.currency}</small></li>)}</ul><button type="button" className="registry-secondary" onClick={viewCashbook}>{t('Open Cashbook', 'باز کردن روزنامچه')}</button></>
          : <p>{t('No loans due today or overdue.', 'قرض سررسیدشده یا گذشته از موعد وجود ندارد.')}</p>}
    </div>}
    {toast && todayCount > 0 && <div className="loan-notification-toast" role="status"><Bell size={18} /><span>{t(`${todayCount} loan${todayCount === 1 ? '' : 's'} due today`, `${todayCount} قرض امروز سررسید می‌شود`)}</span><button type="button" onClick={() => setToast(false)} aria-label={t('Dismiss', 'بستن')}><X size={16} /></button></div>}
  </div>
}
