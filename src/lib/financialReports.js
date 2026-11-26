import { cents, kabulToday } from './cashbook.js'
import { formatSolarHijri } from './solarHijri.js'
import { bookingBalances, traderBalance } from './traderAccounts.js'
import { bookingDue } from './bookingFinance.js'
import { managedChargeLabel } from './managedBookings.js'

const translate = language => (en, fa) => language === 'fa' ? fa : en
export const reportMoney = (amount, currency) => `${(amount / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`

export function managedStatementSections({ charges, balances, payments }, language) {
  const t = (en,fa) => language === 'fa' ? fa : en
  const amount = (value,currency) => reportMoney(cents(value),currency)
  return [
    { key:'balances', title:t('Balance by currency','باقی‌مانده به تفکیک واحد پول'),
      headers:[t('Currency','واحد'),t('Total charged','کل بدهی'),t('Paid by trader','پرداخت تاجر'),t('Remaining','باقی‌مانده')],
      widths:[16,28,28,28], numeric:[1,2,3], rows:(balances??[]).map(row=>[
        row.currency,amount(row.charged,row.currency),amount(row.paid,row.currency),reportMoney(bookingDue(row.charged,row.paid),row.currency),
      ]),
    },
    { key:'charges', title:t('Booking charges','مصارف و کمیشن'),
      headers:[t('Charge','نوع مصرف'),t('Amount','مبلغ'),t('Expense paid on','تاریخ تادیهٔ مصرف')],
      widths:[43,30,27], numeric:[1], rows:charges.map(row=>[
        managedChargeLabel(row,language),amount(row.amount,row.currency),row.paid_on ? formatSolarHijri(row.paid_on) : '—',
      ]),
    },
    ...(payments ? [{
      key:'payments', title:t('Trader payments','پرداخت‌های تاجر'),
      headers:[t('Date / receipt','تاریخ / رسید'),t('Details','تفصیلات'),t('Amount','مبلغ')],
      widths:[28,40,32], numeric:[2], rows:payments.map(row=>[
        [formatSolarHijri(row.date),row.receipt_number ? '#'+row.receipt_number : null].filter(Boolean).join(' · '),
        row.description,amount(row.direction==='out' ? -Number(row.amount) : row.amount,row.currency),
      ]),
    }] : []),
  ]
}

export function transactionNotes(row, language) {
  const t = translate(language)
  return [
    row.loan_due_date && `${t('Loan deadline', 'مهلت قرض')}: ${formatSolarHijri(row.loan_due_date)}`,
    row.loan_due_date && row.loan_remaining != null && !row.reversed_by && `${t('Loan remaining now', 'باقی‌مانده فعلی قرض')}: ${reportMoney(cents(row.loan_remaining), row.currency)}`,
    row.loan_repayment_entry_id && t('Loan repayment', 'بازپرداخت قرض'),
    row.reversed_by && t('Reversed', 'معکوس‌شده'),
    row.reversal && t('Reversal', 'معامله معکوس'),
    row.corrections?.length && t('Amount corrected', 'مبلغ اصلاح شد'),
  ].filter(Boolean).join(' · ')
}

export function driverCommissionSection(rows, language) {
  const t = translate(language)
  return {
    title: t('Booking commissions', 'کمیسیون بار نامه‌ها'),
    headers: [t('Booking / date', 'بار نامه / تاریخ'), t('Charged', 'کمیسیون'), t('Paid', 'پرداخت'), t('Remaining', 'باقی‌مانده')],
    numeric: [1, 2, 3],
    rows: rows.map(row => [
      `#${row.booking_number} · ${formatSolarHijri(row.date)}`,
      reportMoney(cents(row.charged), row.currency),
      reportMoney(cents(row.paid), row.currency),
      reportMoney(bookingDue(row.charged, row.paid), row.currency),
    ]),
  }
}

export function personStatement({ language, name, kind, transactions, commissions = [], start = '', end = '', currency = '' }) {
  const t = translate(language)
  const rows = transactions.filter(row => (!start || row.date >= start) && (!end || row.date <= end) && (!currency || row.currency === currency))
    .slice().sort((a, b) => b.date.localeCompare(a.date) || (b.receipt_number || 0) - (a.receipt_number || 0))
  const units = [...new Set(rows.map(row => row.currency))].sort()
  return {
    language, title: `${kind === 'employee' ? t('Employee statement', 'صورت حساب کارمند') : t('Driver statement', 'صورت حساب راننده')} · ${name}`,
    subtitle: `${start ? formatSolarHijri(start) : t('Beginning', 'آغاز')} – ${end ? formatSolarHijri(end) : t('All dates', 'همه تاریخ‌ها')}`,
    sections: [
      { title: t('Recorded Cashbook totals', 'مجموع معاملات ثبت‌شده روزنامچه'), headers: [t('Currency', 'واحد پول'), t('Money In', 'آمد'), t('Money Out', 'رفت')], numeric: [1, 2], rows: units.map(unit => [unit, ...['in', 'out'].map(direction => reportMoney(rows.filter(row => row.currency === unit && row.direction === direction).reduce((sum, row) => sum + cents(row.amount), 0), unit))]) },
      { title: t('Transactions', 'معاملات'), headers: [t('Date', 'تاریخ'), t('Account', 'حساب'), t('Description', 'شرح'), t('Money In', 'آمد'), t('Money Out', 'رفت')], widths: [14, 16, 34, 18, 18], numeric: [3, 4], rows: rows.map(row => [formatSolarHijri(row.date), row.branch, [row.description, transactionNotes(row, language)].filter(Boolean).join(' · '), row.direction === 'in' ? reportMoney(cents(row.amount), row.currency) : '', row.direction === 'out' ? reportMoney(cents(row.amount), row.currency) : '']) },
      ...(commissions.length ? [driverCommissionSection(commissions, language)] : []),
    ],
    note: `${t('Printed on', 'تاریخ چاپ')} ${formatSolarHijri(kabulToday())} · ${commissions.length ? t('Commission balances include all payments recorded to date. Cashbook transactions follow the selected dates.', 'باقی‌ماندهٔ کمیسیون شامل همه پرداخت‌های ثبت‌شده تا امروز است. معاملات روزنامچه مطابق تاریخ‌های انتخاب‌شده است.') : t('Recorded cash movements only; this is not a salary calculation. Loan balances are current.', 'فقط معاملات نقدی ثبت‌شده؛ این گزارش محاسبه معاش نیست. باقی‌مانده قرض فعلی است.')}${rows.length ? '' : ` · ${t('No transactions for this period.', 'در این بازه معامله‌ای ثبت نشده است.')}`}`,
  }
}

