import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, ArrowRight, BadgeCheck, Building2, CalendarDays, Check, CheckCheck, CheckCircle2, Clock3, History, IdCard, MapPin, Navigation, Package, Phone, RefreshCw, Truck, UserRound } from 'lucide-react'
import { rpc, explain } from '../lib/operations'
import { licenceWarning, mapHref, telephoneHref } from '../lib/driverPortal'
import { IconButton, Modal } from '../components/RecordTools'

function Contact({ icon: Icon, title, name, phone, address, location, t }) {
  const telephone = telephoneHref(phone)
  return <section className="driver-contact">
    <h3><Icon size={20} />{title}</h3>
    <strong>{name || '—'}</strong>
    {phone && <bdi dir="ltr">{phone}</bdi>}
    <p>{address || location || '—'}</p>
    <div className="driver-contact-actions">
      {telephone && <a href={telephone} aria-label={`${t('Call', 'تماس')} · ${name || title}`}><Phone size={21} />{t('Call', 'تماس')}</a>}
      {(location || address) && <a href={mapHref(location, address)} target="_blank" rel="noreferrer" aria-label={`${t('Map', 'نقشه')} · ${title}`}><MapPin size={21} />{t('Map', 'نقشه')}</a>}
    </div>
  </section>
}

function Job({ job, t, busy, blocked, onAction }) {
  const status = { confirmed: t('Ready', 'آماده'), in_transit: t('On road', 'در راه'), completed: t('Completed', 'تکمیل‌شده'), cancelled: t('Cancelled', 'لغوشده') }
  const branchPhone = telephoneHref(job.branch?.phone)
  const branchName = job.branch?.name === 'Head office' ? t('Head office', 'دفتر مرکزی') : job.branch?.name
  return <article className="driver-job">
    <header className="driver-job-heading"><strong><Truck size={22} /><bdi dir="ltr">#{job.booking_number}</bdi></strong><span className={`status-pill ${job.status}`}>{status[job.status]}</span></header>
    <div className="driver-route"><div><small><MapPin size={16} />{t('From', 'مبدأ')}</small><h2>{job.origin}</h2></div><ArrowRight className="driver-route-arrow" size={25} aria-hidden="true" /><div><small><Navigation size={16} />{t('To', 'مقصد')}</small><h2>{job.destination}</h2></div></div>
    <div className="driver-job-facts">
      <div><CalendarDays size={22} /><span><small>{t('Departure / arrival', 'حرکت / رسیدن')}</small><bdi dir="ltr">{job.departure_date || '—'} → {job.arrival_date || '—'}</bdi></span></div>
      <div><Package size={22} /><span><strong>{job.goods || '—'}</strong><small>{[job.weight_tons ? `${job.weight_tons} ${t('tons', 'تن')}` : '', job.volume_m3 ? `${job.volume_m3} m³` : '', !job.weight_tons && !job.volume_m3 ? job.quantity : ''].filter(Boolean).join(' · ') || '—'}</small></span></div>
      <div><Truck size={22} /><span><strong><bdi>{job.vehicle?.plate_number || '—'}</bdi></strong><small>{[job.vehicle?.vehicle_type, job.vehicle?.color].filter(Boolean).join(' · ')}</small>{job.vehicle?.foreign_plate_number && <small>{t('Foreign plate', 'پلیت خارجی')}: <bdi>{job.vehicle.foreign_plate_number}</bdi></small>}</span></div>
      <div><Building2 size={22} /><span><strong>{branchName || '—'}</strong>{branchPhone && <a className="driver-dispatch-call" href={branchPhone}><Phone size={17} />{t('Call office', 'تماس با دفتر')}</a>}</span></div>
    </div>
    <div className="driver-contacts">
      <Contact icon={Package} title={t('Sender', 'فرستنده')} name={job.sender_name} phone={job.sender_phone} address={job.sender_address} location={job.origin} t={t} />
      <Contact icon={UserRound} title={t('Receiver', 'گیرنده')} name={job.receiver_name} phone={job.receiver_phone} address={job.receiver_address} location={job.destination} t={t} />
    </div>
    {['confirmed', 'in_transit'].includes(job.status) && <footer className="driver-job-footer">
      {job.status === 'confirmed' && (job.driver_accepted_at ? <span className="driver-report"><BadgeCheck size={22} />{t('Accepted', 'پذیرفته شد')}</span> : <button className="registry-primary" disabled={busy || blocked} onClick={() => onAction(job, 'accept')}><Check size={23} />{t('Accept job', 'پذیرفتن برنامه')}</button>)}
      {job.status === 'in_transit' && (job.driver_delivered_at ? <span className="driver-report"><Clock3 size={22} />{t('Delivered · waiting for office confirmation', 'بار تحویل شد · منتظر تأیید دفتر')}</span> : <button className="registry-primary" disabled={busy || blocked} onClick={() => onAction(job, 'delivered')}><CheckCheck size={23} />{t('Delivered', 'بار تحویل شد')}</button>)}
    </footer>}
  </article>
}

