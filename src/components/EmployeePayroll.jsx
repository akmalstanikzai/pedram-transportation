import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { Banknote, CalendarDays, ChartNoAxesCombined, Printer, RefreshCw, WalletCards } from 'lucide-react'
import { allRows, cents, kabulToday } from '../lib/cashbook'
import { rpc, explain } from '../lib/operations'
import { supabase } from '../lib/supabase'
import { solarHijriToday, formatSolarHijri } from '../lib/solarHijri'
import { payrollMonths, payrollMoney, payrollMonthLabel, payrollTotals, payrollStatus, payrollPayslip } from '../lib/payroll'
import { printRecord } from '../lib/recordExports'
import { IconButton, Modal } from './RecordTools'
import CompactTable from './CompactTable'
import SolarHijriDateInput from './SolarHijriDateInput'
import { recordQuery } from '../lib/recordRoutes'

const totalLabels = [
  ['salary','Total salary','مجموع معاش'],
  ['advances','Advances','پیش‌پرداخت'],
  ['paid','Salary settled','معاش تصفیه‌شده'],
  ['remaining','Remaining','باقی‌مانده'],
]

export function PayrollCards({rows, language, onPay, onPrint, onReverse, showHistory}) {
  const t = (en,fa) => language === 'fa' ? fa : en
  const amount = value => <bdi dir="ltr">{payrollMoney(cents(value))}</bdi>
  return <CompactTable className="payroll-employees" label={t('Monthly payroll','معاش ماهانه')} columns={[
    {label:t('Employee','کارمند')}, {label:t('Salary / advance','معاش / پیش‌پرداخت')},
    {label:t('Settled / remaining','تصفیه / باقی‌مانده')}, {label:t('Actions','عملیات'),width:'24%'},
  ]}>{rows.map(row => <Fragment key={row.id}>
    <tr className="payroll-employee-row">
      <th scope="row"><strong>{row.name}</strong><small><bdi dir="ltr">{row.phone}</bdi></small>
        <small className="payroll-employee-status">{row.archived ? t('Archived','بایگانی‌شده') : payrollStatus(row,language)}</small>
      </th>
      <td>{amount(row.salary)}<small>{t('Advance','پیش‌پرداخت')} · {amount(row.advances)}</small></td>
      <td>{amount(row.paid)}<small>{t('Remaining','باقی‌مانده')} · <strong>{amount(row.remaining)}</strong></small>
        {cents(row.deducted)>0 && <small>{t('Loan deducted','کسر قرض')} · {amount(row.deducted)}</small>}
      </td>
      <td><div className="compact-table-actions payroll-row-actions">
        <button type="button" className="payroll-pay-button" aria-label={t('Record payment','ثبت پرداخت')} title={t('Record payment','ثبت پرداخت')}
          disabled={row.archived || cents(row.remaining) <= 0} onClick={() => onPay(row)}>
          <WalletCards size={15} aria-hidden="true" />{t('Pay','پرداخت')}
        </button>
        <IconButton icon={Printer} label={t('Print payslip','چاپ برگه معاش')} onClick={() => onPrint(row)} />
      </div></td>
    </tr>
    {!!row.payments.length && <tr className="payroll-history-row"><td colSpan={4}>
      <details className="payroll-history" open={showHistory || undefined}><summary>{t('Payment history','تاریخچه پرداخت')} · {row.name}</summary>
        {row.payments.map(payment => <div key={payment.id}>
          <span>{formatSolarHijri(payment.date)} · {payment.kind === 'advance' ? t('Salary advance','پیش‌پرداخت معاش') : t('Salary payment','پرداخت معاش')} · {payment.account}</span>
          <strong>{amount(payment.amount)}{payment.reversed ? ` · ${t('Reversed','معکوس‌شده')}` : ''}</strong>
          {cents(payment.deducted)>0 && <div className="payroll-history-deduction">
            <span>{t('Cash paid','پرداخت نقدی')} · {amount(payment.cash_paid)}</span>
            <span>{t('Loan deducted','کسر قرض')} · {amount(payment.deducted)}</span>
            {!payment.reversed && payment.operation_id && <button type="button" className="registry-secondary" onClick={()=>onReverse(payment)}>{t('Reverse payment','معکوس‌کردن پرداخت')}</button>}
          </div>}
        </div>)}
      </details>
    </td></tr>}
  </Fragment>)}</CompactTable>
}

