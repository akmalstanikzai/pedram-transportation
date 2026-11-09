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
    <div className="cashbook-summary operations-summary">
      <div><span>{t('Active journeys', 'سفرهای در جریان')}</span><strong>{summary?.active ?? '—'}</strong></div>
      {president && <div>
        <span>{t('Traders with overdue balances', 'تاجران با بدهی معوق')}</span>
        <strong>{summary?.overdue ?? '—'}</strong>
        <small>{t('Unpaid charges older than 30 days', 'بدهی پرداخت‌نشده بیشتر از ۳۰ روز')}</small>
      </div>}
      <div>
        <span>{t('Cash movement today', 'گردش پول امروز')}</span>
        {summary?.cash.length ? summary.cash.map(row => <small key={row.currency}>
          <b>{row.currency}</b> · {t('In', 'آمد')} {money(row.incoming)} · {t('Out', 'رفت')} {money(row.outgoing)}
        </small>) : <strong>{summary ? t('No movement', 'بدون معامله') : '—'}</strong>}
      </div>
      <div>
        <span>{t('Documents nearing expiry', 'اسناد نزدیک به انقضا')}</span>
        <strong>{summary?.expiring ?? '—'}</strong>
        <small>{t('Due within 30 days', 'در ۳۰ روز آینده')}</small>
      </div>
    </div>
  </section>
}
