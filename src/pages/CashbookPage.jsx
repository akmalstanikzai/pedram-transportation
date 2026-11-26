import { useCallback, useEffect, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, BadgeDollarSign, BriefcaseBusiness, HandCoins, Landmark, Pencil, Printer, RefreshCw, RotateCcw, Stamp, Truck, UserRound } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { allRows, cents, currencies, kabulToday, simpleLedger, ledgerPeriod, payees, payeeTitleDari } from '../lib/cashbook'
import { rpc } from '../lib/operations'
import { bookingDue } from '../lib/bookingFinance'
import { IconButton, Modal } from '../components/RecordTools'
import Icon from '../components/Icon'
import CompactTable from '../components/CompactTable'
import CustomsAgentAccount from '../components/CustomsAgentAccount'
import { printRecord } from '../lib/recordExports'
import { canPrintReceipt, cashbookReceipt } from '../lib/financialReports'
import SolarHijriDateInput from '../components/SolarHijriDateInput'
import { formatSolarHijri, solarHijriToday, solarHijriToISODate } from '../lib/solarHijri'
import { recordQuery, withRecordReturn } from '../lib/recordRoutes'
import './CashbookPage.css'

const emptyPayee = {payee_type:'',payee_name:''}
const emptyLinks = {
  trader_id:'',booking_id:'',employee_id:'',driver_id:'',loan:false,loan_due_date:'',loan_repayment_entry_id:'',...emptyPayee,
}

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

