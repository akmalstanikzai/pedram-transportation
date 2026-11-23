import { useCallback, useEffect, useRef, useState } from 'react'
import { Archive, ArrowRight, BadgeCheck, Building2, CalendarDays, CheckCheck, CheckCircle2, ClipboardList, Eye, MapPin, Package, Play, Plus, RefreshCw, Search, Send, Truck, UserRound, Users, XCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { allRows, kabulToday } from '../lib/cashbook'
import { attentionForBooking, bookingAttention } from '../lib/bookingAttention'
import { printRecord } from '../lib/recordExports'
import { bookingDue, bookingTotal } from '../lib/bookingFinance'
import { bookingColumns, rpc, explain } from '../lib/operations'
import { ConfirmArchive, IconButton, Modal, RecordTools } from '../components/RecordTools'
import SolarHijriDateInput from '../components/SolarHijriDateInput'
import BookingInformation from '../components/BookingInformation'
import { useBulkSelection } from '../components/BulkSelection'
import Icon from '../components/Icon'
import { RegistrationSection } from '../components/RegistrationFields'
import './BookingsPage.css'
import { formatSolarHijri, todayISO } from '../lib/solarHijri'

const blank = { booking_date: '',branch_id:'', trader_id: '', trader_first_name: '', trader_last_name: '', trader_phone: '', trader_address: '', sender_is_trader: false, sender_name: '', sender_phone: '', sender_address: '', receiver_is_trader:false, receiver_name: '', receiver_phone: '', receiver_address: '', goods: '', quantity_unit:'tons', quantity_amount:'', origin: '', destination: '', vehicle_id: '', driver_id: '', service_type: 'arrangement',commission_amount:'',commission_currency:'AFN',freight_amount:'',carrier_cost:'',other_expenses:[],received_now:'' }
const selection = `${bookingColumns}, traders(full_name,phone), vehicles(plate_number), drivers(full_name)`
const today = todayISO

export default function BookingsPage({ language, profile, onBack, attention, onClearAttention }) {
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
  const [branches,setBranches]=useState([]),[editing,setEditing]=useState(null),[archived,setArchived]=useState(false),[deletion,setDeletion]=useState(null),[detail,setDetail]=useState(null),[cancelRow,setCancelRow]=useState(null),[paymentRow,setPaymentRow]=useState(null),[paymentForm,setPaymentForm]=useState({amount:'',date:kabulToday()}),[paymentError,setPaymentError]=useState('')
  const request=useRef(null)
  const paymentRequest=useRef(null)
  const load=useCallback(async()=>{const [bookings,traders,vehicles,drivers,branches,finance]=await Promise.all([allRows(supabase,'bookings',selection),allRows(supabase,'traders'),allRows(supabase,'vehicles','*, vehicle_owners(full_name,phone,archived_at)'),allRows(supabase,'drivers'),allRows(supabase,'branches'),rpc('booking_finance_rows',{})]);const money=new Map(finance.map(r=>[r.id,r]));setRows(bookings.filter(r=>!r.deleted_at).map(r=>({...r,...money.get(r.id)})).sort((a,b)=>b.created_at.localeCompare(a.created_at)));setTraders(traders);setVehicles(vehicles);setDrivers(drivers);setBranches(branches);setReady(true)},[])
  const refreshForm = useCallback(async () => {
    setMessage('')
    try { await load() }
    catch { setMessage(language==='fa'?'معلومات بوکینگ بارگیری نشد. دکمه تازه‌سازی را بزنید و دوباره کوشش کنید.':'Booking data could not load. Use Refresh to try again.') }
  },[load,language])
  useEffect(()=>{void Promise.resolve().then(refreshForm)},[refreshForm])
  const refreshBookings=useCallback(async()=>{const [bookings,finance]=await Promise.all([allRows(supabase,'bookings',selection),rpc('booking_finance_rows',{})]);const money=new Map(finance.map(r=>[r.id,r]));setRows(bookings.filter(r=>!r.deleted_at).map(r=>({...r,...money.get(r.id)})).sort((a,b)=>b.created_at.localeCompare(a.created_at)))},[])
  useEffect(()=>{
    const update=()=>{if(!document.hidden&&!busy&&!open)void refreshBookings().catch(e=>setMessage(explain(e,language)))}
    const timer=window.setInterval(update,30000)
    window.addEventListener('focus',update)
    return()=>{clearInterval(timer);window.removeEventListener('focus',update)}
  },[refreshBookings,busy,open,language])
  const statuses={confirmed:t('Confirmed','تأییدشده'),in_transit:t('On road','در راه'),completed:t('Completed','تکمیل‌شده'),cancelled:t('Cancelled','لغوشده')}
  const attentionDay = attention ? kabulToday() : ''
  const visibleRows=rows.filter(r=>!!r.archived_at===archived&&(!attention||attentionForBooking(r,attentionDay)===attention)&&(!president||scope==='all'||(scope==='head-office'?!r.branch_id:r.branch_id===scope))&&`${r.booking_number} ${r.trader_first_name||r.traders?.full_name||''} ${r.trader_last_name||''} ${r.origin} ${r.destination}`.toLowerCase().includes(query.toLowerCase()))
  const bookingSelection = useBulkSelection({bulk:{
    language, cardList:true, disabled:busy, refresh:refreshBookings,
    rows:visibleRows.filter(row=>row.status==='completed' && !row.archived_at),
    name:row=>'#'+row.booking_number,
    actions:[
      {id:'archive',label:t('Archive selected','بایگانی انتخاب‌شده‌ها')},
      {id:'delete',label:t('Delete selected','حذف انتخاب‌شده‌ها')},
    ].map(action=>({
      label:action.label,
      note:t('The financial history of these bookings will be retained.','تاریخچه مالی این بوکینگ‌ها نگهداری می‌شود.'),
      runBatch:rows=>rpc('bulk_completed_bookings',{p_ids:rows.map(row=>row.id),p_action:action.id}),
    })),
  }})
  function edit(row){setEditing(row);request.current=null;setForm({...Object.fromEntries(Object.keys(blank).map(key=>[key,row[key]??blank[key]])),quantity_unit:row.quantity_unit||(row.volume_m3?'m3':'tons'),quantity_amount:row.quantity_amount||row.weight_tons||row.volume_m3||'',received_now:''});setMessage('');setOpen(true)}
  async function changeStatus(row,status){if(busy)return;setBusy(true);setMessage('');try{await rpc('change_booking_status',{p_id:row.id,p_status:status,p_request:crypto.randomUUID(),p_expected:row.updated_at});setCancelRow(null);await load()}catch(e){setMessage(explain(e,language))}finally{setBusy(false)}}
  function printBooking(row) {
    const contacts = (name, phone, address) => [name, phone, address].filter(Boolean).join(' · ')
    const vehicle = vehicles.find(item => item.id === row.vehicle_id)
    const driver = drivers.find(item => item.id === row.driver_id)
    const branch = branches.find(item => item.id === row.branch_id)
    const managed = row.service_type === 'managed'
    const amount = value => value == null ? '—' : money(value,row.commission_currency)
    const sections = [
      { title: t('Booking details','مشخصات بوکینگ'), rows: [
        [t('Booking date','تاریخ بوکینگ'),formatSolarHijri(row.booking_date)],
        [t('Status','وضعیت'),statuses[row.status]],
        [t('Service','خدمات'),managed?t('Company-managed transport','انتقال توسط شرکت'):t('Vehicle arrangement','معرفی واسطه')],
        [t('Office','دفتر'),branch ? contacts(branch.name,branch.phone,branch.address) : row.branch_id ? '—' : t('Head office','دفتر مرکزی')],
        [t('Origin','مبدأ'),row.origin],
        [t('Destination','مقصد'),row.destination],
        [t('Goods','بار'),row.goods],
        [t('Quantity','مقدار بار'),quantityText(row)],
      ] },
      { title: t('Contacts and fleet','تماس‌ها و وسایط'), rows: [
        [t('Trader','تاجر'),contacts(`${row.trader_first_name || ''} ${row.trader_last_name || ''}`.trim() || row.traders?.full_name,row.trader_phone || row.traders?.phone,row.trader_address)],
        ...(managed ? [
          [t('Sender','فرستنده'),contacts(row.sender_name,row.sender_phone,row.sender_address)],
          [t('Receiver','گیرنده'),contacts(row.receiver_name,row.receiver_phone,row.receiver_address)],
        ] : []),
        [t('Vehicle','واسطه'),contacts(vehicle?.plate_number || row.vehicles?.plate_number,vehicle?.vehicle_type,vehicle?.foreign_plate_number)],
        [t('Driver','راننده'),contacts(driver?.full_name || row.drivers?.full_name,driver?.phone)],
      ] },
    ]
    if (row.commission_currency) {
      const charges = [[t('Commission','کمیسیون'),amount(row.commission_amount)]]
      if (managed) charges.push(
        [t('Freight','کرایه بار'),amount(row.freight_amount)],
        [t('Vehicle / driver cost','مصارف واسطه و راننده'),amount(row.carrier_cost)],
        ...(row.other_expenses || []).map(item => [item.description,amount(item.amount)]),
      )
      if (president && row.charged != null) charges.push(
        [t('Total charges','مجموع بدهی'),amount(row.charged)],
        [t('Paid (net)','پرداخت خالص'),amount(row.paid)],
        [t('Remaining owed','باقی‌مانده قابل پرداخت'),amount(bookingDue(row.charged,row.paid)/100)],
      )
      sections.push({ title: t('Booking charges','بدهی بوکینگ'), rows: charges })
    }
    const printed = printRecord({
      language,
      title: `${t('Booking confirmation', 'تأییدیه بوکینگ')} #${row.booking_number}`,
      sections,
      note: `${t('Printed on','تاریخ چاپ')} ${formatSolarHijri(kabulToday())}`,
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
  const canBookForBranch = !branchManager || branches.some(branch => branch.id === profile.branch_id && !branch.archived_at)
  const belongsToBookingBranch = row => row.branch_id == null || row.branch_id === form.branch_id
  const availableVehicles = vehicles.filter(row => belongsToBookingBranch(row) && !row.archived_at && row.status === 'available'
    && (!row.owner_id || row.vehicle_owners && !row.vehicle_owners.archived_at) && (!row.permit_expiry || row.permit_expiry >= form.booking_date))
  const availableDrivers = drivers.filter(row => belongsToBookingBranch(row) && !row.archived_at && row.status === 'available'
    && (!row.license_expiry || row.license_expiry >= form.booking_date))
  const sender = form.sender_is_trader ? { sender_name: `${form.trader_first_name} ${form.trader_last_name}`.trim(), sender_phone: form.trader_phone, sender_address: form.trader_address } : { sender_name: form.sender_name, sender_phone: form.sender_phone, sender_address: form.sender_address }
  const receiver = form.receiver_is_trader ? { receiver_name: `${form.trader_first_name} ${form.trader_last_name}`.trim(), receiver_phone: form.trader_phone, receiver_address: form.trader_address } : { receiver_name: form.receiver_name, receiver_phone: form.receiver_phone, receiver_address: form.receiver_address }
  const quantityText = row => row.quantity_amount ? `${row.quantity_amount} ${{tons:'ټن',pieces:'عدد',m3:'متر مکعب'}[row.quantity_unit]||''}` : row.weight_tons ? `${row.weight_tons} ټن` : row.volume_m3 ? `${row.volume_m3} متر مکعب` : row.quantity||'—'
  const money = (amount,currency) => `${Number(amount||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})} ${currency||'AFN'}`
  const field = (key, en, fa, { type = 'text', required = true, value = form[key], disabled = false } = {}) => { const finance=['commission_amount','freight_amount','carrier_cost'].includes(key); return <label><span>{t(en,fa)}{required ? ' *' : ''}</span>{type === 'date' ? <SolarHijriDateInput required={required} disabled={disabled} language={language} value={value ?? ''} onChange={value => setForm(current => ({ ...current, [key]: value }))} ariaLabel={t(en,fa)} /> : <input type={type} required={required} disabled={disabled} min={type === 'number' ? (finance ? key==='commission_amount'?'0.01':'0' : '0.001') : undefined} step={type === 'number' ? finance?'0.01':'0.001' : undefined} value={value ?? ''} onChange={e => setForm(current => ({ ...current, [key]: e.target.value }))} />}</label> }
  function chooseTrader(id) {
    const trader = traders.find(r => r.id === id)
    setForm(current => ({ ...current, trader_id: id, trader_first_name: trader?.first_name || trader?.full_name || '', trader_last_name: trader?.last_name || '', trader_phone: trader?.phone || '', trader_address: trader?.address || '' }))
  }
  async function submit(e) {
    e.preventDefault()
    if (busy) return
    if (!availableVehicles.some(row=>row.id===form.vehicle_id) || !availableDrivers.some(row=>row.id===form.driver_id)) {
      setMessage(t('Choose an available vehicle and driver for this branch and date.','واسطه و راننده در دسترس برای این شعبه و تاریخ را انتخاب کنید.'))
      return
    }
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
  return <div className="registry-page bookings-registry">
    <header className="booking-top">
      <div className="booking-title-row">{onBack && <button type="button" className="module-back booking-back" onClick={onBack}><Icon name="back" size={16}/>{t('Back','بازگشت')}</button>}<h1>{t('Bookings','بار نامه')}</h1></div>
      <button type="button" className="registry-primary booking-add" disabled={!ready||!canBookForBranch} onClick={() => { setEditing(null);request.current=null;setForm({ ...blank, branch_id:branchManager?profile.branch_id:'',booking_date: today() }); setMessage(''); setOpen(true) }}><Plus size={18} aria-hidden="true" />{t('New booking','بار نامه جدید')}</button>
    </header>
    <div className="booking-filters">
      <div className="booking-top-controls">
        <button type="button" className="registry-secondary booking-archive" aria-pressed={archived} onClick={()=>{if(attention)onClearAttention?.();setArchived(!archived)}}><Archive size={17} aria-hidden="true" />{t('Archive','بایگانی')}</button>
        {president && <label className="booking-branch-control">
          <Building2 size={17} aria-hidden="true" />
          <select aria-label={t('Branch','شعبه')} value={scope} onChange={e=>setScope(e.target.value)}>
            <option value="all">{t('All branches','تمام شعبات')}</option>
            <option value="head-office">{t('Head office','دفتر مرکزی')}</option>
            {[...branches].sort((a,b)=>a.name.localeCompare(b.name)).map(branch=><option key={branch.id} value={branch.id}>{branch.name}{branch.archived_at?` · ${t('Archived','بایگانی‌شده')}`:''}</option>)}
          </select>
        </label>}
        <IconButton icon={RefreshCw} label={t('Refresh','تازه‌سازی')} disabled={busy} onClick={refreshForm}/>
      </div>
      <label className="registry-search booking-search"><Search size={17} aria-hidden="true" /><input type="search" aria-label={t('Search bookings','جستجوی بار نامه')} placeholder={t('Search booking, trader or route','جستجوی بار نامه، تاجر یا مسیر')} value={query} onChange={e => setQuery(e.target.value)} /></label>
    </div>
    {attention && <div className="booking-attention-filter">
      <strong>{t(...bookingAttention[attention])}{ready && <> · <bdi>{visibleRows.length}</bdi></>}</strong>
      <button type="button" className="registry-secondary" onClick={onClearAttention}>{t('Clear attention filter','پاک‌کردن فیلتر بررسی')}</button>
    </div>}
    {branchManager&&(!profile.branch_id||(ready&&!canBookForBranch))&&<p role="alert" className="registry-notice error">{t('Your account needs an active branch assignment before you can book. Ask the President to check the branch manager account.','برای ثبت بوکینگ حساب شما باید به شعبه فعال وصل باشد. از رئیس بخواهید حساب مدیر شعبه را بررسی کند.')}</p>}
    {message && !open && !detail && <div role="alert" className="registry-notice error">{message}</div>}
    {bookingSelection.controls}
    {!ready && !message && <p className="booking-list-loading" role="status">{t('Loading bookings…','در حال بارگیری بار نامه‌ها…')}</p>}
    <div className="booking-list">{visibleRows.map(r => <article className="booking-record" data-status={r.status} key={r.id}>
      <header className="booking-card-header">
        {bookingSelection.checkbox(r)}
        <span className="booking-card-reference"><ClipboardList size={16} aria-hidden="true" /><bdi>#{r.booking_number}</bdi></span>
        <h3><bdi>{r.trader_first_name ? `${r.trader_first_name} ${r.trader_last_name || ''}` : r.traders?.full_name || '—'}</bdi></h3>
        <span className={`status-pill ${r.status}`}>{statuses[r.status]}</span>
      </header>
      <div className="booking-card-body">
      {!r.archived_at&&['confirmed','in_transit'].includes(r.status)&&(r.driver_delivered_at?<p className="driver-booking-report"><CheckCheck size={20}/>{t('Driver reported delivery · confirm completion','راننده تحویل بار را گزارش داد · تکمیل سفر را تأیید کنید')}</p>:r.driver_accepted_at?<p className="driver-booking-report"><BadgeCheck size={20}/>{t('Driver accepted','راننده برنامه را پذیرفت')}</p>:null)}
      {attention==='departures' && <p className="booking-departure-due"><CalendarDays size={15} aria-hidden="true"/>{t('Planned departure','تاریخ برنامه‌ریزی‌شدهٔ حرکت')} <bdi dir="ltr">{formatSolarHijri(r.departure_date || r.booking_date)}</bdi></p>}
        <dl className="booking-card-facts">
          <div className="booking-card-route">
            <dt><MapPin size={14} aria-hidden="true" />{t('Route / cargo','مسیر / بار')}</dt>
            <dd className="booking-route-pair"><bdi>{r.origin || '—'}</bdi><ArrowRight size={14} aria-hidden="true" /><bdi>{r.destination || '—'}</bdi></dd>
            <dd>{r.goods} · <bdi>{quantityText(r)}</bdi></dd>
          </div>
          <div>
            <dt><CalendarDays size={14} aria-hidden="true" />{t('Date / service','تاریخ / خدمات')}</dt>
            <dd><time dateTime={r.booking_date}><bdi dir="ltr">{formatSolarHijri(r.booking_date)}</bdi></time></dd>
            <dd>{r.service_type === 'managed' ? t('Company-managed transport','انتقال توسط شرکت') : t('Vehicle arrangement','معرفی واسطه')}</dd>
            {president && <dd className="booking-card-balance">{t('Trader owes','بدهی تاجر')} · <bdi dir="ltr">{money(bookingDue(r.charged,r.paid)/100,r.commission_currency)}</bdi></dd>}
          </div>
          <div>
            <dt><Users size={14} aria-hidden="true" />{t('Sender / receiver','فرستنده / گیرنده')}</dt>
            <dd><bdi>{r.sender_name || '—'}</bdi></dd><dd><bdi>{r.receiver_name || '—'}</bdi></dd>
          </div>
          <div>
            <dt><Truck size={14} aria-hidden="true" />{t('Vehicle / driver','واسطه / راننده')}</dt>
            <dd><bdi>{r.vehicles?.plate_number || '—'}</bdi></dd><dd><bdi>{r.drivers?.full_name || '—'}</bdi></dd>
          </div>
        </dl>
        <details className="booking-contact-details">
          <summary>{t('Contact details','مشخصات تماس')}</summary>
          <dl className="booking-card-contacts">
            {[
              [t('Trader contact / address','تماس / آدرس تاجر'),r.trader_phone || r.traders?.phone,r.trader_address],
              [t('Sender contact / address','تماس / آدرس فرستنده'),r.sender_phone,r.sender_address],
              [t('Receiver contact / address','تماس / آدرس گیرنده'),r.receiver_phone,r.receiver_address],
            ].map(([label,phone,address])=><div key={label}><dt>{label}</dt><dd><bdi dir="ltr">{phone || '—'}</bdi> · <bdi>{address || '—'}</bdi></dd></div>)}
          </dl>
        </details>
      </div>
      <div className="booking-record-actions">
        <button type="button" className="registry-secondary booking-view" disabled={busy} onClick={()=>{setMessage('');setDetail(r)}}><Eye size={17} aria-hidden="true" />{t('Details','جزئیات')}</button>
        <RecordTools language={language} disabled={busy} archived={r.archived_at} onEdit={r.status==='confirmed'?()=>edit(r):undefined} onArchive={()=>{setMessage('');setDeletion(r)}}/>
        {!r.archived_at && <>
          {r.status==='confirmed' && <IconButton icon={Play} className="booking-journey" disabled={busy} label={t('Start journey','شروع سفر')} onClick={()=>changeStatus(r,'in_transit')}/>}
          {r.status==='in_transit' && <IconButton icon={CheckCircle2} className="booking-journey" disabled={busy} label={t('Complete journey','تکمیل سفر')} onClick={()=>changeStatus(r,'completed')}/>}
          {['confirmed','in_transit'].includes(r.status) && <IconButton icon={XCircle} className="booking-cancel" disabled={busy} label={t('Cancel booking','لغو بوکینگ')} onClick={()=>{setMessage('');setCancelRow(r)}}/>}
          {president && r.trader_id && bookingDue(r.charged,r.paid)>0 && <button type="button" className="registry-secondary booking-payment" disabled={busy} onClick={()=>openPayment(r)}>{t('Receive payment','دریافت پول')}</button>}
        </>}
      </div>
    </article>)}</div>
    {ready && !visibleRows.length && <div className="registry-empty"><ClipboardList size={32} />{rows.length?t('No bookings match these filters.','هیچ بوکینگی با این فیلترها مطابقت ندارد.'):t('No bookings registered yet.','هنوز بوکینگ ثبت نشده است.')}</div>}
    {open && <Modal title={editing?t('Edit booking','ویرایش بوکینگ'):t('New booking','بوکینگ جدید')}
      busy={busy} onClose={() => setOpen(false)} className="registration-form-card booking-form-card">
      <form className="registration-form booking-form" onSubmit={submit}><fieldset disabled={busy} className="registration-fieldset">
        <RegistrationSection kind="booking" tone="blue" title={t('Date','تاریخ')} icon={CalendarDays}>{field('booking_date','Date','تاریخ',{type:'date'})}
        {!branchManager&&<label><span>{t('Branch','شعبه')}</span><select disabled={!!editing} value={form.branch_id||''} onChange={event=>setForm(current=>({
          ...current,branch_id:event.target.value,vehicle_id:'',driver_id:'',
          ...(current.trader_id?{trader_id:'',trader_first_name:'',trader_last_name:'',trader_phone:'',trader_address:''}:{}),
        }))}><option value="">{t('Head office','دفتر مرکزی')}</option>{branches.filter(b=>!b.archived_at||b.id===form.branch_id).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>}
        <label><span>{t('Booking type','نوع بوکینگ')}</span><select value={form.service_type} onChange={e => setForm({ ...form, service_type: e.target.value })}><option value="arrangement">{t('Vehicle arrangement','معرفی واسطه')}</option><option value="managed">{t('Company-managed transport','انتقال توسط شرکت')}</option></select></label>
        </RegistrationSection>
        <RegistrationSection kind="trader" tone="teal" title={t('Trader information','مشخصات تاجر')} icon={UserRound}>
        <label className="wide"><span>{t('Select an existing trader or enter a new trader below','تاجر ثبت‌شده را انتخاب کنید یا مشخصات تاجر جدید را وارد کنید')}</span><select value={form.trader_id} onChange={e => chooseTrader(e.target.value)}><option value="">{t('New trader','تاجر جدید')}</option>{traders.filter(r=>!r.archived_at&&belongsToBookingBranch(r)).map(r => <option key={r.id} value={r.id}>{r.full_name} · {r.phone}</option>)}</select></label>
        {field('trader_first_name','First name','نام')}{field('trader_last_name','Last name / surname','تخلص',{required:false})}{field('trader_phone','Contact number','شماره تماس',{type:'tel'})}{field('trader_address','Address','آدرس')}
        </RegistrationSection>
        {form.service_type==='managed'&&<><RegistrationSection kind="sender" tone="blue" title={t('Sender information','مشخصات فرستنده')} icon={Send}>
        <label className="wide registry-check"><input type="checkbox" checked={form.sender_is_trader} onChange={e => setForm({ ...form, sender_is_trader: e.target.checked })} /><span>{t('Trader is the sender','تاجر فرستنده است')}</span></label>
        {field('sender_name','Full name (with surname)','نام و تخلص',{value:sender.sender_name,disabled:form.sender_is_trader})}{field('sender_phone','Phone','موبایل',{type:'tel',value:sender.sender_phone,disabled:form.sender_is_trader})}{field('sender_address','Address','آدرس',{value:sender.sender_address,disabled:form.sender_is_trader})}
        </RegistrationSection>
        <RegistrationSection kind="receiver" tone="purple" title={t('Receiver information','مشخصات گیرنده')} icon={Users}><label className="wide registry-check"><input type="checkbox" checked={form.receiver_is_trader} onChange={e=>setForm({...form,receiver_is_trader:e.target.checked})}/><span>{t('Trader is the receiver','تاجر گیرنده است')}</span></label>{field('receiver_name','Full name (with surname)','نام و تخلص',{value:receiver.receiver_name,disabled:form.receiver_is_trader})}{field('receiver_phone','Contact number','شماره تماس',{type:'tel',value:receiver.receiver_phone,disabled:form.receiver_is_trader})}{field('receiver_address','Address','آدرس',{value:receiver.receiver_address,disabled:form.receiver_is_trader})}</RegistrationSection></>}
        <RegistrationSection kind="goods" tone="amber" title={t('Goods information','مشخصات بار')} icon={Package}>{field('goods','Goods name','نام بار')}<label><span>{t('Goods amount','مقدار بار')} *</span><select value={form.quantity_unit} onChange={e=>setForm({...form,quantity_unit:e.target.value})}><option value="tons">ټن</option><option value="pieces">عدد</option><option value="m3">متر مکعب</option></select></label>{field('quantity_amount','Amount','مقدار',{type:'number'})}
        </RegistrationSection>
        <RegistrationSection kind="route" tone="blue" title={t('Route','مسیر')} icon={MapPin}>{field('origin','Origin location','محل مبدأ')}{field('destination','Destination location','محل مقصد')}
        </RegistrationSection>
        <RegistrationSection kind="finance" tone="purple" title={t('Booking finance','مالیه بوکینگ')} icon={Package}><label><span>{t('Currency for all booking amounts','واحد پول همه مبالغ بوکینگ')}</span><select disabled={!!editing?.commission_amount} value={form.commission_currency} onChange={e=>setForm({...form,commission_currency:e.target.value})}>{['AFN','USD','PKR','IRR'].map(c=><option key={c}>{c}</option>)}</select></label>{field('commission_amount','Commission amount','مقدار کمیسیون',{type:'number',disabled:!!editing?.commission_amount})}
        {form.service_type==='managed'&&<>{field('freight_amount','Freight owed by trader','کرایه بار قابل پرداخت توسط تاجر',{type:'number'})}{field('carrier_cost','Vehicle / driver cost owed by trader','مصارف واسطه و راننده قابل پرداخت توسط تاجر',{type:'number'})}<h3 className="booking-section-heading">{t('More expenses owed by trader','مصارف بیشتر قابل پرداخت توسط تاجر')}</h3>{form.other_expenses.map((expense,index)=><div className="wide booking-preview" key={index}><label><span>{t('Expense','مصرف')}</span><input required value={expense.description} onChange={e=>setForm(current=>({...current,other_expenses:current.other_expenses.map((x,i)=>i===index?{...x,description:e.target.value}:x)}))}/></label><label><span>{t('Amount','مقدار')}</span><input required type="number" min="0.01" step="0.01" value={expense.amount} onChange={e=>setForm(current=>({...current,other_expenses:current.other_expenses.map((x,i)=>i===index?{...x,amount:e.target.value}:x)}))}/></label><button type="button" onClick={()=>setForm(current=>({...current,other_expenses:current.other_expenses.filter((_,i)=>i!==index)}))}>{t('Remove','حذف')}</button></div>)}<button type="button" className="registry-secondary" onClick={()=>setForm(current=>({...current,other_expenses:[...current.other_expenses,{description:'',amount:''}]}))}>{t('Add expense','افزودن مصرف')}</button></>}
        <p className="wide booking-help">{t('Total owed by trader','مجموع بدهی تاجر')}: <strong>{money(bookingTotal(form)/100,form.commission_currency)}</strong></p>
        {president&&!editing&&<label><span>{t('Received now (optional)','دریافت فعلی (اختیاری)')}</span><input type="number" min="0" max={bookingTotal(form)/100} step="0.01" value={form.received_now} onChange={e=>setForm(current=>({...current,received_now:e.target.value}))}/><small>{t('Only this received amount is added to Cashbook Money In. Record later payments from Bookings or the trader account.','فقط مبلغ دریافت‌شده در پول آمد روزنامچه ثبت می‌شود. پرداخت بعدی را از بوکینگ‌ها یا حساب تاجر ثبت کنید.')}</small></label>}
        </RegistrationSection>
        <RegistrationSection kind="fleet" tone="teal" title={t('Vehicle and driver','واسطه و راننده')} icon={Truck}>
        {(!availableVehicles.length||!availableDrivers.length)&&<p className="wide booking-help" role="status">
          {!availableVehicles.length&&t('No eligible vehicle. Check its availability, permit, and active owner in Fleet. ','واسطه واجد شرایط نیست. دسترسی، جواز و مالک فعال آن را در وسایط بررسی کنید. ')}
          {!availableDrivers.length&&t('No eligible driver. Check driver availability and licence in Fleet. ','راننده واجد شرایط نیست. دسترسی و لایسنس راننده را در وسایط بررسی کنید. ')}
          {branchManager&&t('Use branch fleet or ask the President to assign or share the missing record.','از وسایط شعبه استفاده کنید یا از رئیس بخواهید ریکارد لازم را اختصاص دهد یا شریک کند.')}
        </p>}
        <label><span>{t('Registered vehicle','واسطه ثبت‌شده')} *</span><select required value={form.vehicle_id} onChange={e => setForm(current => ({ ...current, vehicle_id:e.target.value }))}><option value="">—</option>{availableVehicles.map(v => <option key={v.id} value={v.id}>{v.plate_number} · {v.vehicle_type}</option>)}</select></label>
        <label><span>{t('Registered driver','راننده ثبت‌شده')} *</span><select required value={form.driver_id} onChange={e => setForm(current => ({ ...current, driver_id:e.target.value }))}><option value="">—</option>{availableDrivers.map(d => <option key={d.id} value={d.id}>{d.full_name} · {d.phone}</option>)}</select></label>
        {vehicle && <dl className="booking-preview"><dt>{t('Plate / foreign plate','پلیت / پلیت خارجی')}</dt><dd>{vehicle.plate_number} / {vehicle.foreign_plate_number || '—'}</dd><dt>{t('Type / color','نوع / رنگ')}</dt><dd>{vehicle.vehicle_type} / {vehicle.color || '—'}</dd><dt>{t('VIN','نمبر شاسی')}</dt><dd>{vehicle.vin_number || '—'}</dd><dt>{t('Owner','مالک')}</dt><dd>{vehicle.vehicle_owners?.full_name || '—'} · {vehicle.vehicle_owners?.phone || '—'}</dd><dt>{t('Permit expiry','تاریخ ختم جواز')}</dt><dd>{formatSolarHijri(vehicle.permit_expiry)}</dd></dl>}
        {driver && <dl className="booking-preview"><dt>{t('Driver','راننده')}</dt><dd>{driver.full_name}</dd><dt>{t('Father name','نام پدر')}</dt><dd>{driver.father_name || '—'}</dd><dt>{t('Contact','تماس')}</dt><dd>{driver.phone}</dd><dt>{t('Address','آدرس')}</dt><dd>{driver.address || '—'}</dd><dt>{t('Licence number','نمبر لایسنس')}</dt><dd>{driver.license_number || '—'}</dd></dl>}
        {driver&&!driver.user_id&&<p className="wide booking-help">{t('To show this job in the driver portal, connect this driver’s login using the key icon in Fleet → Drivers.','برای نمایش برنامه در درگاه راننده، حساب این راننده را با آیکن کلید در بخش وسایط ← رانندگان وصل کنید.')}</p>}
        <p className="wide booking-help">{t('Register missing vehicles and drivers in Fleet first. Trader details are saved with this booking; existing trader profiles are not overwritten.','وسایط و رانندگان جدید را ابتدا در بخش وسایط ثبت کنید. مشخصات تاجر با این بوکینگ ذخیره می‌شود؛ مشخصات قبلی تاجر تغییر نمی‌کند.')}</p>
        </RegistrationSection>
      </fieldset>
      {message && <div role="alert" className="wide registry-notice error">{message}</div>}
      <div className="registry-form-actions registration-actions"><button type="button" disabled={busy} onClick={() => setOpen(false)}>{t('Cancel','انصراف')}</button><button className="registry-primary" disabled={busy||!availableVehicles.length||!availableDrivers.length}>{busy ? t('Saving…','در حال ثبت…') : t('Save booking','ثبت بوکینگ')}</button></div></form>
    </Modal>}
    {deletion&&<ConfirmArchive language={language} busy={busy} error={message} restore={!!deletion.archived_at} onClose={()=>setDeletion(null)} onConfirm={async()=>{setBusy(true);try{await rpc('archive_booking_record',{p_id:deletion.id,p_archived:!deletion.archived_at,p_expected:deletion.updated_at});setDeletion(null);await load()}catch(e){setMessage(explain(e,language))}finally{setBusy(false)}}}/>}
    {bookingSelection.dialog}
    {paymentRow&&<Modal title={`${t('Receive payment for booking','دریافت پول بوکینگ')} #${paymentRow.booking_number}`} busy={busy} onClose={()=>setPaymentRow(null)}><form className="registry-form" onSubmit={savePayment}><p className="wide booking-help">{t('Remaining owed','باقی‌مانده قابل پرداخت')}: <strong>{money(bookingDue(paymentRow.charged,paymentRow.paid)/100,paymentRow.commission_currency)}</strong></p><fieldset disabled={busy} className="booking-fields wide"><label><span>{t('Amount received','مبلغ دریافت‌شده')} ({paymentRow.commission_currency}) *</span><input required type="number" min="0.01" max={bookingDue(paymentRow.charged,paymentRow.paid)/100} step="0.01" value={paymentForm.amount} onChange={e=>setPaymentForm(current=>({...current,amount:e.target.value}))}/></label><label><span>{t('Payment date','تاریخ دریافت')} *</span><SolarHijriDateInput required max={kabulToday()} language={language} value={paymentForm.date} onChange={date=>setPaymentForm(current=>({...current,date}))} ariaLabel={t('Payment date','تاریخ دریافت')}/></label></fieldset><p className="wide booking-help">{t('This payment is added once to Cashbook Money In and the trader account.','این پرداخت یک‌بار در پول آمد روزنامچه و حساب تاجر ثبت می‌شود.')}</p>{paymentError&&<p className="wide registry-notice error" role="alert">{paymentError}</p>}<div className="registry-form-actions"><button type="button" disabled={busy} onClick={()=>setPaymentRow(null)}>{t('Cancel','انصراف')}</button><button className="registry-primary" disabled={busy}>{t('Save payment','ثبت پرداخت')}</button></div></form></Modal>}
    {cancelRow&&<Modal title={t('Cancel booking','لغو بوکینگ')} onClose={()=>setCancelRow(null)} busy={busy}><div className="record-modal-body"><p>{t('Cancel this booking and release its vehicle and driver?','این بوکینگ لغو و واسطه و راننده آزاد شوند؟')}</p>{message&&<p role="alert" className="registry-notice error">{message}</p>}<button className="registry-primary" disabled={busy} onClick={()=>changeStatus(cancelRow,'cancelled')}>{t('Cancel booking','لغو بوکینگ')}</button></div></Modal>}
    {detail && <Modal className="booking-detail-card" title={`${t('Booking details','جزئیات بار نامه')} · \u2066#${detail.booking_number}\u2069`} onClose={()=>setDetail(null)}>
      <BookingInformation row={detail} language={language} president={president}
        vehicle={vehicles.find(row=>row.id===detail.vehicle_id)}
        driver={drivers.find(row=>row.id===detail.driver_id)}
        branch={branches.find(row=>row.id===detail.branch_id)}
        onPrint={()=>printBooking(detail)} message={message}/>
    </Modal>}
  </div>
}
