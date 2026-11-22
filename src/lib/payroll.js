import { cents } from './cashbook.js'
import { formatSolarHijri } from './solarHijri.js'

export const payrollMonths = {
  en: ['Hamal','Sawr','Jawza','Saratan','Asad','Sunbula','Mizan','Aqrab','Qaws','Jadi','Dalwa','Hut'],
  fa: ['حمل','ثور','جوزا','سرطان','اسد','سنبله','میزان','عقرب','قوس','جدی','دلو','حوت'],
}
export const payrollMoney = value => `${(value / 100).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})} AFN`
export const payrollMonthLabel = (year, month, language) => `${payrollMonths[language === 'fa' ? 'fa' : 'en'][month - 1]} ${year}`
export function payrollTotals(rows) {
  return rows.reduce((totals,row) => Object.fromEntries(Object.keys(totals).map(key => [key,totals[key]+cents(row[key])])), {salary:0,advances:0,paid:0,remaining:0})
}
export function payrollStatus(row, language) {
  const fa = language === 'fa'
  return cents(row.remaining) === 0 ? (fa ? 'پرداخت‌شده' : 'Paid') : cents(row.advances) + cents(row.paid) > 0 ? (fa ? 'پرداخت جزئی' : 'Partly paid') : (fa ? 'پرداخت‌نشده' : 'Unpaid')
}
export function payrollPayslip(row, year, month, language) {
  const t = (en,fa) => language === 'fa' ? fa : en
  return {
    language, title:t('Employee payslip','برگه معاش کارمند'), subtitle:payrollMonthLabel(year,month,language),
    sections:[
      {rows:[
        [t('Employee','کارمند'),row.name], [t('Contact','موبایل'),row.phone],
        [t('Monthly salary','معاش ماهانه'),payrollMoney(cents(row.salary))],
        [t('Salary advances','پیش‌پرداخت معاش'),payrollMoney(cents(row.advances))],
        [t('Salary settled','معاش تصفیه‌شده'),payrollMoney(cents(row.paid))],
        [t('Remaining salary','معاش باقی‌مانده'),payrollMoney(cents(row.remaining))],
        [t('Status','وضعیت'),payrollStatus(row,language)],
        ...(cents(row.deducted)>0 ? [
          [t('Salary paid in cash','معاش پرداخت‌شده نقدی'),payrollMoney(cents(row.cash_paid))],
          [t('Loan deducted','کسر قرض'),payrollMoney(cents(row.deducted))],
        ] : []),
      ]},
      {title:t('Payment history','تاریخچه پرداخت'),headers:[t('Date','تاریخ'),t('Type','نوع'),t('Account','حساب'),t('Amount','مبلغ'),t('Status','وضعیت')],numeric:[3],rows:row.payments.length ? row.payments.map(payment => [formatSolarHijri(payment.date),payment.kind === 'advance' ? t('Salary advance','پیش‌پرداخت معاش') : t('Salary payment','پرداخت معاش'),payment.account,payrollMoney(cents(payment.amount)),payment.reversed ? t('Reversed','معکوس‌شده') : t('Recorded','ثبت‌شده')]) : [['',t('No payments yet.','هنوز پرداختی ثبت نشده است.'),'','','']]},
    ],note:t('Reversed payments are excluded from totals. Salary settled includes cash and loan deductions.','پرداخت‌های معکوس‌شده در مجموع حساب نمی‌شوند. معاش تصفیه‌شده شامل پرداخت نقدی و کسر قرض است.'),
  }
}