export default function CashbookPage({ language, profile, onBack }) {
  const destination = recordQuery()
  const receipt = destination.get('receipt')
  const receiptDate = /^\d{4}-\d{2}-\d{2}$/.test(destination.get('date') || '') ? destination.get('date') : null
  const t=(en,fa)=>language==='fa'?fa:en
  const openingBalanceLabel=t('Opening balance','موجودی قبلی')
  const closingBalanceLabel=t('Closing balance','بیلانس')
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
  const [selectedScope,setScope]=useState(()=>destination.get('account') || 'admin')
  const scope=president?selectedScope:profile?.branch_id || ''
  const [currency,setCurrency]=useState(()=>currencies.includes(destination.get('currency')) ? destination.get('currency') : 'AFN')
  const [period,setPeriod]=useState(()=>receiptDate ? 'date' : ['today','month','all'].includes(destination.get('period')) ? destination.get('period') : 'today')
  const [customRange,setCustomRange]=useState(()=>({start:receiptDate || kabulToday(),end:receiptDate || kabulToday()}))
  const [shown,setShown]=useState(20)
  const [linkPanel,setLinkPanel]=useState('')
  const [form,setForm]=useState({amount:'',description:'',date:kabulToday(),...emptyLinks})
  const [request,setRequest]=useState(()=>crypto.randomUUID())
  const [retryDirection,setRetryDirection]=useState('')
  const [busy,setBusy]=useState(false)
  const [uncertain,setUncertain]=useState(false)
  const [correction,setCorrection]=useState(null)
  const [reason,setReason]=useState('')
  const [correctedAmount,setCorrectedAmount]=useState('')
  const [correctionError,setCorrectionError]=useState('')
  const [customsDirectory,setCustomsDirectory]=useState(null)
  const [customsAgent,setCustomsAgent]=useState('')
  const [customsBusy,setCustomsBusy]=useState(false)

  async function openCustomsPayments() {
    setCustomsAgent('')
    setCustomsDirectory({loading:true})
    try {
      const agents=await allRows(supabase,'customs_agents','id,name,phone,archived_at','id')
      setCustomsDirectory({agents:agents.filter(agent=>!agent.archived_at).sort((a,b)=>a.name.localeCompare(b.name))})
    } catch {
      setCustomsDirectory({error:true})
    }
  }
  const loadPayments = useCallback(async () => {
    if (!president) return []
    const [entries, operations, corrections] = await Promise.all([
      allRows(supabase,'cashbook_entries'),
      allRows(supabase,'cashbook_operations','id,receipt_number,mode,reverses_id,payroll_deduction:request_payload->>payroll_loan_deduction,managed_expense:request_payload->>managed_expense_id'),
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
        can_edit_amount: ['income','expense'].includes(operation?.mode) && !entry.is_transfer && !operation.payroll_deduction && !operation.managed_expense,
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
  const matchingRecords=receipt ? selectedLedger.rows.filter(row=>String(row.receipt_number)===receipt) : selectedLedger.rows
  const displayedRecords=matchingRecords.slice(0,shown)
  const accountOptions=<>{president&&<option value="admin">{t('Admin account','حساب مرکزی')}</option>}{data.branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</>
  const activeEmployees = employees.filter(row => !row.archived_at)
  const commissionBookings = bookings.filter(row => row.commission_driver_id
    && row.branch_id === (scope === 'admin' ? null : scope) && row.commission_currency === currency)
  const driverCommission = !!(form.driver_id && form.booking_id)
  const driverCommissionOptions = commissionBookings.filter(row => row.commission_driver_id === form.driver_id
    && (bookingDue(row.charged,row.paid)>0 || row.id===form.booking_id))
  const activeDrivers = drivers.filter(row => (!row.archived_at && (!row.branch_id || scope === 'admin' || row.branch_id === scope))
    || commissionBookings.some(booking => booking.commission_driver_id===row.id && bookingDue(booking.charged,booking.paid)>0))
  const activeTraders = traders.filter(row => !row.archived_at && (!row.branch_id || row.branch_id === scope))
  const openLoans = loans.filter(row => row.currency === currency)
  const bookingOptions = bookings.filter(row => !row.commission_driver_id && row.trader_id === form.trader_id && !row.archived_at && !row.deleted_at
    && row.branch_id === (scope === 'admin' ? null : scope)
    && (row.managed_transport
      ? row.managed_transport.balances?.some(balance=>balance.currency===currency && (bookingDue(balance.charged,balance.paid)>0 || row.id===form.booking_id))
      : row.commission_currency === currency))
  const managedInstallment = !!(form.trader_id && bookingOptions.find(row=>row.id===form.booking_id)?.managed_transport)
  const roleLinks = [
    {id:'employee', icon:BriefcaseBusiness, label:t('Employee','کارمند'), value:form.employee_id},
    {id:'driver', icon:Truck, label:t('Driver','راننده'), value:form.driver_id},
    {id:'trader', icon:BadgeDollarSign, label:t('Trader','تاجر'), value:form.trader_id},
  ]
  const links = [
    ...(president ? roleLinks : []),
    {id:'payee', icon:UserRound, label:t('Payee',payeeTitleDari), value:form.payee_type},
  ]
  function description(row) {
    if (row.opening) return t('Earlier balance','موجودی قبلی')
    if (row.private_activity) return t('Linked booking and trader activity','مجموع معاملات بار نامه‌ها و تاجران')
    return `${row.description}${row.loan_due_date ? ` · ${t('Loan due','مهلت قرض')} ${formatSolarHijri(row.loan_due_date)}` : ''}${row.loan_repayment_entry_id ? ` · ${t('Loan repayment','بازپرداخت قرض')}` : ''}`
  }

  function printReceipt(row) {
    if (!canPrintReceipt(row)) return
    const report = cashbookReceipt({ row: { ...row, currency }, language, account: name(row.branch_id || 'admin') })
    if (!printRecord(report)) setError(t('Allow pop-ups to print this receipt.','برای چاپ رسید، پنجرهٔ جدید را اجازه دهید.'))
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
        { title: t('Period summary','خلاصه دوره'), receiptColumns: 4, rows: [
          [openingBalanceLabel,money(selectedLedger.opening)],
          [t('Money In','آمد'),money(selectedLedger.incoming)],
          [t('Money Out','رفت'),money(selectedLedger.outgoing)],
          [closingBalanceLabel,money(selectedLedger.balance)],
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
      window.dispatchEvent(new Event('pedram:cashbook-changed'))
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
        PAYROLL_DEDUCTION_REVERSE_REQUIRED: t('Reverse this salary payment before recording a correction.','برای اصلاح، ابتدا این پرداخت معاش را معکوس کنید.'),
        LOAN_AMOUNT_BELOW_RECOVERED: t('The loan amount cannot be lower than the amount already recovered.','اصل قرض نمی‌تواند کمتر از مبلغ بازپرداخت‌شده باشد.'),
        LOAN_REPAYMENT_EXCEEDS_BALANCE: t('The corrected payment exceeds the outstanding loan.','مبلغ اصلاح‌شده از قرض باقی‌مانده بیشتر است.'),
        DRIVER_COMMISSION_EXCEEDS_BALANCE: t('The correction exceeds the unpaid driver commission.','مبلغ اصلاح‌شده از کمیسیون باقی‌ماندهٔ راننده بیشتر است.'),
        MANAGED_PAYMENT_EXCEEDS_BALANCE: t('The correction exceeds the booking balance in this currency.','مبلغ اصلاح‌شده از بدهی بار نامه در این واحد پول بیشتر است.'),
        INVALID_AMOUNT: t('Enter a positive amount with up to two decimal places.','یک مبلغ مثبت با حداکثر دو رقم اعشار وارد کنید.'),
        CUSTOMS_EXCEEDS_BALANCE: t('The corrected amount exceeds the remaining fee.','مبلغ اصلاح‌شده از حق‌الزحمه باقی‌مانده بیشتر است.'),
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
    if(form.payee_type && direction!=='out')return
    if(form.payee_type==='miscellaneous' && !form.payee_name.trim()){
      setLinkPanel('payee')
      setError(t('Enter the payee name.','نام شخص را وارد کنید.'))
      return
    }
    if(driverCommission && (direction!=='in' || !driverCommissionOptions.some(row=>row.id===form.booking_id))){
      setError(t('Select a driver commission for this account and currency, then save Money In.','کمیسیون راننده را برای همین حساب و واحد پول انتخاب کنید و پول آمد را ثبت کنید.'));return
    }
    if(form.loan&&(!form.loan_due_date||(!form.employee_id&&!form.driver_id)||form.loan_due_date<form.date)){setError(t('Choose an employee or driver and a loan deadline on or after the transaction date.','یک کارمند یا راننده و مهلت قرض را در تاریخ معامله یا پس از آن انتخاب کنید.'));return}
    if(form.loan_repayment_entry_id&&direction!=='in'){setError(t('Record a loan repayment as Money In.','بازپرداخت قرض را به‌عنوان پول آمد ثبت کنید.'));return}
    setBusy(true);setError('')
    try{
      const {error:failure}=await (form.payee_type
        ? supabase.rpc('save_paid_office_expense',{
            p_request:request,p_branch:scope==='admin'?null:scope,p_category:'other',p_currency:currency,
            p_amount:form.amount,p_date:form.date,p_description:form.description.trim(),
            p_payee_type:form.payee_type,p_payee_name:form.payee_name.trim()||null,
          })
        : driverCommission
        ? supabase.rpc('receive_driver_booking_commission',{p_request:request,p_booking:form.booking_id,p_driver:form.driver_id,p_amount:form.amount,p_date:form.date,p_description:form.description.trim()})
        : supabase.rpc('cashbook_simple_post',{p_request:request,p_data:{branch_id:scope==='admin'?null:scope,currency,direction,amount:form.amount,date:form.date,description:form.description.trim(),trader_id:form.trader_id||null,booking_id:form.booking_id||null,employee_id:direction==='out'?form.employee_id||null:null,driver_id:direction==='out'?form.driver_id||null:null,loan_due_date:direction==='out'&&form.loan?form.loan_due_date:null,loan_repayment_entry_id:direction==='in'?form.loan_repayment_entry_id||null:null}}))
      if(failure){
        const messages={ACCESS_DENIED:t('You cannot record money for this account.','شما اجازه ثبت پول در این حساب را ندارید.'),INVALID_AMOUNT:t('Enter a positive amount with up to two decimal places.','یک مبلغ مثبت با حداکثر دو رقم اعشار وارد کنید.'),INVALID_DATE:t('Choose today or an earlier date.','تاریخ امروز یا گذشته را انتخاب کنید.'),DESCRIPTION_REQUIRED:t('Enter a name or description.','نام یا شرح معامله را وارد کنید.'),BOOKING_PAYMENT_UNAVAILABLE:t('Choose an active booking in this currency.','بوکینگ فعال را با همین واحد پول انتخاب کنید.'),EMPLOYEE_UNAVAILABLE:t('Choose an active employee.','یک کارمند فعال را انتخاب کنید.'),INVALID_PARTY_PAYMENT:t('Only one employee or driver can be linked to Money Out.','فقط یک کارمند یا راننده به پول رفت وصل می‌شود.'),DRIVER_UNAVAILABLE:t('Choose an active driver.','یک راننده فعال را انتخاب کنید.'),INVALID_LOAN:t('Link the loan to one employee or driver and record Money Out.','قرض را به یک کارمند یا راننده وصل کرده و پول رفت ثبت کنید.'),INVALID_LOAN_DEADLINE:t('The loan deadline must be on or after the transaction date.','مهلت قرض باید در تاریخ معامله یا پس از آن باشد.'),INVALID_LOAN_REPAYMENT:t('Choose an open loan and record Money In.','یک قرض باز را انتخاب کرده و پول آمد ثبت کنید.'),LOAN_UNAVAILABLE:t('This loan is no longer available. Refresh the cashbook.','این قرض دیگر در دسترس نیست. روزنامچه را تازه کنید.'),LOAN_CURRENCY_MISMATCH:t('Use the same currency as the loan.','از واحد پول قرض استفاده کنید.'),LOAN_REPAYMENT_EXCEEDS_BALANCE:t('The repayment exceeds the remaining loan balance.','بازپرداخت از مانده قرض بیشتر است.')}
        messages.DRIVER_COMMISSION_EXCEEDS_BALANCE=t('The amount exceeds the unpaid driver commission.','مبلغ از کمیسیون باقی‌ماندهٔ راننده بیشتر است.')
        messages.MANAGED_PAYMENT_EXCEEDS_BALANCE=t('The payment exceeds the booking balance in this currency.','مبلغ از بدهی بار نامه در این واحد پول بیشتر است.')
        messages.INVALID_EXPENSE_PAYEE=t('Check the payee type and name.','نوع پرداخت و نام شخص را بررسی کنید.')
        const key=Object.keys(messages).find(k=>failure.message.includes(k))
        if(key){setUncertain(false);throw new Error(messages[key])}
        setUncertain(true);setRetryDirection(direction);throw new Error(t('Save was not confirmed. Retry the same direction with the same details, or refresh before entering again.','ثبت تأیید نشد. با همان جهت و معلومات دوباره کوشش کنید یا پیش از ثبت مجدد، فهرست را تازه‌سازی کنید.'))
      }
      setRequest(crypto.randomUUID());setRetryDirection('');setUncertain(false)
      window.dispatchEvent(new Event('pedram:cashbook-changed'))
      setForm(previous=>({...previous,amount:'',description:'',...emptyLinks}))
      setLinkPanel('')
      setNotice(t('Saved.','ثبت شد.'))
      try{await load()}catch{setNotice(t('Saved. Refresh the list to see the updated balance.','ثبت شد. برای دیدن موجودی جدید، فهرست را تازه‌سازی کنید.'))}
    }catch(err){setError(err.message)}finally{setBusy(false)}
  }
  return <div className="simple-cashbook">
    <header className="cashbook-heading">
      <div className="cashbook-heading-start">
        {onBack && <button type="button" className="module-back cashbook-back" onClick={onBack}>
          <Icon name="back" size={16}/>{t('Back','بازگشت')}
        </button>}
        <h1><Landmark size={22} aria-hidden="true"/>{t('Cashbook','روزنامچه')}</h1>
      </div>
      <IconButton icon={RefreshCw} label={t('Refresh','تازه‌سازی')} disabled={loading||busy} onClick={refresh}/>
    </header>
    <section className="cashbook-filters" aria-label={t('Statement options','گزینه‌های صورت حساب')}>
      <div className="cashbook-filter-row">
        {president ? <label className="cashbook-field">
          <span>{t('Account','حساب')}</span>
          <select value={scope} title={name(scope)} disabled={busy||uncertain} onChange={e=>{
            setScope(e.target.value)
            setForm(previous=>({...previous,...emptyLinks}))
            setLinkPanel('')
            setShown(20)
          }}>{accountOptions}</select>
        </label> : <div className="cashbook-field cashbook-account-display">
          <span>{t('Account','حساب')}</span>
          <strong title={name(scope)}>{name(scope)}</strong>
        </div>}
        <SolarHijriDateInput iconOnly required language={language} value={period==='date'?customRange.start:periodEnd}
          ariaLabel={t('Statement date','تاریخ صورت حساب')} onChange={date=>{setCustomRange({start:date,end:date});setPeriod('date');setShown(20)}}/>
        <label className="cashbook-field">
          <span>{t('Period','مشاهده قبلی')}</span>
          <select value={period} onChange={e=>{setPeriod(e.target.value);setShown(20)}}>
            <option value="today">{t('Today','امروز')}</option>
            <option value="yesterday">{t('Yesterday','دیروز')}</option>
            <option value="week">{t('This week','این هفته')}</option>
            <option value="month">{t('This month','این ماه')}</option>
            <option value="year">{t('This year','امسال')}</option>
            <option value="date">{t('Selected date','تاریخ انتخابی')}</option>
            <option value="all">{t('All time','همه زمان‌ها')}</option>
            <option value="custom">{t('Custom dates','بازه دلخواه')}</option>
          </select>
        </label>
        <IconButton icon={Printer} label={t('Print / Save PDF','چاپ / ذخیره PDF')} disabled={!loaded||loading||!validPeriod||busy} onClick={printPeriod}/>
      </div>
      {period==='date'&&<p className="cashbook-selected-date">{t('Selected date','تاریخ انتخابی')} · <bdi>{formatSolarHijri(customRange.start)}</bdi></p>}
      {period==='custom'&&<div className="cashbook-range">
        <div className="cashbook-field"><span>{t('From','از تاریخ')}</span>
          <SolarHijriDateInput language={language} value={customRange.start} ariaLabel={t('From','از تاریخ')} onChange={start=>{setCustomRange(current=>({...current,start}));setShown(20)}}/>
        </div>
        <div className="cashbook-field"><span>{t('Through','تا تاریخ')}</span>
          <SolarHijriDateInput language={language} value={customRange.end} ariaLabel={t('Through','تا تاریخ')} onChange={end=>{setCustomRange(current=>({...current,end}));setShown(20)}}/>
        </div>
      </div>}
    </section>
    {notice&&<p className="registry-notice success" role="status">{notice}</p>}
    {error&&<p className="registry-notice error" role="alert">{error}</p>}
    {!loading&&loaded&&validPeriod&&<section className="cashbook-balances" aria-labelledby="cashbook-balances-title">
      <h2 id="cashbook-balances-title">{t('Balance summary','خلاصه حساب')}</h2>
      <dl>
        <div><dt>{openingBalanceLabel}</dt><dd><bdi>{money(selectedLedger.opening)}</bdi></dd></div>
        <div><dt>{t('Money In','پول آمد')}</dt><dd className="simple-money-in"><bdi>{money(selectedLedger.incoming)}</bdi></dd></div>
        <div><dt>{t('Money Out','پول رفت')}</dt><dd className="simple-money-out"><bdi>{money(selectedLedger.outgoing)}</bdi></dd></div>
        <div className="cashbook-closing"><dt>{closingBalanceLabel}</dt><dd><bdi>{money(selectedLedger.balance)}</bdi></dd></div>
      </dl>
    </section>}
    <form className="simple-cashbook-form" onSubmit={save} aria-labelledby="cashbook-add-title">
      <div className="cashbook-section-heading">
        <h2 id="cashbook-add-title">{t('Add a record','ثبت معامله')}</h2>
        <small>{name(scope)}{form.date!==kabulToday()&&<> · <bdi>{formatSolarHijri(form.date)}</bdi></>}</small>
      </div>
      <fieldset className="cashbook-entry-fields" disabled={busy||uncertain}>
        <div className="cashbook-entry-row">
          <SolarHijriDateInput iconOnly required max={kabulToday()} language={language} value={form.date}
            onChange={date=>setForm(previous=>({...previous,date}))} ariaLabel={t('Transaction date','تاریخ معامله')}/>
          <label className="cashbook-field">
            <span>{t('Amount','مبلغ')} *</span>
            <input required type="number" dir="ltr" inputMode="decimal" min="0.01" max="999999999999.99" step="0.01" placeholder="0.00"
              value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/>
          </label>
          <label className="cashbook-field">
            <span>{t('Currency','واحد پول')}</span>
            <select dir="ltr" value={currency} onChange={e=>{setCurrency(e.target.value);setForm(previous=>({...previous,booking_id:'',loan_repayment_entry_id:''}))}}>
              {currencies.map(c=><option key={c}>{c}</option>)}
            </select>
          </label>
        </div>
        <div className={`cashbook-description-row${president?' with-loan':''}`}>
          <label className="cashbook-field">
            <span>{t('Description','تفصیلات')} *</span>
            <input required placeholder={t('Name or reason','نام شخص یا دلیل')} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/>
          </label>
          {president&&<label className="cashbook-loan-toggle">
            <input type="checkbox" checked={form.loan} disabled={!!form.loan_repayment_entry_id||driverCommission||!!form.payee_type} onChange={e=>{
              const loan=e.target.checked
              setForm(previous=>({...previous,loan,loan_due_date:loan?previous.loan_due_date:''}))
              if(loan)setLinkPanel(form.driver_id?'driver':'employee')
            }}/>
            <span>{t('Loan','قرض')}</span>
          </label>}
        </div>
        {president&&form.loan&&<div className="cashbook-loan-details">
          <div className="cashbook-field">
            <span>{t('Loan deadline','مهلت بازپرداخت قرض')} *</span>
            <SolarHijriDateInput required min={form.date} language={language} value={form.loan_due_date}
              onChange={date=>setForm(previous=>({...previous,loan_due_date:date}))} ariaLabel={t('Loan deadline','مهلت بازپرداخت قرض')}/>
          </div>
          <small>{t('Select one employee or driver for a loan.','برای قرض یک کارمند یا راننده را انتخاب کنید.')}</small>
        </div>}
        {(president||profile?.branch_id)&&<section className="cashbook-links" aria-labelledby="cashbook-links-title">
          <h3 id="cashbook-links-title">{t('Link a record','وصل معامله')}</h3>
          <div className="cashbook-link-buttons">
            {links.map(({id,icon:Icon,label,value})=><button key={id} type="button" className="cashbook-link-button" data-kind={id}
              aria-expanded={linkPanel===id} aria-controls={linkPanel===id?'cashbook-link-panel':undefined} data-linked={!!value}
              onClick={()=>setLinkPanel(current=>current===id?'':id)}>
              <Icon size={16} aria-hidden="true"/>{label}
            </button>)}
            {president&&<><button type="button" className="cashbook-link-button cashbook-customs-button" disabled={loading||!loaded}
              onClick={openCustomsPayments}><Stamp size={16} aria-hidden="true"/>{t('Commission agent','کمیشن کار')}</button>
            <button type="button" className="cashbook-link-button" aria-expanded={linkPanel==='repayment'}
              aria-controls={linkPanel==='repayment'?'cashbook-link-panel':undefined} data-linked={!!form.loan_repayment_entry_id}
              onClick={()=>setLinkPanel(current=>current==='repayment'?'':'repayment')}>
              <HandCoins size={16} aria-hidden="true"/>{t('Loan repayment','بازپرداخت قرض')}
            </button></>}
          </div>
          {linkPanel&&(president||linkPanel==='payee')&&<div id="cashbook-link-panel" className="cashbook-link-panel">
            {linkPanel==='payee'&&<div className="cashbook-trader-fields cashbook-payee-fields">
              <label className="cashbook-field">
                <span>{t('Payee',payeeTitleDari)}</span>
                <select value={form.payee_type} onChange={e=>{
                  const type=e.target.value
                  setForm(previous=>({...previous,...(type ? emptyLinks : emptyPayee),payee_type:type}))
                }}>
                  <option value="">—</option>
                  {Object.entries(payees).map(([id,label])=><option key={id} value={id}>{t(...label)}</option>)}
                </select>
              </label>
              {form.payee_type==='miscellaneous'&&<label className="cashbook-field">
                <span>{t('Payee name','نام شخص')} *</span>
                <input required maxLength={100} value={form.payee_name} onChange={e=>setForm({...form,payee_name:e.target.value})}/>
              </label>}
            </div>}
            {linkPanel==='employee'&&<label className="cashbook-field">
              <span>{t('Employee','کارمند')}</span>
              <select value={form.employee_id} onChange={e=>setForm({...form,...emptyPayee,employee_id:e.target.value,trader_id:'',booking_id:'',driver_id:'',loan_repayment_entry_id:''})}>
                <option value="">—</option>
                {activeEmployees.map(row=><option key={row.id} value={row.id}>{row.first_name} {row.last_name} · {row.phone}</option>)}
              </select>
              {!activeEmployees.length&&<small>{t('Add an employee on the Employees page first.','ابتدا یک کارمند در صفحه کارمندان اضافه کنید.')}</small>}
            </label>}
            {linkPanel==='driver'&&<div className="cashbook-trader-fields">
              <label className="cashbook-field">
                <span>{t('Driver','راننده')}</span>
                <select value={form.driver_id} onChange={e=>setForm({...form,...emptyPayee,driver_id:e.target.value,trader_id:'',booking_id:'',employee_id:'',loan_repayment_entry_id:''})}>
                  <option value="">—</option>
                  {activeDrivers.map(row=><option key={row.id} value={row.id}>{row.full_name} · {row.phone}</option>)}
                </select>
                {!activeDrivers.length&&<small>{t('No active drivers for this account.','برای این حساب راننده فعال وجود ندارد.')}</small>}
              </label>
              {driverCommissionOptions.length>0&&<label className="cashbook-field">
                <span>{t('Booking commission','کمیسیون بار نامه')}</span>
                <select value={form.booking_id} onChange={e=>setForm({...form,booking_id:e.target.value,loan:false,loan_due_date:''})}>
                  <option value="">{t('Choose a booking','بار نامه را انتخاب کنید')}</option>
                  {driverCommissionOptions.map(row=><option key={row.id} value={row.id}>#{row.booking_number} · {money(bookingDue(row.charged,row.paid))} {t('remaining','باقی‌مانده')}</option>)}
                </select>
                <small>{t('Choose a booking to record commission as Money In.','برای ثبت کمیسیون در پول آمد، بار نامه را انتخاب کنید.')}</small>
              </label>}
            </div>}
            {linkPanel==='trader'&&<div className="cashbook-trader-fields">
              <label className="cashbook-field">
                <span>{t('Trader','تاجر')}</span>
                <select value={form.trader_id} onChange={e=>setForm({...form,...emptyLinks,trader_id:e.target.value})}>
                  <option value="">—</option>
                  {activeTraders.map(row=><option key={row.id} value={row.id}>{row.full_name} · {row.phone}</option>)}
                </select>
                {!activeTraders.length&&<small>{t('No active traders for this account.','برای این حساب تاجر فعال وجود ندارد.')}</small>}
              </label>
              {form.trader_id&&<label className="cashbook-field">
                <span>{t('Booking (optional)','بار نامه (اختیاری)')}</span>
                <select value={form.booking_id} onChange={e=>setForm({...form,booking_id:e.target.value})}>
                  <option value="">{t('General payment','پرداخت عمومی')}</option>
                  {bookingOptions.map(row=><option key={row.id} value={row.id}>#{row.booking_number}</option>)}
                </select>
              </label>}
            </div>}
            {linkPanel==='repayment'&&<label className="cashbook-field">
              <span>{t('Open loan · Money In','قرض باز · پول آمد')}</span>
              <select value={form.loan_repayment_entry_id} onChange={e=>setForm(previous=>({...previous,...emptyLinks,loan_repayment_entry_id:e.target.value}))}>
                <option value="">—</option>
                {openLoans.map(row=><option key={row.id} value={row.id}>#{row.receipt_number} · {row.person} · {Number(row.remaining).toLocaleString()} {row.currency} {t('remaining','باقی‌مانده')}</option>)}
              </select>
              {!openLoans.length&&<small>{t('No open loans in this currency.','قرض بازی با این واحد پول وجود ندارد.')}</small>}
            </label>}
          </div>}
        </section>}
      </fieldset>
      <div className="simple-cashbook-buttons">
        <button type="submit" value="in" className="cashbook-in"
          disabled={loading||!loaded||busy||!!form.payee_type||!!form.employee_id||(!!form.driver_id&&!driverCommission)||form.loan||uncertain&&retryDirection!=='in'||(!president&&!profile?.branch_id)}>
          <ArrowDownLeft size={17} aria-hidden="true"/>{busy&&retryDirection==='in'?t('Saving…','در حال ثبت…'):uncertain&&retryDirection==='in'?t('Retry Money In','کوشش مجدد آمد'):t('Save Money In','ثبت پول آمد')}
        </button>
        <button type="submit" value="out" className="cashbook-out"
          disabled={loading||!loaded||busy||driverCommission||managedInstallment||!!form.loan_repayment_entry_id||uncertain&&retryDirection!=='out'||(!president&&!profile?.branch_id)}>
          <ArrowUpRight size={17} aria-hidden="true"/>{busy&&retryDirection==='out'?t('Saving…','در حال ثبت…'):uncertain&&retryDirection==='out'?t('Retry Money Out','کوشش مجدد رفت'):t('Save Money Out','ثبت پول رفت')}
        </button>
      </div>
    </form>
    {loading?<p role="status">{t('Loading…','در حال بارگیری…')}</p>:loaded&&!validPeriod?<p role="status">{t('Choose a valid start and end date.','تاریخ آغاز و پایان درست انتخاب کنید.')}</p>:loaded&&<>
      <section className="cashbook-ledger" aria-labelledby="cashbook-ledger-title"><h2 id="cashbook-ledger-title">{t('Saved records','معاملات ثبت‌شده')}</h2>
        {receipt && <a href={withRecordReturn('#/cashbook',destination.get('return'))}>{t('Show all Cashbook records','نمایش همه معاملات روزنامچه')}</a>}
        <CompactTable key={JSON.stringify([scope,currency,periodStart,periodEnd])} label={t('Cashbook records','معاملات روزنامچه')} bulk={president ? {
          language, rows:displayedRecords.filter(row=>row.operation_id && !row.reversed_by && !row.reversal), disabled:busy||uncertain||loading,
          name:row=>row.receipt_number ? '#'+row.receipt_number : description(row),
          refresh:async()=>{window.dispatchEvent(new Event('pedram:cashbook-changed')); await load()},
          actions:[{label:t('Reverse selected','معکوس‌کردن انتخاب‌شده‌ها'), field:t('Reason','دلیل'),
            operationKey:row=>row.operation_id,
            run:(row,reason)=>rpc('reverse_cashbook_entry',{p_operation:row.operation_id,p_reason:reason}),
          }],
        } : undefined} columns={[
          {label:t('Date','تاریخ'),width:'22%'}, {label:t('Description','شرح معامله')},
          {label:t('Money In / Out','آمد / رفت'),width:'27%'},
        ]}>
        {displayedRecords.map(row=><tr key={row.id}>
          <th scope="row"><bdi>{formatSolarHijri(row.entry_date)}</bdi>{row.receipt_number > 0 && <small><bdi>#{row.receipt_number}</bdi></small>}</th>
          <td>{description(row)}
            {president && (row.reversed_by || row.reversal) && <small>{row.reversed_by
              ? `${t('Reversed by','اصلاح‌شده با')} #${row.reversed_by}`
              : `${t('Reversal of','اصلاح رسید')} #${row.reverses_receipt}`}</small>}
            <div className="cashbook-row-actions">
              {canPrintReceipt(row)&&<IconButton icon={Printer} label={t('Print receipt','چاپ رسید')} disabled={loading||busy} onClick={()=>printReceipt(row)}/>}
              {president && row.operation_id && !row.reversed_by && !row.reversal && <>
                {row.can_edit_amount && <IconButton icon={Pencil} label={t('Edit amount','ویرایش مبلغ')} disabled={busy||uncertain} onClick={()=>openCorrection(row,'edit')}/>}
                <IconButton icon={RotateCcw} label={t('Reverse','معکوس‌کردن')} disabled={busy||uncertain} onClick={()=>openCorrection(row,'reverse')}/>
              </>}
            </div>
            {president && !!row.corrections?.length&&<details className="cashbook-correction-history">
              <summary>{t('Amount history','تاریخچه مبلغ')}</summary>
              <ul>{row.corrections.map(item=><li key={item.request_id}>
                <bdi>{money(cents(item.previous_amount))} → {money(cents(item.corrected_amount))}</bdi>
                <span>{formatSolarHijri(item.changed_at)} · {item.reason}</span>
              </li>)}</ul>
            </details>}
          </td>
          <td className={row.direction==='in'?'simple-money-in':'simple-money-out'}>
            <strong><bdi>{row.direction==='in'?'+':'−'}{money(cents(row.amount))}</bdi></strong>
          </td>
        </tr>)}
        {!matchingRecords.length&&<tr><td colSpan={3} className="simple-cashbook-empty">{t('No matching records.','معامله مطابق یافت نشد.')}</td></tr>}
      </CompactTable>{matchingRecords.length>shown&&<button type="button" className="cashbook-see-more" onClick={()=>setShown(current=>current+20)}>{t('See more','نمایش بیشتر')}</button>}</section>
    </>}
    {customsDirectory && president && <Modal title={t('Commission agent payments', 'پرداخت‌های کمیشن کار')}
      busy={customsBusy || customsDirectory.loading} onClose={() => setCustomsDirectory(null)}>
      <div className="record-modal-body customs-cashbook-picker">
        {customsDirectory.loading && <p role="status">{t('Loading commission agents…', 'در حال بارگیری کمیشن کاران…')}</p>}
        {customsDirectory.error && <p className="registry-notice error" role="alert">{t('Could not load commission agents. Check the Customs setup and try again.', 'کمیشن کاران بارگیری نشدند. تنظیمات گمرک را بررسی کرده دوباره کوشش کنید.')}</p>}
        {customsDirectory.agents?.length > 0 && <label><span>{t('Commission agent', 'کمیشن کار')}</span>
          <select value={customsAgent} disabled={customsBusy} onChange={event => setCustomsAgent(event.target.value)}>
            <option value="">{t('Select an agent', 'کمیشن کار را انتخاب کنید')}</option>
            {customsDirectory.agents.map(agent => <option key={agent.id} value={agent.id}>{agent.name} · {agent.phone}</option>)}
          </select>
        </label>}
        {customsDirectory.agents?.length === 0 && <p>{t('Add a commission agent in Customs first.', 'ابتدا یک کمیشن کار در گمرک اضافه کنید.')}</p>}
      </div>
      {customsAgent && <CustomsAgentAccount key={customsAgent} agent={customsDirectory.agents.find(agent => agent.id === customsAgent)}
        language={language} initialAccount={scope} onBusyChange={setCustomsBusy}
        onPayment={() => {
          setNotice(t('Commission agent payment saved.', 'پرداخت کمیشن کار ثبت شد.'))
          void load().catch(() => setNotice(t('Payment saved. Refresh Cashbook to update the balance.', 'پرداخت ثبت شد. برای به‌روز شدن موجودی روزنامچه را تازه کنید.')))
        }} />}
    </Modal>}
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