export default function EmployeePayroll({language}) {
  const t = (en,fa) => language === 'fa' ? fa : en
  const destination = recordQuery()
  const targetPayroll = destination.get('row')
  const [period,setPeriod] = useState(() => {
    const date = solarHijriToday()
    const year = Number(destination.get('year'))
    const month = Number(destination.get('month'))
    return Number.isInteger(year) && year>=1300 && year<=1600 && Number.isInteger(month) && month>=1 && month<=12
      ? {year,month} : {year:date.year,month:date.month}
  })
  const [rows,setRows] = useState([]), [branches,setBranches] = useState([])
  const [loans,setLoans] = useState([])
  const [loadedPeriod,setLoadedPeriod] = useState('')
  const [loading,setLoading] = useState(true), [busy,setBusy] = useState(false)
  const [error,setError] = useState(''), [notice,setNotice] = useState(''), [printError,setPrintError] = useState('')
  const [payment,setPayment] = useState(null), [form,setForm] = useState({})
  const [paymentError,setPaymentError] = useState(''), [uncertain,setUncertain] = useState(false)
  const [reversal,setReversal] = useState(null), [reason,setReason] = useState('')
  const request = useRef(null), sequence = useRef(0)
  const load = useCallback(async (isActive = () => true) => {
    const current = ++sequence.current
    setLoading(true); setError('')
    try {
      const [data,accounts,openLoans] = await Promise.all([rpc('employee_payroll_month',{p_year:period.year,p_month:period.month}),allRows(supabase,'branches','id,name,archived_at'),rpc('open_cashbook_loans')])
      if (current === sequence.current && isActive()) { setRows(data); setBranches(accounts); setLoans(openLoans); setLoadedPeriod(`${period.year}/${period.month}`) }
    } catch (failure) { if (current === sequence.current && isActive()) setError(explain(failure,language)) }
    finally { if (current === sequence.current && isActive()) setLoading(false) }
  }, [period.year,period.month,language])
  useEffect(() => { let active = true; void Promise.resolve().then(() => { if (active) void load(() => active) }); return () => { active = false } }, [load])
  const currentPeriodLoaded = loadedPeriod === `${period.year}/${period.month}`
  const reading = loading || !currentPeriodLoaded
  const focused = targetPayroll && period.year===Number(destination.get('year')) && period.month===Number(destination.get('month'))
  const visibleRows = focused ? rows.filter(row=>row.id===targetPayroll) : rows
  const totals = payrollTotals(visibleRows)
  const monthLabel = payrollMonthLabel(period.year,period.month,language)
  const currentYear = solarHijriToday().year
  const payrollYears = Array.from(new Set([period.year,...Array.from({length:11},(_,i)=>currentYear-5+i)])).sort((a,b)=>a-b)
  const hasPayroll = currentPeriodLoaded && rows.length > 0
  const prepareLabel = hasPayroll ? t('Add missing employees','افزودن کارمندان باقی‌مانده') : t('Start payroll for this month','آغاز معاش ماهانه')
  const eligibleLoans = payment ? loans.filter(loan=>loan.employee_id===payment.employee_id && loan.currency==='AFN' && loan.date<=form.date) : []
  const loan = eligibleLoans.find(row=>row.id===form.loan)
  const maxDeduction = loan ? Math.min(cents(loan.remaining),cents(form.amount)) : 0
  async function prepare() {
    if (busy) return
    setBusy(true); setNotice(''); setError('')
    try { await rpc('prepare_employee_payroll',{p_year:period.year,p_month:period.month}); await load() }
    catch (failure) { setError(explain(failure,language)) }
    finally { setBusy(false) }
  }
  function startPayment(row) {
    request.current = null; setPaymentError(''); setUncertain(false); setNotice(''); setPayment(row)
    setForm({kind:'salary',amount:(cents(row.remaining)/100).toFixed(2),date:kabulToday(),branch:'',loan:'',deduction:''})
  }
  async function pay(event) {
    event.preventDefault()
    if (busy) return
    const payload = {p_payroll:payment.id,p_kind:form.kind,p_amount:form.amount,p_date:form.date,p_branch:form.branch || null,
      ...(form.loan ? {p_loan:form.loan,p_deduction:form.deduction} : {})}
    const key = JSON.stringify(payload)
    if (request.current?.key !== key) request.current = {key,id:crypto.randomUUID()}
    setBusy(true); setPaymentError('')
    try {
      await rpc('pay_employee_payroll',{p_request:request.current.id,...payload})
      setUncertain(false); setPayment(null); setNotice(t('Payroll payment saved.','پرداخت معاش ثبت شد.'))
      window.dispatchEvent(new Event('pedram:cashbook-changed'))
      await load()
    } catch (failure) {
      setUncertain(!failure.code && !(failure.status >= 400 && failure.status < 500))
      setPaymentError(explain(failure,language))
    } finally { setBusy(false) }
  }
  async function reverse(event) {
    event.preventDefault()
    if (busy || !reason.trim()) return
    setBusy(true); setPaymentError('')
    try {
      await rpc('reverse_cashbook_entry',{p_operation:reversal.operation_id,p_reason:reason.trim()})
      setReversal(null); setNotice(t('Payment reversed.','پرداخت معکوس شد.'))
      window.dispatchEvent(new Event('pedram:cashbook-changed'))
      await load()
    } catch (failure) { setPaymentError(explain(failure,language)) }
    finally { setBusy(false) }
  }
  function print(row) {
    setPrintError('')
    if (!printRecord(payrollPayslip(row,period.year,period.month,language))) setPrintError(t('Allow pop-ups to print the payslip.','برای چاپ برگه معاش، پنجرهٔ جدید را اجازه دهید.'))
  }
  return <section className="employee-payroll" aria-label={t('Monthly employee payroll','معاش ماهانه کارمندان')}>
    <div className="payroll-toolbar">
      <label>
        <span>{t('Month','ماه')}</span>
        <select aria-label={t('Month','ماه')} value={period.month} disabled={busy} onChange={event=>{setNotice('');setPeriod({...period,month:Number(event.target.value)})}}>
          {payrollMonths[language === 'fa' ? 'fa' : 'en'].map((month,index)=><option key={month} value={index+1}>{month}</option>)}
        </select>
      </label>
      <label>
        <span>{t('Year','سال')}</span>
        <select aria-label={t('Year','سال')} value={period.year} disabled={busy} onChange={event=>{setNotice('');setPeriod({...period,year:Number(event.target.value)})}}>
          {payrollYears.map(year=><option key={year}>{year}</option>)}
        </select>
      </label>
      <IconButton icon={RefreshCw} label={t('Refresh payroll','تازه‌سازی معاش')} disabled={busy || loading} onClick={()=>void load()}/>
      <button type="button" className="registry-secondary payroll-prepare" aria-label={prepareLabel} title={prepareLabel} disabled={busy || loading} onClick={prepare}>
        {hasPayroll ? t('Add missing','افزودن کارمندان') : t('Start payroll','آغاز معاش')}
      </button>
    </div>
    {notice && <p className="registry-notice" role="status">{notice}</p>}{(error || printError) && <p className="registry-notice error" role="alert">{error || printError}</p>}
    {reading && !error ? <p role="status">{t('Loading payroll…','در حال بارگیری معاش…')}</p> : !error && <>
      {hasPayroll ? <>
        <section className="payroll-overview" aria-labelledby="payroll-totals-heading">
          <h2 id="payroll-totals-heading"><ChartNoAxesCombined size={16} aria-hidden="true"/>{t('Payroll totals','خلاصه معاش ماهانه')}</h2>
          <dl className="payroll-summary">
            {totalLabels.map(([key,en,fa])=><div key={key} data-metric={key}><dt>{t(en,fa)}</dt><dd><bdi dir="ltr">{payrollMoney(totals[key])}</bdi></dd></div>)}
          </dl>
        </section>
        {focused && <a href={`#/employees?payroll=1&year=${period.year}&month=${period.month}`}>{t('Show all employees for this month','نمایش همه کارمندان این ماه')}</a>}
        <PayrollCards rows={visibleRows} showHistory={focused} language={language} onPay={startPayment} onPrint={print} onReverse={entry=>{setReason('');setPaymentError('');setReversal(entry)}}/>
        <details className="payroll-help">
          <summary>{t('About payroll','درباره معاش ماهانه')}</summary>
          <p>{t('The month keeps the salary set when it started. You can deduct an employee’s outstanding AFN loan when recording salary.','معاش تعیین‌شده هنگام آغاز ماه ثابت می‌ماند. هنگام ثبت معاش می‌توانید قرض باقی‌ماندهٔ افغانی کارمند را کسر کنید.')}</p>
        </details>
      </> : <p className="booking-help">{t('Start this month to include all active employees at their current salaries. No cash payment is created until you record one.','برای شامل ساختن تمام کارمندان فعال با معاش فعلی، این ماه را آغاز کنید. تا ثبت پرداخت، هیچ پولی در روزنامچه ثبت نمی‌شود.')}</p>}
    </>}
    {payment && <Modal title={`${t('Record salary payment','ثبت پرداخت معاش')} · ${payment.name}`} busy={busy || uncertain} onClose={() => setPayment(null)} className="payroll-payment-modal"><form className="registry-form payroll-payment-form" onSubmit={pay}>
      <div className="payroll-payment-balance">
        <span><CalendarDays size={16} aria-hidden="true"/>{monthLabel}</span>
        <span>{t('Remaining salary','معاش باقی‌مانده')} <strong><bdi dir="ltr">{payrollMoney(cents(payment.remaining))}</bdi></strong></span>
      </div>
      <fieldset className="payroll-payment-sections" disabled={busy || uncertain}>
        <div className="payroll-payment-fields" role="group" aria-label={t('Payment details','تفصیلات پرداخت')}>
          <label><span>{t('Payment type','نوع پرداخت')}</span><select value={form.kind} onChange={event => setForm({...form,kind:event.target.value,loan:'',deduction:''})}><option value="salary">{t('Salary payment','پرداخت معاش')}</option><option value="advance">{t('Salary advance','پیش‌پرداخت معاش')}</option></select></label>
          <label><span>{t('Amount before deduction (AFN)','مبلغ قبل از کسر (افغانی)')} *</span><input required type="number" inputMode="decimal" min="0.01" max={Number(payment.remaining)} step="0.01" value={form.amount} onChange={event => setForm({...form,amount:event.target.value})}/></label>
          <label><span>{t('Date','تاریخ')} *</span><SolarHijriDateInput language={language} required max={kabulToday()} value={form.date} onChange={date => setForm({...form,date,...(loan && loan.date>date ? {loan:'',deduction:''} : {})})} ariaLabel={t('Payment date','تاریخ پرداخت')}/></label>
          <label><span>{t('Pay from account','پرداخت از حساب')}</span><select value={form.branch} onChange={event => setForm({...form,branch:event.target.value})}><option value="">{t('Admin account','حساب مرکزی')}</option>{branches.filter(branch => !branch.archived_at).map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
        </div>
        {form.kind==='salary' && eligibleLoans.length>0 && <div className="payroll-deduction-fields">
          <label><span>{t('Deduct a loan','کسر قرض')}</span><select value={form.loan} onChange={event=>{
            const selected = eligibleLoans.find(row=>row.id===event.target.value)
            setForm({...form,loan:event.target.value,deduction:selected ? (Math.min(cents(selected.remaining),cents(form.amount))/100).toFixed(2) : ''})
          }}><option value="">{t('No loan deduction','بدون کسر قرض')}</option>
            {eligibleLoans.map(row=><option key={row.id} value={row.id} dir="ltr">#{row.receipt_number} · {(cents(row.remaining)/100).toLocaleString('en-US',{maximumFractionDigits:2})}</option>)}
          </select></label>
          {loan && <label><span>{t('Deduction (AFN)','مبلغ کسر (افغانی)')} *</span><input type="number" required inputMode="decimal" min="0.01" max={maxDeduction/100} step="0.01" value={form.deduction} onChange={event=>setForm({...form,deduction:event.target.value})}/></label>}
          {loan && <p className="payroll-loan-detail"><span>{t('Loan balance','باقی‌ماندهٔ قرض')} <bdi dir="ltr">{payrollMoney(cents(loan.remaining))}</bdi></span><span>{t('Due date','تاریخ سررسید')} <bdi dir="ltr">{formatSolarHijri(loan.due_date)}</bdi></span></p>}
        </div>}
      </fieldset>
      <p className="payroll-net">
        <span><Banknote size={18} aria-hidden="true"/>{t('Cash to pay','پرداخت نقدی')}</span>
        <output><bdi dir="ltr">{payrollMoney(Math.max(0,cents(form.amount) - (loan ? cents(form.deduction) : 0)))}</bdi></output>
      </p>
      {uncertain && <p className="wide registry-notice" role="status">{t('The save response was not received. Retry the same payment to avoid a duplicate.','پاسخ ثبت دریافت نشد. همان پرداخت را دوباره کوشش کنید تا تکراری ثبت نشود.')}</p>}
      {paymentError && <p className="wide registry-notice error" role="alert">{paymentError}</p>}
      <div className="registry-form-actions"><button type="button" disabled={busy || uncertain} onClick={() => setPayment(null)}>{t('Cancel','انصراف')}</button><button className="registry-primary" disabled={busy}>{busy ? t('Saving…','در حال ثبت…') : uncertain ? t('Retry payment','کوشش مجدد پرداخت') : t('Save payment','ثبت پرداخت')}</button></div>
    </form></Modal>}
    {reversal && <Modal title={t('Reverse payment','معکوس‌کردن پرداخت')} busy={busy} onClose={()=>setReversal(null)}>
      <form className="registry-form" onSubmit={reverse}>
        <p className="wide booking-help">{t('This restores the deducted loan balance and the settled salary. Any cash paid is reversed in Cashbook.','باقی‌مانده قرض و معاش دوباره برقرار می‌شود. هر مبلغ نقدی پرداخت‌شده در روزنامچه معکوس می‌شود.')}</p>
        <label className="wide"><span>{t('Reason','دلیل')} *</span><input required maxLength={500} value={reason} onChange={event=>setReason(event.target.value)} /></label>
        {paymentError && <p className="wide registry-notice error" role="alert">{paymentError}</p>}
        <div className="registry-form-actions"><button type="button" disabled={busy} onClick={()=>setReversal(null)}>{t('Cancel','انصراف')}</button><button className="registry-primary" disabled={busy}>{t('Reverse payment','معکوس‌کردن پرداخت')}</button></div>
      </form>
    </Modal>}
  </section>
}
