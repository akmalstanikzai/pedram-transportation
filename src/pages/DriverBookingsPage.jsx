import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, ArrowRight, BadgeCheck, Building2, CalendarDays, Check, CheckCheck, CheckCircle2, Clock3, History, IdCard, MapPin, Navigation, Package, Phone, RefreshCw, Truck, UserRound } from 'lucide-react'
import { rpc, explain } from '../lib/operations'
import { licenceWarning, mapHref, telephoneHref } from '../lib/driverPortal'
import { IconButton, Modal } from '../components/RecordTools'
import { formatSolarHijri } from '../lib/solarHijri'
import { bookingDue } from '../lib/bookingFinance'
import { reportMoney } from '../lib/financialReports'

function Contact({ icon: Icon, kind, title, name, phone, address, location, t }) {
  const telephone = telephoneHref(phone)
  return <section className="driver-contact" data-contact={kind}>
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
  const endsAtHandoff = job.has_handoff && job.leg === 1
  const startsAtHandoff = job.has_handoff && job.leg === 2
  const deliveredLabel = endsAtHandoff ? t('Reached transfer point', 'به محل انتقال رسیدم') : t('Delivered', 'بار تحویل شد')
  return <article className="driver-job" data-status={job.status}>
    <header className="driver-job-heading">
      <strong><Truck size={22} /><bdi dir="ltr">#{job.booking_number}</bdi>{job.has_handoff && <small>{endsAtHandoff ? t('First leg','مرحلهٔ اول') : t('Second leg','مرحلهٔ دوم')}</small>}</strong>
      <span className={`status-pill ${job.status}`}>{job.awaiting_handoff ? t('Awaiting handoff','منتظر انتقال') : status[job.status]}</span>
    </header>
    <div className="driver-route"><div><small><MapPin size={16} />{t('From', 'مبدأ')}</small><h2>{job.origin}</h2></div><ArrowRight className="driver-route-arrow" size={25} aria-hidden="true" /><div><small><Navigation size={16} />{t('To', 'مقصد')}</small><h2>{job.destination}</h2></div></div>
    {job.driver_commission && <div className="driver-job-facts">
      <div><span><small>{t('Commission remaining','کمیسیون باقی‌مانده')}</small><strong><bdi>{reportMoney(bookingDue(job.driver_commission.charged,job.driver_commission.paid),job.driver_commission.currency)}</bdi></strong></span></div>
    </div>}
    <div className="driver-job-facts">
      <div><CalendarDays size={22} /><span><small>{t('Departure / arrival', 'حرکت / رسیدن')}</small><bdi dir="ltr">{formatSolarHijri(job.departure_date)} → {formatSolarHijri(job.arrival_date)}</bdi></span></div>
      <div><Package size={22} /><span><strong>{job.goods || '—'}</strong><small>{[job.weight_tons ? `${job.weight_tons} ${t('tons', 'تن')}` : '', job.volume_m3 ? `${job.volume_m3} m³` : '', !job.weight_tons && !job.volume_m3 ? job.quantity : ''].filter(Boolean).join(' · ') || '—'}</small></span></div>
      <div><Truck size={22} /><span><strong><bdi>{job.vehicle?.plate_number || '—'}</bdi></strong><small>{[job.vehicle?.vehicle_type, job.vehicle?.color].filter(Boolean).join(' · ')}</small>{job.vehicle?.foreign_plate_number && <small>{t('Foreign plate', 'پلیت خارجی')}: <bdi>{job.vehicle.foreign_plate_number}</bdi></small>}</span></div>
      <div><Building2 size={22} /><span><strong>{branchName || '—'}</strong>{branchPhone && <a className="driver-dispatch-call" href={branchPhone}><Phone size={17} />{t('Call office', 'تماس با دفتر')}</a>}</span></div>
    </div>
    <div className="driver-contacts">
      <Contact icon={Package} kind="sender" title={startsAtHandoff ? t('Transfer pickup','دریافت بار در محل انتقال') : t('Sender', 'فرستنده')} name={job.sender_name} phone={job.sender_phone} address={job.sender_address} location={job.origin} t={t} />
      <Contact icon={UserRound} kind="receiver" title={endsAtHandoff ? t('Transfer point','محل انتقال') : t('Receiver', 'گیرنده')} name={job.receiver_name} phone={job.receiver_phone} address={job.receiver_address} location={job.destination} t={t} />
    </div>
    {['confirmed', 'in_transit'].includes(job.status) && <footer className="driver-job-footer">
      {job.status === 'confirmed' && (job.driver_accepted_at ? <span className="driver-report"><BadgeCheck size={22} />{t('Accepted', 'پذیرفته شد')}</span> : <button className="registry-primary" disabled={busy || blocked} onClick={() => onAction(job, 'accept')}><Check size={23} />{t('Accept job', 'پذیرفتن برنامه')}</button>)}
      {job.status === 'in_transit' && (job.driver_delivered_at ? <span className="driver-report"><Clock3 size={22} />{endsAtHandoff ? t('Arrival reported · waiting for handoff confirmation', 'رسیدن گزارش شد · منتظر تأیید انتقال') : t('Delivered · waiting for office confirmation', 'بار تحویل شد · منتظر تأیید دفتر')}</span> : <button className="registry-primary" disabled={busy || blocked} onClick={() => onAction(job, 'delivered')}><CheckCheck size={23} />{deliveredLabel}</button>)}
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
      await rpc('driver_booking_action', { p_id: job.id, p_action: action, p_expected: job.updated_at, ...(job.leg ? {p_leg:job.leg} : {}) })
      setDelivery(null)
      await refresh()
    } catch (e) { setError(e) }
    finally { actionPending.current = false; setBusy(false) }
  }

  const driver = data?.driver
  const warning = driver && licenceWarning(driver.license_expiry)
  const warningText = { missing: t('Licence expiry missing — contact the office.', 'تاریخ ختم لایسنس ثبت نشده است؛ با دفتر تماس بگیرید.'), expired: t('Licence expired — contact the office.', 'لایسنس منقضی شده است؛ با دفتر تماس بگیرید.'), soon: t('Licence expires within 30 days.', 'لایسنس در 30 روز آینده منقضی می‌شود.') }
  const activeJobs = (data?.bookings || []).filter(job => ['confirmed', 'in_transit'].includes(job.status))
  const pastJobs = (data?.bookings || []).filter(job => ['completed', 'cancelled'].includes(job.status))
    .sort((a, b) => (b.departure_date || '').localeCompare(a.departure_date || ''))
  const jobs = history ? pastJobs : activeJobs

  return <div className="driver-portal role-workspace" aria-busy={loading}>
    <header className="role-workspace-header">
      <div className="role-workspace-identity">
        <span className="role-workspace-icon"><Truck size={23} aria-hidden="true" /></span>
        <div><h1>{t('My jobs', 'سفرهای من')}</h1>{driver && <p><bdi>{driver.full_name}</bdi></p>}</div>
      </div>
      <div className="record-tools">{driver && <button type="button" className="driver-profile-button" onClick={() => setProfileOpen(true)}><IdCard size={17} />{t('My licence', 'لایسنس من')}</button>}<IconButton icon={RefreshCw} label={t('Refresh', 'تازه‌سازی')} onClick={refresh} disabled={refreshing || busy} /></div>
    </header>
    {error && <p role="alert" className="registry-notice error">{explain(error, language)}</p>}
    {loading ? <div className="driver-empty" role="status"><span className="spinner" /><span>{t('Loading…', 'در حال بارگیری…')}</span></div> : driver ? <>
      {warning && <p className="driver-licence-warning"><AlertTriangle size={21} /><span>{warningText[warning]}</span><bdi dir="ltr">{formatSolarHijri(driver.license_expiry, '')}</bdi></p>}
      <nav className="role-view-switch" aria-label={t('Jobs', 'سفرها')}>
        <button type="button" aria-pressed={!history} onClick={() => setHistory(false)}><Truck size={17} aria-hidden="true" />{t('Active jobs', 'سفرهای جاری')} <bdi>{activeJobs.length}</bdi></button>
        <button type="button" aria-pressed={history} onClick={() => setHistory(true)}><History size={17} aria-hidden="true" />{t('History', 'سابقه')} <bdi>{pastJobs.length}</bdi></button>
      </nav>
      {history && <p className="driver-history-note">{t('Last 20 completed or cancelled jobs.', '20 برنامه اخیر تکمیل‌شده یا لغوشده.')}</p>}
      {jobs.length ? <div className="driver-job-list">{jobs.map(job => <Job key={job.id} job={job} t={t} busy={busy} blocked={!!error || refreshing} onAction={act} />)}</div> : <div className="driver-empty"><CheckCircle2 size={40} /><strong>{history ? t('No previous jobs.', 'برنامه قبلی وجود ندارد.') : t('No jobs assigned yet.', 'هنوز برنامه‌ای تعیین نشده است.')}</strong></div>}
    </> : !error && <div className="driver-empty"><IdCard size={40} /><strong>{t('Contact the office to link your driver record.', 'برای وصل کردن مشخصات راننده به حساب تان، با دفتر تماس بگیرید.')}</strong></div>}
    {profileOpen && driver && <Modal title={t('My licence', 'لایسنس من')} onClose={() => setProfileOpen(false)} className="driver-portal-modal"><dl className="driver-licence-details">
      <div><dt><UserRound size={17} />{t('Driver', 'راننده')}</dt><dd><bdi>{driver.full_name}</bdi></dd></div>
      <div><dt><Phone size={17} />{t('Phone', 'موبایل')}</dt><dd><bdi dir="ltr">{driver.phone || '—'}</bdi></dd></div>
      <div><dt><IdCard size={17} />{t('Licence number', 'نمبر لایسنس')}</dt><dd><bdi>{driver.license_number || '—'}</bdi></dd></div>
      <div><dt><CalendarDays size={17} />{t('Expiry', 'تاریخ ختم')}</dt><dd><bdi dir="ltr">{formatSolarHijri(driver.license_expiry)}</bdi></dd></div>
    </dl></Modal>}
    {delivery && <Modal title={delivery.has_handoff && delivery.leg===1 ? t('Confirm arrival','تأیید رسیدن') : t('Confirm delivery', 'تأیید تحویل بار')} onClose={() => { setDelivery(null); setError(null) }} busy={busy}>
      <div className="record-modal-body"><p>{delivery.has_handoff && delivery.leg===1 ? t('Have you arrived with the cargo at the transfer point?', 'آیا با بار به محل انتقال رسیده‌اید؟') : t('Has the receiver received the goods?', 'آیا گیرنده بار را تحویل گرفته است؟')}</p>
        <strong><bdi dir="ltr">#{delivery.booking_number}</bdi> · {delivery.destination}</strong>
        {error && <p role="alert" className="registry-notice error">{explain(error, language)}</p>}
        <div className="registry-form-actions">
          <button disabled={busy} onClick={() => { setDelivery(null); setError(null) }}>{t('Back', 'برگشت')}</button>
          <button className="registry-primary" disabled={busy} onClick={() => act(delivery, 'delivered')}><CheckCheck size={22} />{delivery.has_handoff && delivery.leg===1 ? t('Yes, arrived','بله، رسیدم') : t('Yes, delivered', 'بله، تحویل شد')}</button>
        </div>
      </div>
    </Modal>}
  </div>
}