export default function DriverBookingsPage({ language }) {
  const t = (en, fa) => language === 'fa' ? fa : en
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [history, setHistory] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [delivery, setDelivery] = useState(null)
  const readSequence = useRef(0)
  const actionPending = useRef(false)
  const invalidateReads = useCallback(() => { readSequence.current++ }, [])
  const refresh = useCallback(async () => {
    const sequence = ++readSequence.current
    setRefreshing(true)
    try {
      const result = await rpc('get_driver_portal')
      if (sequence === readSequence.current) { setData(result); setError(null) }
    } catch (e) { if (sequence === readSequence.current) setError(e) }
    finally { if (sequence === readSequence.current) { setLoading(false); setRefreshing(false) } }
  }, [])
  useEffect(() => {
    const update = () => { if (!document.hidden && !actionPending.current) void refresh() }
    void Promise.resolve().then(refresh)
    const timer = window.setInterval(update, 30000)
    window.addEventListener('focus', update)
    return () => { clearInterval(timer); window.removeEventListener('focus', update); invalidateReads() }
  }, [refresh, invalidateReads])

  async function act(job, action) {
    if (actionPending.current) return
    if (action === 'delivered' && !delivery) { setDelivery(job); return }
    actionPending.current = true
    setBusy(true)
    setError(null)
    // Ignore an older background read that could replace the action's fresh result.
    invalidateReads()
    setRefreshing(false)
    try {
      await rpc('driver_booking_action', { p_id: job.id, p_action: action, p_expected: job.updated_at })
      setDelivery(null)
      await refresh()
    } catch (e) { setError(e) }
    finally { actionPending.current = false; setBusy(false) }
  }

  const driver = data?.driver
  const warning = driver && licenceWarning(driver.license_expiry)
  const warningText = { missing: t('Licence expiry missing — contact the office.', 'تاریخ ختم لایسنس ثبت نشده است؛ با دفتر تماس بگیرید.'), expired: t('Licence expired — contact the office.', 'لایسنس منقضی شده است؛ با دفتر تماس بگیرید.'), soon: t('Licence expires within 30 days.', 'لایسنس در 30 روز آینده منقضی می‌شود.') }
  const jobs = (data?.bookings || []).filter(job => history ? ['completed', 'cancelled'].includes(job.status) : ['confirmed', 'in_transit'].includes(job.status))
  if (history) jobs.sort((a, b) => (b.departure_date || '').localeCompare(a.departure_date || ''))

  return <div className="driver-portal" aria-busy={loading}>
    <div className="driver-page-heading"><h1><Truck size={28} />{t('My jobs', 'برنامه‌های من')}</h1><div className="record-tools">{driver && <button className="driver-profile-button" onClick={() => setProfileOpen(true)}><IdCard size={24} />{t('My licence', 'لایسنس من')}</button>}<IconButton icon={RefreshCw} label={t('Refresh', 'تازه‌سازی')} onClick={refresh} disabled={refreshing || busy} /></div></div>
    {error && <p role="alert" className="registry-notice error">{explain(error, language)}</p>}
    {loading ? <div className="driver-empty" role="status"><span className="spinner" /><span>{t('Loading…', 'در حال بارگیری…')}</span></div> : driver ? <>
      {warning && <p className="driver-licence-warning"><AlertTriangle size={21} /><span>{warningText[warning]}</span><bdi dir="ltr">{driver.license_expiry || ''}</bdi></p>}
      <nav className="driver-tabs" aria-label={t('Jobs', 'برنامه‌ها')}><button aria-pressed={!history} onClick={() => setHistory(false)}><Truck size={22} />{t('Jobs', 'برنامه‌ها')}</button><button aria-pressed={history} onClick={() => setHistory(true)}><History size={22} />{t('History', 'سابقه')}</button></nav>
      {history && <p className="driver-history-note">{t('Last 20 completed or cancelled jobs.', '20 برنامه اخیر تکمیل‌شده یا لغوشده.')}</p>}
      {jobs.length ? <div className="driver-job-list">{jobs.map(job => <Job key={job.id} job={job} t={t} busy={busy} blocked={!!error || refreshing} onAction={act} />)}</div> : <div className="driver-empty"><CheckCircle2 size={40} /><strong>{history ? t('No previous jobs.', 'برنامه قبلی وجود ندارد.') : t('No jobs assigned yet.', 'هنوز برنامه‌ای تعیین نشده است.')}</strong></div>}
    </> : !error && <div className="driver-empty"><IdCard size={40} /><strong>{t('Contact the office to link your driver record.', 'برای وصل کردن مشخصات راننده به حساب تان، با دفتر تماس بگیرید.')}</strong></div>}
    {profileOpen && driver && <Modal title={t('My licence', 'لایسنس من')} onClose={() => setProfileOpen(false)}><dl className="driver-licence-details"><dt><UserRound size={21} />{t('Driver', 'راننده')}</dt><dd>{driver.full_name}</dd><dt><Phone size={21} />{t('Phone', 'موبایل')}</dt><dd><bdi dir="ltr">{driver.phone || '—'}</bdi></dd><dt><IdCard size={21} />{t('Licence number', 'نمبر لایسنس')}</dt><dd><bdi>{driver.license_number || '—'}</bdi></dd><dt><CalendarDays size={21} />{t('Expiry', 'تاریخ ختم')}</dt><dd><bdi dir="ltr">{driver.license_expiry || '—'}</bdi></dd></dl></Modal>}
    {delivery && <Modal title={t('Confirm delivery', 'تأیید تحویل بار')} onClose={() => { setDelivery(null); setError(null) }} busy={busy}><div className="record-modal-body"><p>{t('Has the receiver received the goods?', 'آیا گیرنده بار را تحویل گرفته است؟')}</p><strong><bdi dir="ltr">#{delivery.booking_number}</bdi> · {delivery.destination}</strong>{error && <p role="alert" className="registry-notice error">{explain(error, language)}</p>}<div className="registry-form-actions"><button disabled={busy} onClick={() => { setDelivery(null); setError(null) }}>{t('Back', 'برگشت')}</button><button className="registry-primary" disabled={busy} onClick={() => act(delivery, 'delivered')}><CheckCheck size={22} />{t('Yes, delivered', 'بله، تحویل شد')}</button></div></div></Modal>}
  </div>
}
