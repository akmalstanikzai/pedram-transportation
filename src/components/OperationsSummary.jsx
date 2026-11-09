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
    <div className="operations-summary">
      <table aria-labelledby="operations-heading">
        <tbody>
          <tr><th scope="row">{t('Active journeys', 'سفرهای در جریان')}</th><td><strong>{summary?.active ?? '—'}</strong></td></tr>
          {president && <tr>
            <th scope="row">{t('Traders with overdue balances', 'تاجران با بدهی معوق')}</th>
            <td><strong>{summary?.overdue ?? '—'}</strong><small>{t('Unpaid for over 30 days', 'بدهی پرداخت‌نشده بیشتر از ۳۰ روز')}</small></td>
          </tr>}
          <tr>
            <th scope="row">{t('Cash movement today', 'گردش پول امروز')}</th>
            <td>
              {summary?.cash.length ? <ul>{summary.cash.map(row => <li key={row.currency}>
                <b>{row.currency}</b> <span>{t('In', 'آمد')} {money(row.incoming)}</span> <span>{t('Out', 'رفت')} {money(row.outgoing)}</span>
              </li>)}</ul> : <strong>{summary ? t('No movement', 'بدون معامله') : '—'}</strong>}
            </td>
          </tr>
          <tr>
            <th scope="row">{t('Documents nearing expiry', 'اسناد نزدیک به انقضا')}</th>
            <td><strong>{summary?.expiring ?? '—'}</strong><small>{t('Due within 30 days', 'در ۳۰ روز آینده')}</small></td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
}
