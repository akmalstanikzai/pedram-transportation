import { useEffect, useState } from 'react'
import SolarHijriDateInput from '../components/SolarHijriDateInput'
import { kabulToday } from '../lib/cashbook'
import { rpc, explain } from '../lib/operations'
import { formatSolarHijri } from '../lib/solarHijri'

export default function AvailabilityPage({ language }) {
  const t = (en, fa) => language === 'fa' ? fa : en
  const [start, setStart] = useState(kabulToday)
  const [days, setDays] = useState(14)
  const [kind, setKind] = useState('vehicle')
  const [search, setSearch] = useState('')
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (!start) return
    let active = true
    rpc('fleet_schedule', { p_start: start, p_days: days }).then(data => {
      if (active) setResult({ start, days, data })
    }).catch(error => {
      if (active) setResult({ start, days, error })
    })
    return () => { active = false }
  }, [start, days])

  const current = result?.start === start && result?.days === days ? result : null
  const resources = current?.data?.resources.filter(row =>
    row.kind === kind && row.name.toLowerCase().includes(search.trim().toLowerCase())) ?? []
  const jobsByResource = new Map()
  for (const job of current?.data?.jobs ?? []) {
    if (job.kind !== kind) continue
    const jobs = jobsByResource.get(job.resource_id) ?? []
    jobs.push(job)
    jobsByResource.set(job.resource_id, jobs)
  }

  return <section className="registry-page">
    <div className="booking-page-header"><h1>{t('Fleet availability', 'دسترسی وسایط و رانندگان')}</h1></div>
    <div className="simple-cashbook-toolbar">
      <label><span>{t('From', 'از تاریخ')}</span>
        <SolarHijriDateInput required language={language} value={start} onChange={setStart} ariaLabel={t('From', 'از تاریخ')}/>
      </label>
      <label><span>{t('Show', 'نمایش')}</span>
        <select value={days} onChange={event => setDays(Number(event.target.value))}>
          {[7, 14, 30].map(value => <option key={value} value={value}>{value} {t('days', 'روز')}</option>)}
        </select>
      </label>
      <label><span>{t('Resource', 'نوع')}</span>
        <select value={kind} onChange={event => { setKind(event.target.value); setSearch('') }}>
          <option value="vehicle">{t('Vehicles', 'وسایط')}</option>
          <option value="driver">{t('Drivers', 'رانندگان')}</option>
        </select>
      </label>
      <label><span>{t('Search name or plate', 'جستجوی نام یا پلیت')}</span>
        <input value={search} onChange={event => setSearch(event.target.value)} />
      </label>
    </div>
    {!current && start && <p role="status">{t('Loading schedule…', 'در حال بارگیری برنامه…')}</p>}
    {current?.error && <p className="registry-notice error" role="alert">{explain(current.error, language)}</p>}
    {current?.data && <div className="simple-cashbook-list">
      <table>
        <thead><tr><th>{t('Vehicle / driver', 'واسطه / راننده')}</th><th>{t('Current status', 'وضعیت فعلی')}</th><th>{t('Scheduled work', 'کار برنامه‌ریزی‌شده')}</th></tr></thead>
        <tbody>{resources.map(resource => {
          const jobs = jobsByResource.get(resource.id) ?? []
          const state = {
            available: t('Available', 'آماده'), inactive: t('Inactive', 'غیرفعال'),
            under_repair: t('Under repair', 'در حال ترمیم'), assigned: t('Assigned', 'تعیین‌شده'),
            on_trip: t('On road', 'در راه'), unavailable: t('Unavailable', 'در دسترس نیست'),
          }[resource.status] ?? resource.status
          return <tr key={resource.id}>
            <th scope="row">{resource.name}</th>
            <td>{state}{resource.expires && <small className="operation-note">{t('Document expiry', 'انقضای سند')} · {formatSolarHijri(resource.expires)}</small>}</td>
            <td>{jobs.length ? <ul className="availability-jobs">{jobs.map((job, index) => <li key={index}>
              <strong>{job.number != null ? `#${job.number} · ${job.origin} → ${job.destination}` : t('Busy at another branch', 'مصروف در شعبه دیگر')}</strong>
              <small className="operation-note">{formatSolarHijri(job.starts)}{job.starts !== job.ends && ` – ${formatSolarHijri(job.ends)}`}
                {job.status === 'in_transit' && ` · ${t('On road', 'در راه')}`}</small>
            </li>)}</ul> : t('No bookings in this period', 'در این بازه بوکینگ ندارد')}</td>
          </tr>
        })}{!resources.length && <tr><td colSpan={3}>{t('No matching records.', 'ریکارد مطابق یافت نشد.')}</td></tr>}</tbody>
      </table>
    </div>}
  </section>
}
