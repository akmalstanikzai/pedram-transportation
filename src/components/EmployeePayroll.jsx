import { useCallback, useEffect, useRef, useState } from 'react'
import { Printer, RefreshCw } from 'lucide-react'
import { allRows, cents, kabulToday } from '../lib/cashbook'
import { rpc, explain } from '../lib/operations'
import { supabase } from '../lib/supabase'
import { solarHijriToday, formatSolarHijri } from '../lib/solarHijri'
import { payrollMonths, payrollMoney, payrollMonthLabel, payrollTotals, payrollStatus, payrollPayslip } from '../lib/payroll'
import { printRecord } from '../lib/recordExports'
import { Modal } from './RecordTools'
import SolarHijriDateInput from './SolarHijriDateInput'

export function PayrollCards({rows, language, onPay, onPrint}) {
  const t = (en,fa) => language === 'fa' ? fa : en
  return <div className="payroll-list">{rows.map(row => <article className="payroll-card" key={row.id}>
    <div className="payroll-card-heading"><div><strong>{row.name}</strong><small><bdi dir="ltr">{row.phone}</bdi>{row.archived ? ` · ${t('Archived','بایگانی‌شده')}` : ''}</small></div><span>{payrollStatus(row,language)}</span></div>
    <dl className="payroll-amounts">{[['salary','Monthly salary','معاش ماهانه'],['advances','Salary advances','پیش‌پرداخت معاش'],['paid','Salary payments','پرداخت معاش'],['remaining','Remaining','باقی‌مانده']].map(([key,en,fa]) => <div key={key}><dt>{t(en,fa)}</dt><dd><bdi dir="ltr">{payrollMoney(cents(row[key]))}</bdi></dd></div>)}</dl>
    <div className="payroll-actions"><button className="registry-primary" disabled={row.archived || cents(row.remaining) <= 0} onClick={() => onPay(row)}>{t('Record payment','ثبت پرداخت')}</button><button className="registry-secondary" onClick={() => onPrint(row)}><Printer size={16}/>{t('Print payslip','چاپ برگه معاش')}</button></div>
    {!!row.payments.length && <details className="payroll-history"><summary>{t('Payment history','تاریخچه پرداخت')}</summary>{row.payments.map(payment => <div key={payment.id}><span>{formatSolarHijri(payment.date)} · {payment.kind === 'advance' ? t('Salary advance','پیش‌پرداخت معاش') : t('Salary payment','پرداخت معاش')} · {payment.account}</span><strong><bdi dir="ltr">{payrollMoney(cents(payment.amount))}</bdi>{payment.reversed ? ` · ${t('Reversed','معکوس‌شده')}` : ''}</strong></div>)}</details>}
  </article>)}</div>
}

