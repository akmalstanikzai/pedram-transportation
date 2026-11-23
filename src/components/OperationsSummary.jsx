import { useEffect, useState } from 'react'
import { ArrowLeftRight, ChevronDown, ChevronRight, CircleAlert, ClipboardCheck, Route, Truck } from 'lucide-react'
import { rpc, explain } from '../lib/operations'
import { supabase } from '../lib/supabase'
import { kabulToday } from '../lib/cashbook'
import { attentionForBooking, bookingAttention } from '../lib/bookingAttention'

async function loadAttention() {
  const today = kabulToday()
  const counts = { deliveries:0, departures:0 }
  for (let offset = 0; ; offset += 500) {
    const {data,error} = await supabase.from('bookings')
      .select('id,status,departure_date,booking_date,driver_delivered_at,handoff_confirmed_at,onward_driver_delivered_at')
      .is('archived_at',null).is('deleted_at',null).in('status',['confirmed','in_transit'])
      .order('id').range(offset,offset+499)
    if (error) throw error
    for (const row of data) {
      const kind = attentionForBooking(row,today)
      if (kind) counts[kind]++
    }
    if (data.length < 500) return counts
  }
}

export default function OperationsSummary({ language, president, onBookingAttention }) {
  const t = (en, fa) => language === 'fa' ? fa : en
  const [result, setResult] = useState(null)
  const [attention, setAttention] = useState(null)

  useEffect(() => {
    let active = true
    rpc('operations_summary', {}).then(data => {
      if (active) setResult({ data })
    }).catch(error => {
      if (active) setResult({ error })
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    let pending = false
    async function refresh() {
      if (pending || document.hidden) return
      pending = true
      try {
        const counts = await loadAttention()
        if (active) setAttention({counts})
      } catch (error) {
        if (active) setAttention({error})
      } finally { pending = false }
    }
    void refresh()
    const timer = window.setInterval(refresh,60000)
    window.addEventListener('focus',refresh)
    return () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener('focus',refresh)
    }
  }, [])

  const summary = result?.data
  const money = value => Number(value).toLocaleString('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })

  return <section className="operations-overview" aria-labelledby="operations-heading">
    <h2 id="operations-heading">{t('Operations overview', 'خلاصه عملیات')}</h2>
    {result?.error && <p role="alert" className="registry-notice error">{explain(result.error, language)}</p>}
    <div className="operations-attention" aria-labelledby="operations-attention-heading">
      <h3 id="operations-attention-heading">{t('Needs attention','نیاز به بررسی')}</h3>
      <div className="operations-attention-grid">
        {Object.entries(bookingAttention).map(([kind,label]) => {
          const StatusIcon = kind === 'deliveries' ? ClipboardCheck : Truck
          return <button key={kind} type="button" data-attention={kind} onClick={() => onBookingAttention(kind)}>
            <StatusIcon size={18} aria-hidden="true" />
            <span>{t(...label)}</span>
            <strong><bdi>{attention?.counts?.[kind] ?? '—'}</bdi></strong>
            <ChevronRight size={14} aria-hidden="true" className="attention-arrow" />
          </button>
        })}
      </div>
      {attention?.error && <p className="booking-help" role="status">{t('Could not load the counts. Open Bookings to review the list.','شمار ریکاردها بارگیری نشد. برای بررسی، بار نامه را باز کنید.')}</p>}
    </div>
    <dl className="operations-summary">
      <div className="operations-journeys">
        <dt><Route size={16} aria-hidden="true" />{t('Active journeys', 'سفرهای در جریان')}</dt>
        <dd><strong><bdi>{summary?.active ?? '—'}</bdi></strong></dd>
      </div>
      {president && <div className="operations-overdue">
        <dt><CircleAlert size={16} aria-hidden="true" />{t('Overdue traders', 'تاجران با بدهی معوق')}</dt>
        <dd><strong><bdi>{summary?.overdue ?? '—'}</bdi></strong></dd>
        <dd className="operations-overdue-note">{t('Unpaid for over 30 days', 'بدهی پرداخت‌نشده بیشتر از ۳۰ روز')}</dd>
      </div>}
      <div className="operations-cash">
        <dt className="sr-only">{t('Cash movement today', 'گردش پول امروز')}</dt>
        <dd>
          <details>
            <summary><ArrowLeftRight size={16} aria-hidden="true" /><span>{t('Cash movement today', 'گردش پول امروز')}</span><ChevronDown size={15} aria-hidden="true" className="operations-cash-arrow" /></summary>
            {summary?.cash?.length ? <table className="operations-cash-table" aria-label={t('Cash movement today', 'گردش پول امروز')}>
            <thead><tr>
              <th scope="col">{t('Currency', 'واحد پول')}</th>
              <th scope="col">{t('Money in', 'آمد')}</th>
              <th scope="col">{t('Money out', 'رفت')}</th>
            </tr></thead>
            <tbody>{summary.cash.map(row => <tr key={row.currency}>
              <th scope="row"><bdi dir="ltr">{row.currency}</bdi></th>
              <td><bdi dir="ltr">{money(row.incoming)}</bdi></td>
              <td><bdi dir="ltr">{money(row.outgoing)}</bdi></td>
            </tr>)}</tbody>
            </table> : <span className="operations-cash-empty">{summary ? t('No movement today', 'امروز گردش پول ثبت نشده است') : '—'}</span>}
          </details>
        </dd>
      </div>
    </dl>
  </section>
}
