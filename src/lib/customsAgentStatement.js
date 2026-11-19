import { cents } from './cashbook.js'
import { reportMoney } from './financialReports.js'
import { formatSolarHijri } from './solarHijri.js'

export function customsStatementView({ fees, payments }, { start, end, currency }) {
  const byCurrency = row => !currency || row.currency === currency
  const currentFees = fees.filter(byCurrency)
  const inPeriod = row => (!start || row.date >= start) && (!end || row.date <= end)
  const activity = payments.filter(row => byCurrency(row) && inPeriod(row))
  const units = [...new Set([...currentFees, ...activity].map(row => row.currency))].sort()
  const totals = units.map(unit => {
    const feesForUnit = currentFees.filter(row => row.currency === unit)
    const sum = key => feesForUnit.reduce((total, row) => total + cents(row[key]), 0)
    const periodPaid = activity.filter(row => row.currency === unit)
      .reduce((total, row) => total + (row.reversal ? -1 : 1) * cents(row.amount), 0)
    return { unit, agreed: sum('amount'), paid: sum('paid'), remaining: sum('remaining'), periodPaid }
  })
  return { fees: currentFees.filter(inPeriod), payments: activity, totals }
}

export const customsPaymentAccount = (row, t) => row.branch || t('Admin account', 'حساب مرکزی')

export function customsPaymentStatus(row, t) {
  if (row.reversal) return `${t('Reversal of', 'معامله معکوس رسید')} #${row.reverses_receipt}`
  if (row.reversed_by) return `${t('Reversed by', 'معکوس‌شده با')} #${row.reversed_by}`
  return row.corrected ? t('Amount corrected', 'مبلغ اصلاح شد') : ''
}

export function customsAgentReport(name, language, view, start, end) {
  const t = (en, fa) => language === 'fa' ? fa : en
  return {
    language,
    title: `${t('Commission agent statement', 'صورت حساب کمیشن کار')} · ${name}`,
    subtitle: `${start ? formatSolarHijri(start) : t('Beginning', 'آغاز')} – ${end ? formatSolarHijri(end) : t('All dates', 'همه تاریخ‌ها')}`,
    sections: [
      {
        title: t('Current balances', 'مانده فعلی'),
        headers: [t('Currency', 'واحد پول'), t('Agreed fees', 'حق‌الزحمه توافق‌شده'), t('Net paid', 'پرداخت خالص'), t('Remaining', 'باقی‌مانده')],
        rows: view.totals.map(({ unit, agreed, paid, remaining }) => [unit, reportMoney(agreed, unit), reportMoney(paid, unit), reportMoney(remaining, unit)]),
      }, {
        title: t('Fees in this period', 'حق‌الزحمه‌ها در این دوره'),
        headers: [t('Date', 'تاریخ'), t('Description / booking', 'شرح / بار نامه'), t('Agreed fee', 'حق‌الزحمه'), t('Remaining now', 'باقی‌مانده فعلی')],
        rows: view.fees.map(row => [formatSolarHijri(row.date), [row.description, row.booking_number != null && `#${row.booking_number}`].filter(Boolean).join(' · '),
          reportMoney(cents(row.amount), row.currency), reportMoney(cents(row.remaining), row.currency)]),
      }, {
        title: t('Payments and reversals in this period', 'پرداخت‌ها و معاملات معکوس در این دوره'),
        headers: [t('Date', 'تاریخ'), t('Receipt', 'رسید'), t('Account', 'حساب'), t('Description', 'شرح'), t('Amount', 'مبلغ')],
        rows: view.payments.map(row => [formatSolarHijri(row.date), `#${row.receipt_number}`, customsPaymentAccount(row, t),
          [row.description, customsPaymentStatus(row, t)].filter(Boolean).join(' · '), reportMoney((row.reversal ? -1 : 1) * cents(row.amount), row.currency)]),
      }, {
        title: t('Net paid in this period', 'پرداخت خالص در این دوره'),
        rows: view.totals.map(({ unit, periodPaid }) => [unit, reportMoney(periodPaid, unit)]),
      },
    ],
  }
}