export default function EmployeePayroll({language}) {
  const t = (en,fa) => language === 'fa' ? fa : en
  const [period,setPeriod] = useState(() => { const date = solarHijriToday(); return {year:date.year,month:date.month} })
  const [rows,setRows] = useState([]), [branches,setBranches] = useState([])
  const [loadedPeriod,setLoadedPeriod] = useState('')
  const [loading,setLoading] = useState(true), [busy,setBusy] = useState(false)
  const [error,setError] = useState(''), [notice,setNotice] = useState(''), [printError,setPrintError] = useState('')
  const [payment,setPayment] = useState(null), [form,setForm] = useState({})
  const [paymentError,setPaymentError] = useState(''), [uncertain,setUncertain] = useState(false)
  const request = useRef(null), sequence = useRef(0)
  const load = useCallback(async (isActive = () => true) => {
    const current = ++sequence.current
    setLoading(true); setError('')
    try {
      const [data,accounts] = await Promise.all([rpc('employee_payroll_month',{p_year:period.year,p_month:period.month}),allRows(supabase,'branches','id,name,archived_at')])
      if (current === sequence.current && isActive()) { setRows(data); setBranches(accounts); setLoadedPeriod(`${period.year}/${period.month}`) }
    } catch (failure) { if (current === sequence.current && isActive()) setError(explain(failure,language)) }
    finally { if (current === sequence.current && isActive()) setLoading(false) }
  }, [period.year,period.month,language])
  useEffect(() => { let active = true; void Promise.resolve().then(() => { if (active) void load(() => active) }); return () => { active = false } }, [load])
  const reading = loading || loadedPeriod !== `${period.year}/${period.month}`
  const totals = payrollTotals(rows)
  const monthLabel = payrollMonthLabel(period.year,period.month,language)
  async function prepare() {
    if (busy) return
    setBusy(true); setNotice(''); setError('')
    try { await rpc('prepare_employee_payroll',{p_year:period.year,p_month:period.month}); await load() }
    catch (failure) { setError(explain(failure,language)) }
    finally { setBusy(false) }
  }
  function startPayment(row) {
    request.current = null; setPaymentError(''); setUncertain(false); setNotice(''); setPayment(row)
    setForm({kind:'salary',amount:(cents(row.remaining)/100).toFixed(2),date:kabulToday(),branch:''})
  }
  async function pay(event) {
    event.preventDefault()
    if (busy) return
    const payload = {p_payroll:payment.id,p_kind:form.kind,p_amount:form.amount,p_date:form.date,p_branch:form.branch || null}
    const key = JSON.stringify(payload)
    if (request.current?.key !== key) request.current = {key,id:crypto.randomUUID()}
    setBusy(true); setPaymentError('')
    try {
      await rpc('pay_employee_payroll',{p_request:request.current.id,...payload})
      setUncertain(false); setPayment(null); setNotice(t('Payment saved in payroll and Cashbook Money Out.','پرداخت در معاش و پول رفت روزنامچه ثبت شد.'))
      await load()
    } catch (failure) {
      setUncertain(!failure.code && !(failure.status >= 400 && failure.status < 500))
      setPaymentError(explain(failure,language))
    } finally { setBusy(false) }
  }
  function print(row) {
    setPrintError('')
    if (!printRecord(payrollPayslip(row,period.year,period.month,language))) setPrintError(t('Allow pop-ups to print the payslip.','برای چاپ برگه معاش، پنجرهٔ جدید را اجازه دهید.'))
  }
  return <section className="employee-payroll" aria-label={t('Monthly employee payroll','معاش ماهانه کارمندان')}>
    <div className="payroll-toolbar"><label><span>{t('Year','سال')}</span><select aria-label={t('Year','سال')} value={period.year} disabled={busy} onChange={event => {setNotice('');setPeriod({...period,year:Number(event.target.value)})}}>{Array.from(new Set([period.year,...Array.from({length:11},(_,i) => solarHijriToday().year-5+i)])).sort((a,b) => a-b).map(year => <option key={year}>{year}</option>)}</select></label><label><span>{t('Month','ماه')}</span><select aria-label={t('Month','ماه')} value={period.month} disabled={busy} onChange={event => {setNotice('');setPeriod({...period,month:Number(event.target.value)})}}>{payrollMonths[language === 'fa' ? 'fa' : 'en'].map((month,index) => <option key={month} value={index+1}>{month}</option>)}</select></label><button className="registry-secondary" disabled={busy || loading} onClick={() => void load()} aria-label={t('Refresh payroll','تازه‌سازی معاش')}><RefreshCw size={17}/></button><button className="registry-secondary" disabled={busy || loading} onClick={prepare}>{rows.length ? t('Add missing employees','افزودن کارمندان باقی‌مانده') : t('Start monthly payroll','آغاز معاش ماهانه')}</button></div>
    <p className="booking-help">{t('AFN · Salaries are saved when the month is started. Later salary changes do not alter this month. Only payments recorded here count; personal loans stay separate.','افغانی · معاش‌ها هنگام آغاز ماه ذخیره می‌شوند. تغییر بعدی معاش، این ماه را تغییر نمی‌دهد. فقط پرداخت‌های این بخش حساب می‌شوند؛ قرض شخصی جدا است.')}</p>
    {notice && <p className="registry-notice" role="status">{notice}</p>}{(error || printError) && <p className="registry-notice error" role="alert">{error || printError}</p>}
    {reading && !error ? <p role="status">{t('Loading payroll…','در حال بارگیری معاش…')}</p> : !error && <>
      <h2>{monthLabel}</h2>
      {rows.length ? <><dl className="payroll-amounts payroll-summary">{[['salary','Total salary','مجموع معاش'],['advances','Advances','پیش‌پرداخت'],['paid','Salary paid','معاش پرداخت‌شده'],['remaining','Remaining','باقی‌مانده']].map(([key,en,fa]) => <div key={key}><dt>{t(en,fa)}</dt><dd><bdi dir="ltr">{payrollMoney(totals[key])}</bdi></dd></div>)}</dl><PayrollCards rows={rows} language={language} onPay={startPayment} onPrint={print}/></> : <p>{t('Start this month to include all active employees at their current salaries. No cash payment is created until you record one.','برای شامل ساختن تمام کارمندان فعال با معاش فعلی، این ماه را آغاز کنید. تا ثبت پرداخت، هیچ پولی در روزنامچه ثبت نمی‌شود.')}</p>}
    </>}
    {payment && <Modal title={`${t('Record salary payment','ثبت پرداخت معاش')} · ${payment.name}`} busy={busy || uncertain} onClose={() => setPayment(null)}><form className="registry-form payroll-payment-form" onSubmit={pay}>
      <p className="wide booking-help">{monthLabel} · {t('Remaining','باقی‌مانده')}: {payrollMoney(cents(payment.remaining))}</p>
      <fieldset className="booking-fields wide" disabled={busy || uncertain}>
        <label><span>{t('Payment type','نوع پرداخت')}</span><select value={form.kind} onChange={event => setForm({...form,kind:event.target.value})}><option value="salary">{t('Salary payment','پرداخت معاش')}</option><option value="advance">{t('Salary advance','پیش‌پرداخت معاش')}</option></select></label>
        <label><span>{t('Amount (AFN)','مبلغ (افغانی)')} *</span><input required type="number" inputMode="decimal" min="0.01" max={Number(payment.remaining)} step="0.01" value={form.amount} onChange={event => setForm({...form,amount:event.target.value})}/></label>
        <label><span>{t('Date','تاریخ')} *</span><SolarHijriDateInput language={language} required max={kabulToday()} value={form.date} onChange={date => setForm({...form,date})} ariaLabel={t('Payment date','تاریخ پرداخت')}/></label>
        <label><span>{t('Pay from account','پرداخت از حساب')}</span><select value={form.branch} onChange={event => setForm({...form,branch:event.target.value})}><option value="">{t('Admin account','حساب مرکزی')}</option>{branches.filter(branch => !branch.archived_at).map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
      </fieldset>
      {uncertain && <p className="wide registry-notice" role="status">{t('The save response was not received. Retry the same payment to avoid a duplicate.','پاسخ ثبت دریافت نشد. همان پرداخت را دوباره کوشش کنید تا تکراری ثبت نشود.')}</p>}
      {paymentError && <p className="wide registry-notice error" role="alert">{paymentError}</p>}
      <div className="registry-form-actions"><button type="button" disabled={busy || uncertain} onClick={() => setPayment(null)}>{t('Cancel','انصراف')}</button><button className="registry-primary" disabled={busy}>{busy ? t('Saving…','در حال ثبت…') : uncertain ? t('Retry payment','کوشش مجدد پرداخت') : t('Save payment','ثبت پرداخت')}</button></div>
    </form></Modal>}
  </section>
}
