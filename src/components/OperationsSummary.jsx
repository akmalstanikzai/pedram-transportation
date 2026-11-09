import { useEffect, useState } from 'react'
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
    <h1 id="operations-heading">{t('Operations overview', 'خلاصه عملیات')}</h1>
    {result?.error && <p role="alert" className="registry-notice error">{explain(result.error, language)}</p>}
    <dl className="operations-summary">
      <div>
        <dt>{t('Active journeys', 'سفرهای در جریان')}</dt>
        <dd><strong>{summary?.active ?? '—'}</strong></dd>
      </div>
      {president && <div>
        <dt>{t('Traders with overdue balances', 'تاجران با بدهی معوق')}</dt>
        <dd><strong>{summary?.overdue ?? '—'}</strong><small>{t('Unpaid for over 30 days', 'بدهی پرداخت‌نشده بیشتر از ۳۰ روز')}</small></dd>
      </div>}
      <div className="operations-cash">
        <dt>{t('Cash movement today', 'گردش پول امروز')}</dt>
        <dd>
          {summary?.cash.length ? <ul>{summary.cash.map(row => <li key={row.currency}>
            <b>{row.currency}</b> <span>{t('In', 'آمد')} {money(row.incoming)}</span> <span>{t('Out', 'رفت')} {money(row.outgoing)}</span>
          </li>)}</ul> : <strong>{summary ? t('No movement', 'بدون معامله') : '—'}</strong>}
        </dd>
      </div>
      <div>
        <dt>{t('Documents nearing expiry', 'اسناد نزدیک به انقضا')}</dt>
        <dd><strong>{summary?.expiring ?? '—'}</strong><small>{t('Due within 30 days', 'در ۳۰ روز آینده')}</small></dd>
      </div>
    </dl>
  </section>
}
