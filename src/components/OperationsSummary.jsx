import { useEffect, useState } from 'react'
import { ArrowLeftRight, CircleAlert, Route } from 'lucide-react'
import { rpc, explain } from '../lib/operations'

export default function OperationsSummary({ language, president }) {
  const t = (en, fa) => language === 'fa' ? fa : en
  const [result, setResult] = useState(null)

  useEffect(() => {
    let active = true
    rpc('operations_summary', {}).then(data => {
      if (active) setResult({ data })
    }).catch(error => {
      if (active) setResult({ error })
    })
    return () => { active = false }
  }, [])

  const summary = result?.data
  const money = value => Number(value).toLocaleString('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })

  return <section className="operations-overview" aria-labelledby="operations-heading">
    <h2 id="operations-heading">{t('Operations overview', 'خلاصه عملیات')}</h2>
    {result?.error && <p role="alert" className="registry-notice error">{explain(result.error, language)}</p>}
    <dl className="operations-summary">
      <div>
        <dt><Route size={16} aria-hidden="true" />{t('Active journeys', 'سفرهای در جریان')}</dt>
        <dd><strong><bdi>{summary?.active ?? '—'}</bdi></strong></dd>
      </div>
      {president && <div>
        <dt><CircleAlert size={16} aria-hidden="true" />{t('Traders with overdue balances', 'تاجران با بدهی معوق')}</dt>
        <dd><strong><bdi>{summary?.overdue ?? '—'}</bdi></strong><small>{t('Unpaid for over 30 days', 'بدهی پرداخت‌نشده بیشتر از ۳۰ روز')}</small></dd>
      </div>}
      <div className="operations-cash">
        <dt><ArrowLeftRight size={16} aria-hidden="true" />{t('Cash movement today', 'گردش پول امروز')}</dt>
        <dd>
           {summary?.cash?.length ? <ul>{summary.cash.map(row => <li key={row.currency}>
            <b>{row.currency}</b><span>{t('In', 'آمد')} <bdi>{money(row.incoming)}</bdi></span><span>{t('Out', 'رفت')} <bdi>{money(row.outgoing)}</bdi></span>
          </li>)}</ul> : <strong>{summary ? t('No movement', 'بدون معامله') : '—'}</strong>}
        </dd>
      </div>
    </dl>
  </section>
}
