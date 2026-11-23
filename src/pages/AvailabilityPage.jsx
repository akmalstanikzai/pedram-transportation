import { useEffect, useState } from 'react'
import { CalendarDays, CalendarX, RefreshCw, Search, Truck, UserRound } from 'lucide-react'
import SolarHijriDateInput from '../components/SolarHijriDateInput'
import { kabulToday } from '../lib/cashbook'
import { rpc, explain } from '../lib/operations'
import { formatSolarHijri } from '../lib/solarHijri'
import Icon from '../components/Icon'
import './AvailabilityPage.css'

export default function AvailabilityPage({ language, onBack }) {
  const t = (en, fa) => language === 'fa' ? fa : en
  const [start, setStart] = useState(kabulToday)
  const [days, setDays] = useState(14)
  const [kind, setKind] = useState('vehicle')
  const [search, setSearch] = useState('')
  const [result, setResult] = useState(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!start) return
    let active = true
    rpc('fleet_schedule', { p_start: start, p_days: days }).then(data => {
      if (active) setResult({ start, days, data })
    }).catch(error => {
      if (active) setResult({ start, days, error })
    })
    return () => { active = false }
  }, [start, days, attempt])

  const current = result?.start === start && result?.days === days ? result : null
  const query = search.trim().toLowerCase()
  const resources = current?.data?.resources.filter(row =>
    row.kind === kind && row.name.toLowerCase().includes(query)) ?? []
  const jobsByResource = new Map()
  for (const job of current?.data?.jobs ?? []) {
    if (job.kind !== kind) continue
    const jobs = jobsByResource.get(job.resource_id) ?? []
    jobs.push(job)
    jobsByResource.set(job.resource_id, jobs)
  }

  const isVehicle = kind === 'vehicle'
  const ResourceIcon = isVehicle ? Truck : UserRound
  const searchLabel = isVehicle ? t('Search by plate', 'جستجو با نمبر پلیت') : t('Search by driver name', 'جستجو با نام راننده')
  const statusLabels = {
    available: t('Available', 'آماده'), inactive: t('Inactive', 'غیرفعال'),
    under_repair: t('Under repair', 'در حال ترمیم'), assigned: t('Assigned', 'تعیین‌شده'),
    on_trip: t('On road', 'در راه'), unavailable: t('Unavailable', 'در دسترس نیست'),
  }
  const end = new Date(`${start}T00:00:00Z`)
  end.setUTCDate(end.getUTCDate() + days - 1)

  return <section className="registry-page availability-page" data-kind={kind}>
    <header className="availability-heading">
      <div className="availability-title">
        {onBack && <button type="button" className="module-back" onClick={onBack}><Icon name="back" size={16}/>{t('Back', 'بازگشت')}</button>}
        <h1>{t('Fleet availability', 'دسترسی وسایط و رانندگان')}</h1>
      </div>
      <div className="availability-switch" role="group" aria-label={t('Resource type', 'نوع') }>
        <button type="button" data-kind="vehicle" aria-pressed={isVehicle} onClick={() => { if (!isVehicle) { setKind('vehicle'); setSearch('') } }}>
          <Truck size={18} aria-hidden="true" />{t('Vehicles', 'وسایط')}
        </button>
        <button type="button" data-kind="driver" aria-pressed={!isVehicle} onClick={() => { if (isVehicle) { setKind('driver'); setSearch('') } }}>
          <UserRound size={18} aria-hidden="true" />{t('Drivers', 'رانندگان')}
        </button>
      </div>
    </header>
    <div className="availability-filters">
      <div className="availability-filter">
        <span>{t('From date', 'از تاریخ')}</span>
        <SolarHijriDateInput required language={language} value={start} onChange={setStart} ariaLabel={t('From date', 'از تاریخ')} />
      </div>
      <div className="availability-filter">
        <span>{t('Period (days)', 'مدت (روز)')}</span>
        <div className="availability-period" role="group" aria-label={t('Period in days', 'مدت به روز')}>
          {[7, 14, 30].map(value => <button key={value} type="button" aria-pressed={days === value} aria-label={`${value} ${t('days', 'روز')}`} onClick={() => setDays(value)}>{value}</button>)}
        </div>
      </div>
      <div className="availability-search">
        <Search size={18} aria-hidden="true" />
        <input type="search" aria-label={searchLabel} placeholder={searchLabel} value={search} onChange={event => setSearch(event.target.value)} />
      </div>
    </div>
    <section className="availability-schedule" aria-labelledby="availability-schedule-title">
      <header className="availability-schedule-heading">
        <h2 id="availability-schedule-title">{isVehicle ? t('Vehicle schedule', 'برنامه وسایط') : t('Driver schedule', 'برنامه رانندگان')}</h2>
        <span><CalendarDays size={15} aria-hidden="true" /><bdi dir="ltr">{formatSolarHijri(start)} – {formatSolarHijri(end.toISOString().slice(0, 10))}</bdi></span>
      </header>
      {!current && <p className="availability-message" role="status">{t('Loading schedule…', 'در حال بارگیری برنامه…')}</p>}
      {current?.error && <div className="availability-error">
        <p role="alert">{explain(current.error, language)}</p>
        <button type="button" onClick={() => { setResult(null); setAttempt(value => value + 1) }}><RefreshCw size={15} aria-hidden="true" />{t('Retry', 'کوشش دوباره')}</button>
      </div>}
      {current?.data && (resources.length ? <ul className="availability-list" role="list">
        {resources.map(resource => {
          const jobs = jobsByResource.get(resource.id) ?? []
          return <li className="availability-record" key={resource.id}>
            <div className="availability-identity">
              <span className="availability-resource-icon"><ResourceIcon size={18} aria-hidden="true" /></span>
              <h3><bdi>{resource.name}</bdi></h3>
              <span className="availability-status" data-status={resource.status}>
                <span className="sr-only">{t('Current status', 'وضعیت فعلی')} </span>{statusLabels[resource.status] ?? resource.status}
              </span>
              {resource.expires && <p className="availability-expiry">{t('Document expiry', 'انقضای سند')} · <time dateTime={resource.expires}><bdi dir="ltr">{formatSolarHijri(resource.expires)}</bdi></time></p>}
            </div>
            {jobs.length ? <ul className="availability-jobs" aria-label={t('Scheduled work', 'کار برنامه‌ریزی‌شده')} role="list">
              {jobs.map((job, index) => <li key={index}>
                <strong>{job.number != null ? <><bdi>#{job.number}</bdi> · <bdi>{job.origin}</bdi> <span className="availability-route-arrow">→</span> <bdi>{job.destination}</bdi></> : t('Busy at another branch', 'مصروف در شعبه دیگر')}</strong>
                <small><bdi dir="ltr">{formatSolarHijri(job.starts)}{job.starts !== job.ends && ` – ${formatSolarHijri(job.ends)}`}</bdi>
                  {job.status === 'in_transit' && <span className="availability-status" data-status="on_trip">{t('On road', 'در راه')}</span>}</small>
              </li>)}
            </ul> : <p className="availability-no-jobs"><CalendarX size={15} aria-hidden="true" />{t('No bookings in this period', 'در این بازه بار نامه ندارد')}</p>}
          </li>
        })}
      </ul> : <p className="availability-message" role="status">{query ? t('No matching records.', 'ریکارد مطابق یافت نشد.') : isVehicle ? t('No vehicles to display.', 'واسطه‌ای برای نمایش وجود ندارد.') : t('No drivers to display.', 'راننده‌ای برای نمایش وجود ندارد.')}</p>)}
    </section>
  </section>
}
