import { useCallback, useEffect, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Printer, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { allRows, cents, currencies, kabulToday, simpleLedger, ledgerPeriod } from '../lib/cashbook'
import { rpc } from '../lib/operations'
import { Modal } from '../components/RecordTools'
import { printRecord } from '../lib/recordExports'
import SolarHijriDateInput from '../components/SolarHijriDateInput'
import { formatSolarHijri, solarHijriToday, solarHijriToISODate } from '../lib/solarHijri'

function periodBounds(period){
  const today=kabulToday(),day=new Date(`${today}T00:00:00Z`)
  const daysAgo=count=>new Date(day.getTime()-count*86400000).toISOString().slice(0,10)
  const solar=solarHijriToday()
  if(period==='today')return [today,today]
  if(period==='yesterday')return [daysAgo(1),daysAgo(1)]
  if(period==='week')return [daysAgo((day.getUTCDay()+1)%7),today]
  if(period==='month')return [solarHijriToISODate(solar.year,solar.month,1),today]
  if(period==='year')return [solarHijriToISODate(solar.year,1,1),today]
  return ['0001-01-01',today]
}

export default function CashbookPage({ language, profile }) {
  const t=(en,fa)=>language==='fa'?fa:en
  const president=profile?.role==='president'
  const [data,setData]=useState({branches:[],accounts:[],entries:[]})
  const [traders,setTraders]=useState([])
  const [employees,setEmployees]=useState([])
  const [drivers,setDrivers]=useState([])
  const [loans,setLoans]=useState([])
  const [bookings,setBookings]=useState([])
  const [loading,setLoading]=useState(true)
  const [loaded,setLoaded]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [selectedScope,setScope]=useState('admin')
  const scope=president?selectedScope:profile?.branch_id || ''
  const [currency,setCurrency]=useState('AFN')
  const [period,setPeriod]=useState('today')
  const [customRange,setCustomRange]=useState({start:kabulToday(),end:kabulToday()})
  const [shown,setShown]=useState(20)
  const [form,setForm]=useState({amount:'',description:'',date:kabulToday(),trader_id:'',booking_id:'',employee_id:'',driver_id:'',loan:false,loan_due_date:'',loan_repayment_entry_id:''})
  const [request,setRequest]=useState(()=>crypto.randomUUID())
  const [retryDirection,setRetryDirection]=useState('')
  const [busy,setBusy]=useState(false)
  const [uncertain,setUncertain]=useState(false)
  const [correction,setCorrection]=useState(null)
  const [reason,setReason]=useState('')
  const [correctedAmount,setCorrectedAmount]=useState('')
  const [correctionError,setCorrectionError]=useState('')
  const loadPayments = useCallback(async () => {
    if (!president) return []
    const [entries, operations, corrections] = await Promise.all([
      allRows(supabase,'cashbook_entries'),
      allRows(supabase,'cashbook_operations','id,receipt_number,mode,reverses_id'),
      allRows(supabase,'cashbook_amount_corrections','request_id,entry_id,previous_amount,corrected_amount,reason,changed_at', 'request_id'),
    ])
    const byId = new Map(operations.map(row => [row.id,row]))
    const reversals = new Map(operations.filter(row => row.reverses_id).map(row => [row.reverses_id,row.receipt_number]))
    const historyByEntry = new Map()
    corrections.sort((a,b)=>b.changed_at.localeCompare(a.changed_at))
    for (const correction of corrections) {
      const history = historyByEntry.get(correction.entry_id) ?? []
      history.push(correction)
      historyByEntry.set(correction.entry_id,history)
    }
    return entries.map(entry => {
      const operation = byId.get(entry.operation_id)
      return {
        ...entry,
        receipt_number: operation?.receipt_number,
        reversal: operation?.mode === 'reversal',
        reverses_receipt: byId.get(operation?.reverses_id)?.receipt_number,
        reversed_by: reversals.get(entry.operation_id),
        can_edit_amount: ['income','expense'].includes(operation?.mode) && !entry.is_transfer,
        corrections: historyByEntry.get(entry.id) ?? [],
      }
    })
  }, [president])
  const load=useCallback(async()=>{
    if(!supabase)throw new Error('Database unavailable')
    const [branches,accounts,entries,links]=await Promise.all([
      allRows(supabase,'branches'), allRows(supabase,'cashbook_accounts'),
      president ? loadPayments() : rpc('branch_cashbook_rows',{}),
      president ? Promise.all([
        allRows(supabase,'traders'),
        allRows(supabase,'employees','id,first_name,last_name,phone,archived_at').catch(() => []),
        allRows(supabase,'drivers','id,full_name,phone,archived_at,branch_id'),
        allRows(supabase,'bookings','id,booking_number,trader_id,branch_id,archived_at,deleted_at'),
        rpc('booking_finance_rows',{}),
        rpc('open_cashbook_loans',{}),
      ]) : null,
    ])
    setData({branches,accounts,entries})
    setLoaded(true)
    if (links) {
      const [traders,employees,drivers,bookings,finance,openLoans]=links
      const amounts=new Map(finance.map(row=>[row.id,row]))
      setTraders(traders)
      setEmployees(employees)
      setDrivers(drivers)
      setLoans(openLoans)
      setBookings(bookings.map(row=>({...row,...amounts.get(row.id)})))
    }
  },[president,loadPayments])
  useEffect(()=>{
    let active=true
    void Promise.resolve().then(load).catch(()=>{if(active)setError(language==='fa'?'روزنامچه بارگیری نشد. اتصال و تنظیمات دیتابیس را بررسی کنید.':'Could not load the cashbook. Check the connection and database setup.')}).finally(()=>{if(active)setLoading(false)})
    return()=>{active=false}
  },[load,language])
  const money=value=>`${(value/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})} ${currency}`
  const name=id=>id==='admin'?t('Admin account','حساب مرکزی'):!id?t('No branch assigned','شعبه تعیین نشده است'):data.branches.find(b=>b.id===id)?.name||'—'
  const ledger=simpleLedger(data.accounts,data.entries,scope,currency)
  const [periodStart,periodEnd]=period==='date'?[customRange.start,customRange.start]:period==='custom'?[customRange.start,customRange.end]:periodBounds(period)
  const validPeriod=periodStart&&periodEnd&&periodStart<=periodEnd
  const selectedLedger=ledgerPeriod(ledger,periodStart,periodEnd)
  const accountOptions=<>{president&&<option value="admin">{t('Admin account','حساب مرکزی')}</option>}{data.branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</>
  function description(row) {
    if (row.opening) return t('Earlier balance','موجودی قبلی')
    if (row.private_activity) return t('Trader activity total','مجموع معاملات تاجران')
    return `${row.description}${row.loan_due_date ? ` · ${t('Loan due','مهلت قرض')} ${formatSolarHijri(row.loan_due_date)}` : ''}${row.loan_repayment_entry_id ? ` · ${t('Loan repayment','بازپرداخت قرض')}` : ''}`
  }

  function printPeriod() {
    const range = period === 'all'
      ? `${t('All records through','همه معاملات تا')} ${formatSolarHijri(periodEnd)}`
      : periodStart === periodEnd ? formatSolarHijri(periodStart) : `${formatSolarHijri(periodStart)} – ${formatSolarHijri(periodEnd)}`
    const entries = selectedLedger.rows.map(row => {
      const annotation = row.reversed_by
        ? `${t('Reversed by','اصلاح‌شده با')} #${row.reversed_by}`
        : row.corrections?.length ? t('Amount corrected','مبلغ اصلاح شد') : ''
      return [
        formatSolarHijri(row.entry_date),
        [description(row),annotation].filter(Boolean).join(' · '),
        row.direction === 'in' ? money(cents(row.amount)) : '',
        row.direction === 'out' ? money(cents(row.amount)) : '',
      ]
    })
    const printed = printRecord({
      language,
      title: t('Cashbook statement','صورت حساب روزنامچه'),
      subtitle: `${name(scope)} · ${currency} · ${range}`,
      sections: [
        { title: t('Period summary','خلاصه دوره'), rows: [
          [t('Opening balance','موجودی اول دوره'),money(selectedLedger.opening)],
          [t('Money In','آمد'),money(selectedLedger.incoming)],
          [t('Money Out','رفت'),money(selectedLedger.outgoing)],
          [t('Closing balance','موجودی پایان دوره'),money(selectedLedger.balance)],
        ] },
        { title: t('Transactions','معاملات'), widths: [16,48,18,18], numeric: [2,3],
          headers: [t('Date','تاریخ'),t('Description','شرح'),t('Money In','آمد'),t('Money Out','رفت')],
          rows: entries.length ? entries : [['',t('No records for this period.','در این بازه معامله‌ای ثبت نشده است.'),'','']],
        },
      ],
      note: `${t('Printed on','تاریخ چاپ')} ${formatSolarHijri(kabulToday())}`,
    })
    if (!printed) setError(t('Allow pop-ups to print this statement.','برای چاپ صورت حساب، پنجرهٔ جدید را اجازه دهید.'))
  }

  function openCorrection(row, mode) {
    setCorrection({row,mode,requestId:crypto.randomUUID()})
    setCorrectedAmount(String(row.amount))
    setReason('')
    setCorrectionError('')
  }

  async function saveCorrection(event) {
    event.preventDefault()
    if (busy || !president || !correction || !reason.trim()) return
    const {row,mode,requestId} = correction
    setBusy(true)
    setCorrectionError('')
    try {
      if (mode === 'edit') {
        await rpc('correct_cashbook_amount',{
          p_request:requestId,p_entry:row.id,p_expected_amount:row.amount,p_amount:correctedAmount,p_reason:reason.trim(),
        })
      } else {
        await rpc('reverse_cashbook_entry',{p_operation:row.operation_id,p_reason:reason.trim()})
      }
      setCorrection(null)
      setNotice(mode === 'edit' ? t('Amount updated.','مبلغ به‌روز شد.') : t('Reversal recorded.','اصلاح ثبت شد.'))
      try { await load() }
      catch { setNotice(t('Correction saved. Refresh to see the updated balance.','اصلاح ثبت شد. برای دیدن موجودی، صفحه را تازه کنید.')) }
    } catch (error) {
      const messages = {
        REVERSAL_REASON_REQUIRED: t('Enter a reason of up to 500 characters.','دلیل را حداکثر در ۵۰۰ حرف وارد کنید.'),
        CORRECTION_REASON_REQUIRED: t('Enter a reason of up to 500 characters.','دلیل را حداکثر در ۵۰۰ حرف وارد کنید.'),
        INVALID_REVERSAL: t('This receipt cannot be reversed.','این رسید قابل اصلاح نیست.'),
        LOAN_HAS_REPAYMENTS: t('Reverse the loan repayments before reversing this loan.','پیش از معکوس‌کردن قرض، بازپرداخت‌های آن را معکوس کنید.'),
        INVALID_CORRECTION: t('This receipt amount cannot be changed.','مبلغ این رسید قابل تغییر نیست.'),
        INVALID_AMOUNT: t('Enter a positive amount with up to two decimal places.','یک مبلغ مثبت با حداکثر دو رقم اعشار وارد کنید.'),
        STALE_RECORD: t('The receipt changed. Close this dialog and refresh.','رسید تغییر کرده است. این پنجره را بسته و صفحه را تازه کنید.'),
        REQUEST_CONFLICT: t('Refresh the Cashbook before making another correction.','پیش از اصلاح دوباره، روزنامچه را تازه کنید.'),
      }
      setCorrectionError(messages[error.message] || t('Could not confirm the correction. Try again with the same details.','اصلاح تأیید نشد. با همان معلومات دوباره کوشش کنید.'))
    } finally { setBusy(false) }
  }
  async function refresh(){
    setLoading(true);setError('')
    try{await load();setUncertain(false);setRetryDirection('');setRequest(crypto.randomUUID())}catch{setError(t('Could not load records. Try again.','معلومات بارگیری نشد. دوباره کوشش کنید.'))}finally{setLoading(false)}
  }
  async function save(e){
    e.preventDefault();if(busy)return
    const direction=e.nativeEvent.submitter?.value
    if(!['in','out'].includes(direction)||uncertain&&direction!==retryDirection)return
    if(form.loan&&(!form.loan_due_date||(!form.employee_id&&!form.driver_id)||form.loan_due_date<form.date)){setError(t('Choose an employee or driver and a loan deadline on or after the transaction date.','یک کارمند یا راننده و مهلت قرض را در تاریخ معامله یا پس از آن انتخاب کنید.'));return}
    if(form.loan_repayment_entry_id&&direction!=='in'){setError(t('Record a loan repayment as Money In.','بازپرداخت قرض را به‌عنوان پول آمد ثبت کنید.'));return}
    setBusy(true);setError('')
    try{
      const {error:failure}=await supabase.rpc('cashbook_simple_post',{p_request:request,p_data:{branch_id:scope==='admin'?null:scope,currency,direction,amount:form.amount,date:form.date,description:form.description.trim(),trader_id:form.trader_id||null,booking_id:form.booking_id||null,employee_id:direction==='out'?form.employee_id||null:null,driver_id:direction==='out'?form.driver_id||null:null,loan_due_date:direction==='out'&&form.loan?form.loan_due_date:null,loan_repayment_entry_id:direction==='in'?form.loan_repayment_entry_id||null:null}})
      if(failure){
        const messages={ACCESS_DENIED:t('You cannot record money for this account.','شما اجازه ثبت پول در این حساب را ندارید.'),INVALID_AMOUNT:t('Enter a positive amount with up to two decimal places.','یک مبلغ مثبت با حداکثر دو رقم اعشار وارد کنید.'),INVALID_DATE:t('Choose today or an earlier date.','تاریخ امروز یا گذشته را انتخاب کنید.'),DESCRIPTION_REQUIRED:t('Enter a name or description.','نام یا شرح معامله را وارد کنید.'),BOOKING_PAYMENT_UNAVAILABLE:t('Choose an active booking in this currency.','بوکینگ فعال را با همین واحد پول انتخاب کنید.'),EMPLOYEE_UNAVAILABLE:t('Choose an active employee.','یک کارمند فعال را انتخاب کنید.'),INVALID_PARTY_PAYMENT:t('Only one employee or driver can be linked to Money Out.','فقط یک کارمند یا راننده به پول رفت وصل می‌شود.'),DRIVER_UNAVAILABLE:t('Choose an active driver.','یک راننده فعال را انتخاب کنید.'),INVALID_LOAN:t('Link the loan to one employee or driver and record Money Out.','قرض را به یک کارمند یا راننده وصل کرده و پول رفت ثبت کنید.'),INVALID_LOAN_DEADLINE:t('The loan deadline must be on or after the transaction date.','مهلت قرض باید در تاریخ معامله یا پس از آن باشد.'),INVALID_LOAN_REPAYMENT:t('Choose an open loan and record Money In.','یک قرض باز را انتخاب کرده و پول آمد ثبت کنید.'),LOAN_UNAVAILABLE:t('This loan is no longer available. Refresh the cashbook.','این قرض دیگر در دسترس نیست. روزنامچه را تازه کنید.'),LOAN_CURRENCY_MISMATCH:t('Use the same currency as the loan.','از واحد پول قرض استفاده کنید.'),LOAN_REPAYMENT_EXCEEDS_BALANCE:t('The repayment exceeds the remaining loan balance.','بازپرداخت از مانده قرض بیشتر است.')}
        const key=Object.keys(messages).find(k=>failure.message.includes(k))
        if(key){setUncertain(false);throw new Error(messages[key])}
        setUncertain(true);setRetryDirection(direction);throw new Error(t('Save was not confirmed. Retry the same direction with the same details, or refresh before entering again.','ثبت تأیید نشد. با همان جهت و معلومات دوباره کوشش کنید یا پیش از ثبت مجدد، فهرست را تازه‌سازی کنید.'))
      }
      setRequest(crypto.randomUUID());setRetryDirection('');setUncertain(false)
      setForm(previous=>({...previous,amount:'',description:'',trader_id:'',booking_id:'',employee_id:'',driver_id:'',loan:false,loan_due_date:'',loan_repayment_entry_id:''}))
      setNotice(t('Saved.','ثبت شد.'))
      try{await load()}catch{setNotice(t('Saved. Refresh the list to see the updated balance.','ثبت شد. برای دیدن موجودی جدید، فهرست را تازه‌سازی کنید.'))}
    }catch(err){setError(err.message)}finally{setBusy(false)}
  }
  return <div className="simple-cashbook">
    <div className="booking-page-header"><h1>{t('Cashbook','روزنامچه')}</h1><button className="registry-secondary" aria-label={t('Refresh','تازه‌سازی')} title={t('Refresh','تازه‌سازی')} disabled={loading||busy} onClick={refresh}><RefreshCw size={17}/></button></div>
    <div className="simple-cashbook-toolbar">
      {president?<label><span>{t('Account','حساب')}</span><select value={scope} disabled={busy||uncertain} onChange={e=>{setScope(e.target.value);setForm(previous=>({...previous,trader_id:'',booking_id:'',employee_id:'',driver_id:'',loan:false,loan_due_date:'',loan_repayment_entry_id:''}));setShown(20)}}>{accountOptions}</select></label>:<div className="cashbook-account-display"><span>{t('Account','حساب')}</span><strong>{name(scope)}</strong></div>}
      <label><span>{t('Date','تاریخ')}</span><SolarHijriDateInput required language={language} value={period==='date'?customRange.start:periodEnd} ariaLabel={t('Statement date','تاریخ صورت حساب')} onChange={date=>{setCustomRange({start:date,end:date});setPeriod('date');setShown(20)}}/></label>
      <label><span>{t('Period','بازه زمانی')}</span><select value={period} onChange={e=>{setPeriod(e.target.value);setShown(20)}}><option value="today">{t('Today','امروز')}</option><option value="yesterday">{t('Yesterday','دیروز')}</option><option value="week">{t('This week','این هفته')}</option><option value="month">{t('This month','این ماه')}</option><option value="year">{t('This year','امسال')}</option><option value="date">{t('Selected date','تاریخ انتخاب‌شده')}</option><option value="all">{t('All time','همه زمان‌ها')}</option><option value="custom">{t('Custom dates','تاریخ دلخواه')}</option></select></label>
      {period==='custom'&&<>
        <label><span>{t('From','از تاریخ')}</span><SolarHijriDateInput language={language} value={customRange.start} ariaLabel={t('From','از تاریخ')} onChange={start=>{setCustomRange(current=>({...current,start}));setShown(20)}}/></label>
        <label><span>{t('Through','تا تاریخ')}</span><SolarHijriDateInput language={language} value={customRange.end} ariaLabel={t('Through','تا تاریخ')} onChange={end=>{setCustomRange(current=>({...current,end}));setShown(20)}}/></label>
      </>}
      <button type="button" className="registry-secondary" disabled={!loaded||loading||!validPeriod||busy} onClick={printPeriod}><Printer size={17}/>{t('Print / Save PDF','چاپ / ذخیره PDF')}</button>
    </div>
    {notice&&<p className="registry-notice success" role="status">{notice}</p>}
    {error&&<p className="registry-notice error" role="alert">{error}</p>}
    {!loading&&loaded&&validPeriod&&(<div className="cashbook-summary"><div><span>{t('Opening balance','موجودی اول دوره')}</span><strong>{money(selectedLedger.opening)}</strong></div><div><span>{t('Money In','آمد')}</span><strong className="simple-money-in">{money(selectedLedger.incoming)}</strong></div><div><span>{t('Money Out','رفت')}</span><strong className="simple-money-out">{money(selectedLedger.outgoing)}</strong></div><div className="cashbook-summary-balance"><span>{t('Closing balance','موجودی پایان دوره')}</span><strong>{money(selectedLedger.balance)}</strong></div></div>)}
    <form className="simple-cashbook-form" onSubmit={save}><div className="simple-cashbook-form-heading"><h2>{t('Add a record','ثبت معامله')}</h2><p>{name(scope)} · {currency}</p></div><fieldset disabled={busy||uncertain}>
      <label className="cashbook-date-field"><span>{t('Date','تاریخ')} *</span><SolarHijriDateInput required max={kabulToday()} language={language} value={form.date} onChange={date=>setForm({...form,date})} ariaLabel={t('Date','تاریخ')}/></label>
      <label className="cashbook-currency-field"><span>{t('Currency','واحد پول')} *</span><select value={currency} onChange={e=>{setCurrency(e.target.value);setForm(previous=>({...previous,booking_id:'',loan_repayment_entry_id:''}))}}>{currencies.map(c=><option key={c}>{c}</option>)}</select></label>
      <label className="cashbook-amount-field"><span>{t('Amount','مبلغ')} ({currency}) *</span><input required type="number" inputMode="decimal" min="0.01" max="999999999999.99" step="0.01" placeholder="0.00" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/></label>
      <label className="cashbook-description-field"><span>{t('Name / description','نام / شرح معامله')} *</span><input required placeholder={t('Who or what is this for?','نام شخص یا دلیل معامله')} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
      {president&&<details className="simple-cashbook-description"><summary>{t('Link to an employee (optional)','وصل به کارمند (اختیاری)')}</summary><label><span>{t('Employee','کارمند')}</span><select value={form.employee_id} onChange={e=>setForm({...form,employee_id:e.target.value,trader_id:'',booking_id:'',driver_id:'',loan_repayment_entry_id:''})}><option value="">—</option>{employees.filter(row=>!row.archived_at).map(row=><option key={row.id} value={row.id}>{row.first_name} {row.last_name} · {row.phone}</option>)}</select></label>{!employees.some(row=>!row.archived_at)&&<p className="booking-help">{t('Add an employee on the Employees page first.','ابتدا یک کارمند در صفحه کارمندان اضافه کنید.')}</p>}</details>}
      {president&&<details className="simple-cashbook-description"><summary>{t('Link to a driver (optional)','وصل به راننده (اختیاری)')}</summary><label><span>{t('Driver','راننده')}</span><select value={form.driver_id} onChange={e=>setForm({...form,driver_id:e.target.value,trader_id:'',booking_id:'',employee_id:'',loan_repayment_entry_id:''})}><option value="">—</option>{drivers.filter(row=>!row.archived_at&&(!row.branch_id||scope==='admin'||row.branch_id===scope)).map(row=><option key={row.id} value={row.id}>{row.full_name} · {row.phone}</option>)}</select></label>{!drivers.some(row=>!row.archived_at)&&<p className="booking-help">{t('Add a driver in Fleet first.','ابتدا یک راننده در بخش وسایط اضافه کنید.')}</p>}</details>}
      {traders.length>0&&<details className="simple-cashbook-description"><summary>{t('Link to a trader (optional)','وصل به حساب تاجر (اختیاری)')}</summary><label><span>{t('Trader','تاجر')}</span><select value={form.trader_id||''} onChange={e=>setForm({...form,trader_id:e.target.value,booking_id:'',employee_id:'',driver_id:'',loan:false,loan_due_date:'',loan_repayment_entry_id:''})}><option value="">—</option>{traders.filter(r=>!r.archived_at&&(!r.branch_id||r.branch_id===scope)).map(r=><option key={r.id} value={r.id}>{r.full_name} · {r.phone}</option>)}</select></label>{form.trader_id&&<label><span>{t('Booking (optional)','بوکینگ (اختیاری)')}</span><select value={form.booking_id} onChange={e=>setForm({...form,booking_id:e.target.value})}><option value="">{t('General trader payment','پرداخت عمومی تاجر')}</option>{bookings.filter(row=>row.trader_id===form.trader_id&&!row.archived_at&&!row.deleted_at&&row.branch_id===(scope==='admin'?null:scope)&&row.commission_currency===currency).map(row=><option key={row.id} value={row.id}>#{row.booking_number}</option>)}</select></label>}</details>}
      {president&&<details className="simple-cashbook-description"><summary>{t('Repay a loan (Money In)','بازپرداخت قرض (پول آمد)')}</summary><label><span>{t('Open loan','قرض باز')}</span><select value={form.loan_repayment_entry_id} onChange={e=>setForm(previous=>({...previous,loan_repayment_entry_id:e.target.value,employee_id:'',driver_id:'',trader_id:'',booking_id:'',loan:false,loan_due_date:''}))}><option value="">—</option>{loans.filter(row=>row.currency===currency).map(row=><option key={row.id} value={row.id}>#{row.receipt_number} · {row.person} · {Number(row.remaining).toLocaleString()} {row.currency} {t('remaining','باقی‌مانده')}</option>)}</select></label>{!loans.some(row=>row.currency===currency)&&<p className="booking-help">{t('No open loans in this currency.','قرض بازی با این واحد پول وجود ندارد.')}</p>}</details>}
      {president&&<div className="cashbook-loan-option"><label><input type="checkbox" checked={form.loan} disabled={!!form.loan_repayment_entry_id} onChange={e=>setForm(previous=>({...previous,loan:e.target.checked,loan_due_date:e.target.checked?previous.loan_due_date:''}))}/><span>{t('This payment is a loan (optional)','این پرداخت قرض است (اختیاری)')}</span></label>{form.loan&&<label><span>{t('Loan deadline','مهلت بازپرداخت قرض')} *</span><SolarHijriDateInput required min={form.date} language={language} value={form.loan_due_date} onChange={date=>setForm(previous=>({...previous,loan_due_date:date}))} ariaLabel={t('Loan deadline','مهلت بازپرداخت قرض')}/></label>}<small>{t('Select one employee or driver for a loan.','برای قرض یک کارمند یا راننده را انتخاب کنید.')}</small></div>}
    </fieldset><div className="simple-cashbook-buttons"><button type="submit" value="in" className="cashbook-in" disabled={loading||!loaded||busy||!!form.employee_id||!!form.driver_id||form.loan||uncertain&&retryDirection!=='in'||(!president&&!profile?.branch_id)}><ArrowDownLeft size={20}/>{busy&&retryDirection==='in'?t('Saving…','در حال ثبت…'):uncertain&&retryDirection==='in'?t('Retry Money In','کوشش مجدد آمد'):t('Save Money In','ثبت پول آمد')}</button><button type="submit" value="out" className="cashbook-out" disabled={loading||!loaded||busy||!!form.loan_repayment_entry_id||uncertain&&retryDirection!=='out'||(!president&&!profile?.branch_id)}><ArrowUpRight size={20}/>{busy&&retryDirection==='out'?t('Saving…','در حال ثبت…'):uncertain&&retryDirection==='out'?t('Retry Money Out','کوشش مجدد رفت'):t('Save Money Out','ثبت پول رفت')}</button></div></form>
    {loading?<p role="status">{t('Loading…','در حال بارگیری…')}</p>:loaded&&!validPeriod?<p role="status">{t('Choose a valid start and end date.','تاریخ آغاز و پایان درست انتخاب کنید.')}</p>:loaded&&<>
      <section className="cashbook-ledger" aria-label={t('Cashbook records','معاملات روزنامچه')}><h2>{t('Records','معاملات')}</h2><div className="simple-cashbook-list"><table><thead><tr><th scope="col">{t('Date','تاریخ')}</th><th scope="col">{t('Description','شرح معامله')}</th><th scope="col">{t('Money In','آمد')}</th><th scope="col">{t('Money Out','رفت')}</th>{president&&<th scope="col">{t('Correction','اصلاح')}</th>}</tr></thead><tbody>
        {selectedLedger.rows.slice(0,shown).map(row=><tr key={row.id} className={row.direction==='in'?'cashbook-row-in':'cashbook-row-out'}>
          <td data-label={t('Date','تاریخ')}>{formatSolarHijri(row.entry_date)}</td>
          <td data-label={t('Description','شرح معامله')}>{row.receipt_number ? `#${row.receipt_number} · ` : ''}{description(row)}</td>
          <td data-label={t('Money In','آمد')} className="simple-money-in">{row.direction==='in'?money(cents(row.amount)):'—'}</td>
          <td data-label={t('Money Out','رفت')} className="simple-money-out">{row.direction==='out'?money(cents(row.amount)):'—'}</td>
          {president&&<td data-label={t('Correction','اصلاح')}>
            {row.reversed_by ? `${t('Reversed by','اصلاح‌شده با')} #${row.reversed_by}`
              : row.reversal ? `${t('Reversal of','اصلاح رسید')} #${row.reverses_receipt}`
              : row.operation_id && <div className="cashbook-correction-actions">
                {row.can_edit_amount&&<button type="button" className="registry-secondary" disabled={busy||uncertain} onClick={()=>openCorrection(row,'edit')}>{t('Edit amount','ویرایش مبلغ')}</button>}
                <button type="button" className="registry-secondary" disabled={busy||uncertain} onClick={()=>openCorrection(row,'reverse')}>{t('Reverse','معکوس‌کردن')}</button>
              </div>}
            {!!row.corrections?.length&&<details className="cashbook-correction-history">
              <summary>{t('Amount history','تاریخچه مبلغ')}</summary>
              <ul>{row.corrections.map(item=><li key={item.request_id}>
                <bdi>{money(cents(item.previous_amount))} → {money(cents(item.corrected_amount))}</bdi>
                <span>{formatSolarHijri(item.changed_at)} · {item.reason}</span>
              </li>)}</ul>
            </details>}
          </td>}
        </tr>)}
        {!selectedLedger.rows.length&&<tr><td colSpan={president?5:4} className="simple-cashbook-empty">{t('No records for this period.','در این بازه معامله‌ای ثبت نشده است.')}</td></tr>}
      </tbody></table></div>{selectedLedger.rows.length>shown&&<button type="button" className="cashbook-see-more" onClick={()=>setShown(current=>current+20)}>{t('See more','نمایش بیشتر')}</button>}</section>
    </>}
    {correction&&president&&<Modal title={`${correction.mode==='edit'?t('Edit receipt amount','ویرایش مبلغ رسید'):t('Reverse receipt','معکوس‌کردن رسید')} #${correction.row.receipt_number}`} busy={busy} onClose={()=>setCorrection(null)}>
      <form className="registry-form" onSubmit={saveCorrection}>
        <p className="wide">{description(correction.row)} · {money(cents(correction.row.amount))}</p>
        {correction.mode==='edit'
          ? <label className="wide"><span>{t('Corrected amount','مبلغ اصلاح‌شده')} ({currency}) *</span>
            <input type="number" inputMode="decimal" required min="0.01" max="999999999999.99" step="0.01" value={correctedAmount} disabled={busy} onChange={event=>setCorrectedAmount(event.target.value)}/>
          </label>
          : <p className="wide booking-help">{t('An opposite entry will be recorded today. The original receipt stays in the history.','یک معامله معکوس به تاریخ امروز ثبت می‌شود. رسید اصلی در تاریخچه باقی می‌ماند.')}</p>}
        <label className="wide"><span>{t('Reason','دلیل')} *</span><textarea value={reason} maxLength={500} required disabled={busy} onChange={event=>setReason(event.target.value)}/></label>
        {correctionError&&<p className="wide registry-notice error" role="alert">{correctionError}</p>}
        <div className="registry-form-actions">
          <button type="button" disabled={busy} onClick={()=>setCorrection(null)}>{t('Cancel','انصراف')}</button>
          <button className="registry-primary" disabled={busy||!reason.trim()||(correction.mode==='edit'&&Number(correctedAmount)===Number(correction.row.amount))}>
            {correction.mode==='edit'?t('Save amount','ثبت مبلغ'):t('Record reversal','ثبت معامله معکوس')}
          </button>
        </div>
      </form>
    </Modal>}
  </div>
}
