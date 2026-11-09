import { useCallback, useEffect, useRef, useState } from 'react'
import { Archive, BadgeCheck, Building2, CalendarDays, CheckCheck, CheckCircle2, ClipboardList, MapPin, Package, Play, Plus, RefreshCw, Search, Send, Truck, UserRound, Users, X, XCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { allRows, kabulToday } from '../lib/cashbook'
import { printRecord } from '../lib/recordExports'
import { bookingDue, bookingTotal } from '../lib/bookingFinance'
import { bookingColumns, rpc, explain } from '../lib/operations'
import { ConfirmArchive, IconButton, Modal, RecordTools } from '../components/RecordTools'
import SolarHijriDateInput from '../components/SolarHijriDateInput'
import { formatSolarHijri, todayISO } from '../lib/solarHijri'

const blank = { booking_date: '',branch_id:'', trader_id: '', trader_first_name: '', trader_last_name: '', trader_phone: '', trader_address: '', sender_is_trader: false, sender_name: '', sender_phone: '', sender_address: '', receiver_is_trader:false, receiver_name: '', receiver_phone: '', receiver_address: '', goods: '', quantity_unit:'tons', quantity_amount:'', origin: '', destination: '', vehicle_id: '', driver_id: '', service_type: 'arrangement',commission_amount:'',commission_currency:'AFN',freight_amount:'',carrier_cost:'',other_expenses:[],received_now:'' }
const selection = `${bookingColumns}, traders(full_name,phone), vehicles(plate_number), drivers(full_name)`
const today = todayISO

export default function BookingsPage({ language, profile }) {
  const branchManager=profile?.role==='branch_manager'
  const president=profile?.role==='president'
  const t = (en, fa) => language === 'fa' ? fa : en
  const [rows, setRows] = useState([])
  const [traders, setTraders] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [drivers, setDrivers] = useState([])
  const [form, setForm] = useState(blank)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)
  const [message, setMessage] = useState('')
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState('all')
  const [branches,setBranches]=useState([]),[editing,setEditing]=useState(null),[archived,setArchived]=useState(false),[deletion,setDeletion]=useState(null),[detail,setDetail]=useState(null),[cancelRow,setCancelRow]=useState(null),[selected,setSelected]=useState([]),[bulkAction,setBulkAction]=useState(''),[paymentRow,setPaymentRow]=useState(null),[paymentForm,setPaymentForm]=useState({amount:'',date:kabulToday()}),[paymentError,setPaymentError]=useState('')
  const request=useRef(null)
  const paymentRequest=useRef(null)
  const load=useCallback(async()=>{const [bookings,traders,vehicles,drivers,branches,finance]=await Promise.all([allRows(supabase,'bookings',selection),allRows(supabase,'traders'),allRows(supabase,'vehicles','*, vehicle_owners(full_name,phone)'),allRows(supabase,'drivers'),allRows(supabase,'branches'),rpc('booking_finance_rows',{})]);const money=new Map(finance.map(r=>[r.id,r]));setRows(bookings.filter(r=>!r.deleted_at).map(r=>({...r,...money.get(r.id)})).sort((a,b)=>b.created_at.localeCompare(a.created_at)));setTraders(traders);setVehicles(vehicles);setDrivers(drivers);setBranches(branches);setReady(true)},[])
  useEffect(()=>{void Promise.resolve().then(load).catch(e=>setMessage(explain(e,language)))},[load,language])
  const refreshBookings=useCallback(async()=>{const [bookings,finance]=await Promise.all([allRows(supabase,'bookings',selection),rpc('booking_finance_rows',{})]);const money=new Map(finance.map(r=>[r.id,r]));setRows(bookings.filter(r=>!r.deleted_at).map(r=>({...r,...money.get(r.id)})).sort((a,b)=>b.created_at.localeCompare(a.created_at)))},[])
  useEffect(()=>{
    const update=()=>{if(!document.hidden&&!busy&&!open)void refreshBookings().catch(e=>setMessage(explain(e,language)))}
    const timer=window.setInterval(update,30000)
    window.addEventListener('focus',update)
    return()=>{clearInterval(timer);window.removeEventListener('focus',update)}
  },[refreshBookings,busy,open,language])
  const statuses={confirmed:t('Confirmed','تأییدشده'),in_transit:t('On road','در راه'),completed:t('Completed','تکمیل‌شده'),cancelled:t('Cancelled','لغوشده')}
  const visibleRows=rows.filter(r=>!!r.archived_at===archived&&(!president||scope==='all'||(scope==='head-office'?!r.branch_id:r.branch_id===scope))&&`${r.booking_number} ${r.trader_first_name||r.traders?.full_name||''} ${r.trader_last_name||''} ${r.origin} ${r.destination}`.toLowerCase().includes(query.toLowerCase()))
  function edit(row){setEditing(row);request.current=null;setForm({...Object.fromEntries(Object.keys(blank).map(key=>[key,row[key]??blank[key]])),quantity_unit:row.quantity_unit||(row.volume_m3?'m3':'tons'),quantity_amount:row.quantity_amount||row.weight_tons||row.volume_m3||'',received_now:''});setMessage('');setOpen(true)}
  async function changeStatus(row,status){if(busy)return;setBusy(true);setMessage('');try{await rpc('change_booking_status',{p_id:row.id,p_status:status,p_request:crypto.randomUUID(),p_expected:row.updated_at});setCancelRow(null);await load()}catch(e){setMessage(explain(e,language))}finally{setBusy(false)}}
  function printBooking(row) {
    const contacts = (name, phone, address) => [name, phone, address].filter(Boolean).join(' · ')
    const printed = printRecord({
      language,
      title: `${t('Booking confirmation', 'تأییدیه بوکینگ')} #${row.booking_number}`,
      subtitle: t('Pedram Transportation', 'شرکت ترانسپورتی پدرام'),
      sections: [{ rows: [
        [t('Date', 'تاریخ'), formatSolarHijri(row.booking_date)],
        [t('Status', 'وضعیت'), statuses[row.status]],
        [t('Service', 'خدمات'), row.service_type === 'managed' ? t('Company-managed transport', 'انتقال توسط شرکت') : t('Vehicle arrangement', 'معرفی واسطه')],
        [t('Trader', 'تاجر'), contacts(`${row.trader_first_name || ''} ${row.trader_last_name || ''}`.trim() || row.traders?.full_name, row.trader_phone, row.trader_address)],
        [t('Sender', 'فرستنده'), contacts(row.sender_name, row.sender_phone, row.sender_address)],
        [t('Receiver', 'گیرنده'), contacts(row.receiver_name, row.receiver_phone, row.receiver_address)],
        [t('Route', 'مسیر'), `${row.origin} → ${row.destination}`],
        [t('Goods', 'بار'), `${row.goods} · ${quantityText(row)}`],
        [t('Vehicle', 'واسطه'), row.vehicles?.plate_number],
        [t('Driver', 'راننده'), row.drivers?.full_name],
      ] }],
    })
    if (!printed) setMessage(t('Allow pop-ups to print this confirmation.', 'برای چاپ تأییدیه، پنجرهٔ جدید را اجازه دهید.'))
  }
  function openPayment(row){paymentRequest.current=null;setPaymentError('');setPaymentForm({amount:'',date:kabulToday()});setPaymentRow(row)}
  async function savePayment(e){
    e.preventDefault();if(busy||!paymentRow||!president)return
    const amount=Number(paymentForm.amount)
    if(!Number.isFinite(amount)||amount<=0||!/^\d+(\.\d{1,2})?$/.test(paymentForm.amount)||amount>bookingDue(paymentRow.charged,paymentRow.paid)/100){setPaymentError(t('Enter a valid amount no greater than the booking balance.','مبلغ درست و کمتر یا مساوی باقی‌مانده بوکینگ وارد کنید.'));return}
    const payload={branch_id:paymentRow.branch_id,currency:paymentRow.commission_currency,direction:'in',amount:paymentForm.amount,date:paymentForm.date,description:`Booking #${paymentRow.booking_number} payment received`,trader_id:paymentRow.trader_id,booking_id:paymentRow.id}
    const key=JSON.stringify(payload);if(paymentRequest.current?.key!==key)paymentRequest.current={key,id:crypto.randomUUID()}
    setBusy(true);setPaymentError('')
    try{await rpc('cashbook_simple_post',{p_request:paymentRequest.current.id,p_data:payload});setPaymentRow(null);try{await refreshBookings()}catch{setMessage(t('Payment saved. Refresh bookings to update the balance.','پرداخت ثبت شد. برای تازه‌سازی باقی‌مانده بوکینگ‌ها را تازه کنید.'))}}
    catch(error){setPaymentError(explain(error,language))}
    finally{setBusy(false)}
  }
  const vehicle = vehicles.find(v => v.id === form.vehicle_id)
  const driver = drivers.find(d => d.id === form.driver_id)
  const sender = form.sender_is_trader ? { sender_name: `${form.trader_first_name} ${form.trader_last_name}`.trim(), sender_phone: form.trader_phone, sender_address: form.trader_address } : { sender_name: form.sender_name, sender_phone: form.sender_phone, sender_address: form.sender_address }
  const receiver = form.receiver_is_trader ? { receiver_name: `${form.trader_first_name} ${form.trader_last_name}`.trim(), receiver_phone: form.trader_phone, receiver_address: form.trader_address } : { receiver_name: form.receiver_name, receiver_phone: form.receiver_phone, receiver_address: form.receiver_address }
  const quantityText = row => row.quantity_amount ? `${row.quantity_amount} ${{tons:'ټن',pieces:'عدد',m3:'متر مکعب'}[row.quantity_unit]||''}` : row.weight_tons ? `${row.weight_tons} ټن` : row.volume_m3 ? `${row.volume_m3} متر مکعب` : row.quantity||'—'
  const money = (amount,currency) => `${Number(amount||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})} ${currency||'AFN'}`
  const field = (key, en, fa, { type = 'text', required = true, value = form[key], disabled = false } = {}) => { const finance=['commission_amount','freight_amount','carrier_cost'].includes(key); return <label><span>{t(en,fa)}{required ? ' *' : ''}</span>{type === 'date' ? <SolarHijriDateInput required={required} disabled={disabled} language={language} value={value ?? ''} onChange={value => setForm(current => ({ ...current, [key]: value }))} ariaLabel={t(en,fa)} /> : <input type={type} required={required} disabled={disabled} min={type === 'number' ? (finance ? key==='commission_amount'?'0.01':'0' : '0.001') : undefined} step={type === 'number' ? finance?'0.01':'0.001' : undefined} value={value ?? ''} onChange={e => setForm(current => ({ ...current, [key]: e.target.value }))} />}</label> }
  const heading = (Icon, en, fa) => <h3 className="booking-section-heading"><Icon size={21} />{t(en,fa)}</h3>
  function chooseTrader(id) {
    const trader = traders.find(r => r.id === id)
    setForm(current => ({ ...current, trader_id: id, trader_first_name: trader?.first_name || trader?.full_name || '', trader_last_name: trader?.last_name || '', trader_phone: trader?.phone || '', trader_address: trader?.address || '' }))
  }
  async function submit(e) {
    e.preventDefault()
    if (busy) return
    if (!form.quantity_amount || Number(form.quantity_amount)<=0) { setMessage(t('Enter a positive goods amount.','مقدار بار را بیشتر از صفر وارد کنید.')); return }
    if (!form.commission_amount || Number(form.commission_amount)<=0) { setMessage(t('Enter the commission amount.','مقدار کمیسیون را وارد کنید.')); return }
    if (Number(form.received_now||0)<0 || Number(form.received_now||0)>bookingTotal(form)/100) { setMessage(t('Amount received now must not exceed the total owed.','مبلغ دریافتی فعلی نباید از مجموع بدهی بیشتر باشد.')); return }
    setBusy(true); setMessage('')
    try {
      const payload = Object.fromEntries(Object.entries({ ...form, ...(form.service_type==='managed'?sender:{sender_name:'',sender_phone:'',sender_address:''}), ...(form.service_type==='managed'?receiver:{receiver_name:'',receiver_phone:'',receiver_address:''}), ...(form.service_type==='arrangement'?{freight_amount:'',carrier_cost:'',other_expenses:[]}:{} ) }).map(([k,v]) => [k, typeof v === 'string' ? v.trim() : v]))
      payload.branch_id=payload.branch_id||null
      const key=JSON.stringify(payload);if(request.current?.key!==key)request.current={key,id:crypto.randomUUID()}
      const id=await rpc('save_booking_record',{p_id:editing?.id||null,p_request:request.current.id,p_data:payload,p_expected:editing?.updated_at||null})
      const { data, error: readError } = await supabase.from('bookings').select(selection).eq('id',id).single()
      // Saving has committed; a list refresh failure must not invite duplicate submission.
      setOpen(false); setForm(blank)
      if (readError) setMessage(t('Booking saved. Reload the page to refresh the list.', 'بوکینگ ثبت شد. برای تازه‌سازی فهرست صفحه را دوباره باز کنید.'))
      else {const finance=await rpc('booking_finance_rows',{});setRows(current => [{...data,...finance.find(r=>r.id===data.id)},...current.filter(r=>r.id!==data.id)])}
      const { data: updated } = await supabase.from('traders').select('*').order('full_name')
      if (updated) setTraders(updated)
    } catch (error) { setMessage(explain(error,language)) }
    finally { setBusy(false) }
  }
  return <div className="registry-page">
    <div className="booking-page-header"><h1>{t('Bookings','برنامه')}</h1><div className="record-tools"><IconButton icon={RefreshCw} label={t('Refresh','تازه‌سازی')} disabled={busy} onClick={()=>{setMessage('');void refreshBookings().catch(e=>setMessage(explain(e,language)))}}/><button className="registry-primary" disabled={!ready||(branchManager&&!profile?.branch_id)} onClick={() => { setEditing(null);request.current=null;setForm({ ...blank, branch_id:branchManager?profile.branch_id:'',booking_date: today() }); setMessage(''); setOpen(true) }}><Plus size={18} />{t('New booking','بوکینگ جدید')}</button></div></div>
    {president&&<div className="booking-branch-filter"><label><span><Building2 size={17}/>{t('Branch','شعبه')}</span><select value={scope} onChange={e=>setScope(e.target.value)}><option value="all">{t('All branches','تمام شعبات')}</option><option value="head-office">{t('Head office','دفتر مرکزی')}</option>{[...branches].sort((a,b)=>a.name.localeCompare(b.name)).map(branch=><option key={branch.id} value={branch.id}>{branch.name}{branch.archived_at?` · ${t('Archived','بایگانی‌شده')}`:''}</option>)}</select></label></div>}
    {message && !open && <div role="alert" className="registry-notice error">{message}</div>}
    <label className="registry-search"><Search size={17} /><input aria-label={t('Search bookings','جستجوی بوکینگ‌ها')} placeholder={t('Search booking, trader or route','جستجوی بوکینگ، تاجر یا مسیر')} value={query} onChange={e => setQuery(e.target.value)} /></label>
    <button className="registry-secondary" aria-pressed={archived} onClick={()=>setArchived(!archived)}><Archive size={18}/>{t('Archive','بایگانی')}</button>
    {selected.length>0&&<div className="registry-toolbar"><span aria-label={t('Selected bookings','بوکینگ‌های انتخاب‌شده')}>{selected.length}</span><button className="registry-secondary" onClick={()=>setSelected([])}>{t('Clear selection','پاک‌کردن انتخاب')}</button><button className="registry-primary" onClick={()=>setBulkAction('archive')}>{t('Archive selected','بایگانی انتخاب‌شده‌ها')}</button><button className="registry-secondary" onClick={()=>setBulkAction('delete')}>{t('Delete selected','حذف انتخاب‌شده‌ها')}</button></div>}
    <div className="booking-list">{visibleRows.map(r => <article className="booking-record" key={r.id}>
      <h3>{r.status==='completed'&&!r.archived_at&&<input type="checkbox" aria-label={`${t('Select booking','انتخاب بوکینگ')} #${r.booking_number}`} checked={selected.includes(r.id)} onChange={e=>setSelected(current=>e.target.checked?[...current,r.id]:current.filter(id=>id!==r.id))}/>}<ClipboardList size={20} />#{r.booking_number} · {r.trader_first_name ? `${r.trader_first_name} ${r.trader_last_name || ''}` : r.traders?.full_name}</h3>
      <div className="booking-record-actions"><span className={`status-pill ${r.status}`}>{statuses[r.status]}</span><RecordTools language={language} disabled={busy} archived={r.archived_at} onView={()=>{setMessage('');setDetail(r)}} onEdit={r.status==='confirmed'?()=>edit(r):undefined} onArchive={()=>{setMessage('');setDeletion(r)}}/>{!r.archived_at&&<div className="record-tools">{president&&r.trader_id&&bookingDue(r.charged,r.paid)>0&&<button type="button" className="registry-secondary" disabled={busy} onClick={()=>openPayment(r)}>{t('Receive payment','دریافت پول')}</button>}{r.status==='confirmed'&&<IconButton icon={Play} disabled={busy} label={t('Start journey','شروع سفر')} onClick={()=>changeStatus(r,'in_transit')}/>} {r.status==='in_transit'&&<IconButton icon={CheckCircle2} disabled={busy} label={t('Complete journey','تکمیل سفر')} onClick={()=>changeStatus(r,'completed')}/>} {['confirmed','in_transit'].includes(r.status)&&<IconButton icon={XCircle} disabled={busy} label={t('Cancel booking','لغو بوکینگ')} onClick={()=>{setMessage('');setCancelRow(r)}}/>}</div>}</div>
      {!r.archived_at&&['confirmed','in_transit'].includes(r.status)&&(r.driver_delivered_at?<p className="driver-booking-report"><CheckCheck size={20}/>{t('Driver reported delivery · confirm completion','راننده تحویل بار را گزارش داد · تکمیل سفر را تأیید کنید')}</p>:r.driver_accepted_at?<p className="driver-booking-report"><BadgeCheck size={20}/>{t('Driver accepted','راننده برنامه را پذیرفت')}</p>:null)}
      <p><strong>{t('Date','تاریخ')}:</strong> {formatSolarHijri(r.booking_date)} · {r.service_type === 'managed' ? t('Company-managed transport','انتقال توسط شرکت') : t('Vehicle arrangement','معرفی واسطه')}{president&&<> · {t('Trader owes','بدهی تاجر')}: {money(bookingDue(r.charged,r.paid)/100,r.commission_currency)}</>}</p>
      <p>{r.origin} → {r.destination} · {r.goods} · {quantityText(r)}</p>
      <p>{t('Sender','فرستنده')}: {r.sender_name || '—'} · {t('Receiver','گیرنده')}: {r.receiver_name || '—'}</p><p>{r.vehicles?.plate_number || '—'} · {r.drivers?.full_name || '—'}</p>
      <details className="booking-contact-details"><summary>{t('Contact details','مشخصات تماس')}</summary><dl className="booking-preview"><dt>{t('Trader contact / address','تماس / آدرس تاجر')}</dt><dd>{r.trader_phone || r.traders?.phone || '—'} · {r.trader_address || '—'}</dd><dt>{t('Sender contact / address','تماس / آدرس فرستنده')}</dt><dd>{r.sender_phone || '—'} · {r.sender_address || '—'}</dd><dt>{t('Receiver contact / address','تماس / آدرس گیرنده')}</dt><dd>{r.receiver_phone || '—'} · {r.receiver_address || '—'}</dd></dl></details>
    </article>)}</div>
    {ready && !visibleRows.length && <div className="registry-empty"><ClipboardList size={32} />{rows.length?t('No bookings match these filters.','هیچ بوکینگی با این فیلترها مطابقت ندارد.'):t('No bookings registered yet.','هنوز بوکینگ ثبت نشده است.')}</div>}
    {open && <div className="registry-modal" role="dialog" aria-modal="true" aria-labelledby="booking-title"><div className="registry-form-card booking-form-card"><div className="registry-form-head"><h2 id="booking-title">{editing?t('Edit booking','ویرایش بوکینگ'):t('New booking','بوکینگ جدید')}</h2><button type="button" className="registry-secondary" disabled={busy} onClick={() => setOpen(false)} aria-label={t('Close','بستن')}><X size={18} /></button></div>
      <form className="registry-form booking-form" onSubmit={submit}><fieldset disabled={busy} className="booking-fields">
        {heading(CalendarDays,'Date','تاریخ')}{field('booking_date','Date','تاریخ',{type:'date'})}
        {!branchManager&&<label><span>{t('Branch','شعبه')}</span><select disabled={!!editing} value={form.branch_id||''} onChange={e=>setForm({...form,branch_id:e.target.value})}><option value="">{t('Head office','دفتر مرکزی')}</option>{branches.filter(b=>!b.archived_at||b.id===form.branch_id).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>}
        <label><span>{t('Booking type','نوع بوکینگ')}</span><select value={form.service_type} onChange={e => setForm({ ...form, service_type: e.target.value })}><option value="arrangement">{t('Vehicle arrangement','معرفی واسطه')}</option><option value="managed">{t('Company-managed transport','انتقال توسط شرکت')}</option></select></label>
        {heading(UserRound,'Trader information','مشخصات تاجر')}
        <label className="wide"><span>{t('Select an existing trader or enter a new trader below','تاجر ثبت‌شده را انتخاب کنید یا مشخصات تاجر جدید را وارد کنید')}</span><select value={form.trader_id} onChange={e => chooseTrader(e.target.value)}><option value="">{t('New trader','تاجر جدید')}</option>{traders.filter(r=>!r.archived_at).map(r => <option key={r.id} value={r.id}>{r.full_name} · {r.phone}</option>)}</select></label>
        {field('trader_first_name','First name','نام')}{field('trader_last_name','Last name / surname','تخلص',{required:false})}{field('trader_phone','Contact number','شماره تماس',{type:'tel'})}{field('trader_address','Address','آدرس')}
        {form.service_type==='managed'&&<>{heading(Send,'Sender information','مشخصات فرستنده')}
        <label className="wide registry-check"><input type="checkbox" checked={form.sender_is_trader} onChange={e => setForm({ ...form, sender_is_trader: e.target.checked })} /><span>{t('Trader is the sender','تاجر فرستنده است')}</span></label>
        {field('sender_name','Full name (with surname)','نام و تخلص',{value:sender.sender_name,disabled:form.sender_is_trader})}{field('sender_phone','Phone','موبایل',{type:'tel',value:sender.sender_phone,disabled:form.sender_is_trader})}{field('sender_address','Address','آدرس',{value:sender.sender_address,disabled:form.sender_is_trader})}
        {heading(Users,'Receiver information','مشخصات گیرنده')}<label className="wide registry-check"><input type="checkbox" checked={form.receiver_is_trader} onChange={e=>setForm({...form,receiver_is_trader:e.target.checked})}/><span>{t('Trader is the receiver','تاجر گیرنده است')}</span></label>{field('receiver_name','Full name (with surname)','نام و تخلص',{value:receiver.receiver_name,disabled:form.receiver_is_trader})}{field('receiver_phone','Contact number','شماره تماس',{type:'tel',value:receiver.receiver_phone,disabled:form.receiver_is_trader})}{field('receiver_address','Address','آدرس',{value:receiver.receiver_address,disabled:form.receiver_is_trader})}</>}
        {heading(Package,'Goods information','مشخصات بار')}{field('goods','Goods name','نام بار')}<label><span>{t('Goods amount','مقدار بار')} *</span><select value={form.quantity_unit} onChange={e=>setForm({...form,quantity_unit:e.target.value})}><option value="tons">ټن</option><option value="pieces">عدد</option><option value="m3">متر مکعب</option></select></label>{field('quantity_amount','Amount','مقدار',{type:'number'})}
        {heading(MapPin,'Route','مسیر')}{field('origin','Origin location','محل مبدأ')}{field('destination','Destination location','محل مقصد')}
        {heading(Package,'Booking finance','مالیه بوکینگ')}<label><span>{t('Currency for all booking amounts','واحد پول همه مبالغ بوکینگ')}</span><select disabled={!!editing?.commission_amount} value={form.commission_currency} onChange={e=>setForm({...form,commission_currency:e.target.value})}>{['AFN','USD','PKR','IRR'].map(c=><option key={c}>{c}</option>)}</select></label>{field('commission_amount','Commission amount','مقدار کمیسیون',{type:'number',disabled:!!editing?.commission_amount})}
        {form.service_type==='managed'&&<>{field('freight_amount','Freight owed by trader','کرایه بار قابل پرداخت توسط تاجر',{type:'number'})}{field('carrier_cost','Vehicle / driver cost owed by trader','مصارف واسطه و راننده قابل پرداخت توسط تاجر',{type:'number'})}<h3 className="booking-section-heading">{t('More expenses owed by trader','مصارف بیشتر قابل پرداخت توسط تاجر')}</h3>{form.other_expenses.map((expense,index)=><div className="wide booking-preview" key={index}><label><span>{t('Expense','مصرف')}</span><input required value={expense.description} onChange={e=>setForm(current=>({...current,other_expenses:current.other_expenses.map((x,i)=>i===index?{...x,description:e.target.value}:x)}))}/></label><label><span>{t('Amount','مقدار')}</span><input required type="number" min="0.01" step="0.01" value={expense.amount} onChange={e=>setForm(current=>({...current,other_expenses:current.other_expenses.map((x,i)=>i===index?{...x,amount:e.target.value}:x)}))}/></label><button type="button" onClick={()=>setForm(current=>({...current,other_expenses:current.other_expenses.filter((_,i)=>i!==index)}))}>{t('Remove','حذف')}</button></div>)}<button type="button" className="registry-secondary" onClick={()=>setForm(current=>({...current,other_expenses:[...current.other_expenses,{description:'',amount:''}]}))}>{t('Add expense','افزودن مصرف')}</button></>}
        <p className="wide booking-help">{t('Total owed by trader','مجموع بدهی تاجر')}: <strong>{money(bookingTotal(form)/100,form.commission_currency)}</strong></p>
        {president&&!editing&&<label><span>{t('Received now (optional)','دریافت فعلی (اختیاری)')}</span><input type="number" min="0" max={bookingTotal(form)/100} step="0.01" value={form.received_now} onChange={e=>setForm(current=>({...current,received_now:e.target.value}))}/><small>{t('Only this received amount is added to Cashbook Money In. Record later payments from Bookings or the trader account.','فقط مبلغ دریافت‌شده در پول آمد روزنامچه ثبت می‌شود. پرداخت بعدی را از بوکینگ‌ها یا حساب تاجر ثبت کنید.')}</small></label>}
        {heading(Truck,'Vehicle and driver','واسطه و راننده')}
        <label><span>{t('Registered vehicle','واسطه ثبت‌شده')} *</span><select required value={form.vehicle_id} onChange={e => setForm(current => ({ ...current, vehicle_id:e.target.value }))}><option value="">—</option>{vehicles.filter(v=>!v.archived_at&&v.status==='available'&&(!v.branch_id||v.branch_id===form.branch_id)).map(v => <option key={v.id} value={v.id}>{v.plate_number} · {v.vehicle_type}</option>)}</select></label>
        <label><span>{t('Registered driver','راننده ثبت‌شده')} *</span><select required value={form.driver_id} onChange={e => setForm(current => ({ ...current, driver_id:e.target.value }))}><option value="">—</option>{drivers.filter(d=>!d.archived_at&&d.status==='available'&&(!d.branch_id||d.branch_id===form.branch_id)).map(d => <option key={d.id} value={d.id}>{d.full_name} · {d.phone}</option>)}</select></label>
        {vehicle && <dl className="booking-preview"><dt>{t('Plate / foreign plate','پلیت / پلیت خارجی')}</dt><dd>{vehicle.plate_number} / {vehicle.foreign_plate_number || '—'}</dd><dt>{t('Type / color','نوع / رنگ')}</dt><dd>{vehicle.vehicle_type} / {vehicle.color || '—'}</dd><dt>{t('VIN','نمبر شاسی')}</dt><dd>{vehicle.vin_number || '—'}</dd><dt>{t('Owner','مالک')}</dt><dd>{vehicle.vehicle_owners?.full_name || '—'} · {vehicle.vehicle_owners?.phone || '—'}</dd><dt>{t('Permit expiry','تاریخ ختم جواز')}</dt><dd>{formatSolarHijri(vehicle.permit_expiry)}</dd></dl>}
        {driver && <dl className="booking-preview"><dt>{t('Driver','راننده')}</dt><dd>{driver.full_name}</dd><dt>{t('Father name','نام پدر')}</dt><dd>{driver.father_name || '—'}</dd><dt>{t('Contact','تماس')}</dt><dd>{driver.phone}</dd><dt>{t('Address','آدرس')}</dt><dd>{driver.address || '—'}</dd><dt>{t('Licence number','نمبر لایسنس')}</dt><dd>{driver.license_number || '—'}</dd></dl>}
        {driver&&!driver.user_id&&<p className="wide booking-help">{t('To show this job in the driver portal, connect this driver’s login using the key icon in Fleet → Drivers.','برای نمایش برنامه در درگاه راننده، حساب این راننده را با آیکن کلید در بخش وسایط ← رانندگان وصل کنید.')}</p>}
        <p className="wide booking-help">{t('Register missing vehicles and drivers in Fleet first. Trader details are saved with this booking; existing trader profiles are not overwritten.','وسایط و رانندگان جدید را ابتدا در بخش وسایط ثبت کنید. مشخصات تاجر با این بوکینگ ذخیره می‌شود؛ مشخصات قبلی تاجر تغییر نمی‌کند.')}</p>
      </fieldset>
      {message && <div role="alert" className="wide registry-notice error">{message}</div>}
      <div className="registry-form-actions"><button type="button" disabled={busy} onClick={() => setOpen(false)}>{t('Cancel','انصراف')}</button><button className="registry-primary" disabled={busy}>{busy ? t('Saving…','در حال ثبت…') : t('Save booking','ثبت بوکینگ')}</button></div></form>
    </div></div>}
    {deletion&&<ConfirmArchive language={language} busy={busy} error={message} restore={!!deletion.archived_at} onClose={()=>setDeletion(null)} onConfirm={async()=>{setBusy(true);try{await rpc('archive_booking_record',{p_id:deletion.id,p_archived:!deletion.archived_at,p_expected:deletion.updated_at});setDeletion(null);await load()}catch(e){setMessage(explain(e,language))}finally{setBusy(false)}}}/>}
    {bulkAction&&<Modal title={bulkAction==='delete'?t('Delete completed bookings','حذف بوکینگ‌های تکمیل‌شده'):t('Archive completed bookings','بایگانی بوکینگ‌های تکمیل‌شده')} busy={busy} onClose={()=>setBulkAction('')}><div className="record-modal-body"><p>{selected.length} {t('completed bookings selected. Their financial history will be retained.','بوکینگ تکمیل‌شده انتخاب شده‌اند. تاریخچه مالی نگهداری می‌شود.')}</p>{message&&<p role="alert" className="registry-notice error">{message}</p>}<button className="registry-primary" disabled={busy} onClick={async()=>{setBusy(true);setMessage('');try{await rpc('bulk_completed_bookings',{p_ids:selected,p_action:bulkAction});setBulkAction('');setSelected([]);await load()}catch(e){setMessage(explain(e,language))}finally{setBusy(false)}}}>{t('Confirm','تأیید')}</button></div></Modal>}
    {paymentRow&&<Modal title={`${t('Receive payment for booking','دریافت پول بوکینگ')} #${paymentRow.booking_number}`} busy={busy} onClose={()=>setPaymentRow(null)}><form className="registry-form" onSubmit={savePayment}><p className="wide booking-help">{t('Remaining owed','باقی‌مانده قابل پرداخت')}: <strong>{money(bookingDue(paymentRow.charged,paymentRow.paid)/100,paymentRow.commission_currency)}</strong></p><fieldset disabled={busy} className="booking-fields wide"><label><span>{t('Amount received','مبلغ دریافت‌شده')} ({paymentRow.commission_currency}) *</span><input required type="number" min="0.01" max={bookingDue(paymentRow.charged,paymentRow.paid)/100} step="0.01" value={paymentForm.amount} onChange={e=>setPaymentForm(current=>({...current,amount:e.target.value}))}/></label><label><span>{t('Payment date','تاریخ دریافت')} *</span><SolarHijriDateInput required max={kabulToday()} language={language} value={paymentForm.date} onChange={date=>setPaymentForm(current=>({...current,date}))} ariaLabel={t('Payment date','تاریخ دریافت')}/></label></fieldset><p className="wide booking-help">{t('This payment is added once to Cashbook Money In and the trader account.','این پرداخت یک‌بار در پول آمد روزنامچه و حساب تاجر ثبت می‌شود.')}</p>{paymentError&&<p className="wide registry-notice error" role="alert">{paymentError}</p>}<div className="registry-form-actions"><button type="button" disabled={busy} onClick={()=>setPaymentRow(null)}>{t('Cancel','انصراف')}</button><button className="registry-primary" disabled={busy}>{t('Save payment','ثبت پرداخت')}</button></div></form></Modal>}
    {cancelRow&&<Modal title={t('Cancel booking','لغو بوکینگ')} onClose={()=>setCancelRow(null)} busy={busy}><div className="record-modal-body"><p>{t('Cancel this booking and release its vehicle and driver?','این بوکینگ لغو و واسطه و راننده آزاد شوند؟')}</p>{message&&<p role="alert" className="registry-notice error">{message}</p>}<button className="registry-primary" disabled={busy} onClick={()=>changeStatus(cancelRow,'cancelled')}>{t('Cancel booking','لغو بوکینگ')}</button></div></Modal>}
    {detail&&<Modal title={`#${detail.booking_number}`} onClose={()=>setDetail(null)}>
      <div className="record-modal-body">
        <button type="button" className="registry-secondary" onClick={()=>printBooking(detail)}>{t('Print confirmation','چاپ تأییدیه')}</button>
        {message&&<p role="alert">{message}</p>}
      </div>
      <dl className="record-details record-modal-body">{[[t('Trader','تاجر'),`${detail.trader_first_name} ${detail.trader_last_name||''}`],[t('Status','وضعیت'),statuses[detail.status]],[t('Date','تاریخ'),formatSolarHijri(detail.booking_date)],[t('Sender','فرستنده'),detail.sender_name],[t('Sender contact','تماس فرستنده'),detail.sender_phone],[t('Sender address','آدرس فرستنده'),detail.sender_address],[t('Receiver','گیرنده'),detail.receiver_name],[t('Receiver contact','تماس گیرنده'),detail.receiver_phone],[t('Receiver address','آدرس گیرنده'),detail.receiver_address],[t('Goods','بار'),detail.goods],[t('Goods amount','مقدار بار'),quantityText(detail)],[t('Commission owed','کمیسیون قابل پرداخت'),detail.commission_amount ? `${detail.commission_amount} ${detail.commission_currency}` : '—'],[t('Freight owed by trader','کرایه بار قابل پرداخت توسط تاجر'),detail.freight_amount],[t('Vehicle / driver cost owed by trader','مصارف واسطه و راننده قابل پرداخت توسط تاجر'),detail.carrier_cost],[t('More expenses owed by trader','مصارف بیشتر قابل پرداخت توسط تاجر'),(detail.other_expenses||[]).map(x=>`${x.description}: ${x.amount}`).join(' · ')],...(president?[[t('Total owed','مجموع بدهی'),money(detail.charged,detail.commission_currency)],[t('Paid','پرداخت‌شده'),money(detail.paid,detail.commission_currency)],[t('Remaining owed','باقی‌مانده قابل پرداخت'),money(bookingDue(detail.charged,detail.paid)/100,detail.commission_currency)]]:[]),[t('Route','مسیر'),`${detail.origin} → ${detail.destination}`],[t('Vehicle','واسطه'),detail.vehicles?.plate_number],[t('Driver','راننده'),detail.drivers?.full_name]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||'—'}</dd></div>)}</dl></Modal>}
  </div>
}