export const canPrintReceipt = row => Boolean(row?.id && !row.opening && !row.private_activity && ['in', 'out'].includes(row.direction))
export function cashbookReceipt({ row, language, account }) {
  if (!canPrintReceipt(row)) return null
  const t = translate(language)
  return {
    language, title: t('Cashbook receipt', 'رسید روزنامچه'), subtitle: account,
    sections: [{ rows: [
      [t('Date', 'تاریخ'), formatSolarHijri(row.entry_date)],
      [t('Account', 'حساب'), account],
      [t('Type', 'نوع'), row.direction === 'in' ? t('Money In', 'آمد') : t('Money Out', 'رفت')],
      [t('Amount', 'مبلغ'), reportMoney(cents(row.amount), row.currency)],
      [t('Description', 'شرح'), row.description],
      ...(transactionNotes(row, language) ? [[t('Status / notes', 'وضعیت / یادداشت'), transactionNotes(row, language)]] : []),
    ] }], note: `${t('Printed on', 'تاریخ چاپ')} ${formatSolarHijri(kabulToday())}`,
  }
}

export function traderPortalStatement({ data, currency, language }) {
  const t = translate(language), money = amount => reportMoney(amount, currency)
  const totals = traderBalance(data.charges, data.payments, currency)
  const history = [...data.charges.filter(row => row.currency === currency).map(row => ({ ...row, type: 'charge' })), ...data.payments.filter(row => row.currency === currency).map(row => ({ ...row, type: 'payment' }))]
    .sort((a, b) => b.date.localeCompare(a.date))
  const bookings = bookingBalances(data, currency).filter(row => !row.currency || row.currency === currency || row.charged || row.paid).sort((a, b) => b.date.localeCompare(a.date) || b.number - a.number)
  return {
    language, title: `${t('My account statement', 'صورت حساب من')} · ${data.trader.name}`, subtitle: `${currency} · ${formatSolarHijri(kabulToday())}`,
    sections: [
      { receiptColumns: 4, rows: [[t('Total charges', 'مجموع بدهی'), money(totals.charged)], [t('Paid (net)', 'پرداخت خالص'), money(totals.received)], [t('Amount you owe', 'باقی‌مانده شما'), money(totals.owed)], [t('Your credit', 'طلب شما'), money(totals.credit)]] },
      { title: t('My bookings', 'بوکینگ‌های من'), headers: [t('Date', 'تاریخ'), t('Booking', 'بوکینگ'), t('Route / goods', 'مسیر / بار'), t('Charge', 'بدهی'), t('Paid', 'پرداخت'), t('Remaining', 'باقی‌مانده')], widths: [14, 10, 28, 16, 16, 16], numeric: [3, 4, 5], rows: bookings.length ? bookings.map(row => [formatSolarHijri(row.date), `#${row.number}`, `${row.origin} → ${row.destination} · ${row.goods || ''} · ${row.status || ''}`, money(row.charged), money(row.paid), money(row.remaining)]) : [['', '', t('No bookings yet.', 'هنوز بوکینگ ثبت نشده است.'), '', '', '']] },
      { title: t('Account activity', 'معاملات حساب'), headers: [t('Date', 'تاریخ'), t('Description', 'شرح'), t('Charge', 'بدهی'), t('Payment', 'پرداخت')], widths: [16, 44, 20, 20], numeric: [2, 3], rows: history.length ? history.map(row => [formatSolarHijri(row.date), `${row.description || ''}${row.voided_at ? ` · ${t('Cancelled', 'لغوشده')}` : ''}`, row.type === 'charge' ? money(cents(row.amount)) : '', row.type === 'payment' ? money((row.direction === 'in' ? 1 : -1) * cents(row.amount)) : '']) : [['', t('No account activity yet.', 'هنوز معامله‌ای ثبت نشده است.'), '', '']] },
    ], note: t('Cancelled charges are shown for history and excluded from totals. Refunds reduce net payments.', 'بدهی‌های لغوشده در تاریخچه نمایش داده شده و در مجموع حساب نمی‌شوند. بازپرداخت‌ها از پرداخت خالص کم می‌شوند.'),
  }
}
