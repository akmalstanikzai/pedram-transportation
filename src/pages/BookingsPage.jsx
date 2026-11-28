import { useCallback, useEffect, useRef, useState } from 'react'
import { Archive, ArrowLeftRight, ArrowRight, BadgeCheck, Building2, CalendarDays, CheckCheck, CheckCircle2, ClipboardList, Eye, MapPin, Package, Play, Plus, RefreshCw, Search, Send, Truck, UserRound, Users, XCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { allRows, currencies, kabulToday } from '../lib/cashbook'
import { attentionForBooking, bookingAttention, driverReportForCurrentLeg } from '../lib/bookingAttention'
import { recordQuery, withRecordReturn } from '../lib/recordRoutes'
import { printRecord } from '../lib/recordExports'
import { bookingDue, bookingTotal, bookingTypeLabels } from '../lib/bookingFinance'
import { bookingColumns, rpc, explain } from '../lib/operations'
import { fleetDirectoryRows } from '../lib/fleetDirectory'
import { ConfirmArchive, IconButton, Modal, RecordTools } from '../components/RecordTools'
import SolarHijriDateInput from '../components/SolarHijriDateInput'
import BookingInformation from '../components/BookingInformation'
import ManagedBookingCharges from '../components/ManagedBookingCharges'
import { managedStatementSections } from '../lib/financialReports'
import { managedChargeLabel, managedChargeLabels } from '../lib/managedBookings'
import { useBulkSelection } from '../components/BulkSelection'
import Icon from '../components/Icon'
import { RegistrationSection } from '../components/RegistrationFields'
import './BookingsPage.css'
import { formatSolarHijri, kabulISODate, todayISO } from '../lib/solarHijri'

const blank = { booking_date: '', departure_date: '', arrival_date: '', handoff_location: '', handoff_date: '', onward_vehicle_id: '', onward_driver_id: '',
  branch_id:'', trader_id: '', trader_first_name: '', trader_last_name: '', trader_phone: '', trader_address: '', sender_is_trader: false, sender_name: '', sender_phone: '', sender_address: '', receiver_is_trader:false, receiver_name: '', receiver_phone: '', receiver_address: '', goods: '', quantity_unit:'tons', quantity_amount:'', origin: '', destination: '', vehicle_id: '', driver_id: '', service_type: 'arrangement',commission_amount:'',commission_currency:'AFN',freight_amount:'',carrier_cost:'',other_expenses:[],received_now:'' }
const selection = `${bookingColumns}, traders(full_name,phone), vehicles!bookings_vehicle_id_fkey(plate_number), drivers!bookings_driver_id_fkey(full_name), onward_vehicle:vehicles!bookings_onward_vehicle_id_fkey(plate_number), onward_driver:drivers!bookings_onward_driver_id_fkey(full_name)`
const today = todayISO
const blankBorder = { border_location:'',foreign_plate:'',foreign_driver:'',foreign_mobile:'',afghan_waybill:'' }
const managedDefaults = type => Object.keys(managedChargeLabels)
  .filter(key=>type==='domestic' ? key==='domestic_freight' : key!=='domestic_freight')
  .map(key=>({key,amount:'',currency:'AFN'}))

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
  const [withHandoff, setWithHandoff] = useState(false)
  const [handoffRow, setHandoffRow] = useState(null)
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)
  const [message, setMessage] = useState('')
  const [query, setQuery] = useState('')
  const destination = recordQuery()
  const [scope, setScope] = useState(()=>destination.get('scope') || 'all')
  const overviewStatus = destination.get('status')
  const targetBooking = destination.get('booking')
  const [branches,setBranches]=useState([]),[editing,setEditing]=useState(null),[archived,setArchived]=useState(false),[deletion,setDeletion]=useState(null),[detail,setDetail]=useState(null),[cancelRow,setCancelRow]=useState(null),[paymentRow,setPaymentRow]=useState(null),[paymentForm,setPaymentForm]=useState({amount:'',date:kabulToday()}),[paymentError,setPaymentError]=useState('')
  const request=useRef(null)
  const paymentRequest=useRef(null)
  const expenseRequest=useRef(null)
  const [border,setBorder]=useState(blankBorder)
  const [managedCharges,setManagedCharges]=useState(()=>managedDefaults('managed'))
  const [expense,setExpense]=useState(null)
  const [expenseError,setExpenseError]=useState('')
  const load=useCallback(async()=>{const [bookings,traders,vehicles,drivers,branches,finance]=await Promise.all([allRows(supabase,'bookings',selection),allRows(supabase,'traders'),allRows(supabase,'vehicles','*, vehicle_owners(full_name,phone,archived_at)'),fleetDirectoryRows('driver',president),allRows(supabase,'branches'),rpc('booking_finance_rows',{})]);const money=new Map(finance.map(r=>[r.id,r]));setRows(bookings.filter(r=>!r.deleted_at).map(r=>({...r,...money.get(r.id)})).sort((a,b)=>b.created_at.localeCompare(a.created_at)));setTraders(traders);setVehicles(vehicles);setDrivers(drivers);setBranches(branches);setReady(true)},[president])
  const refreshForm = useCallback(async () => {
    setMessage('')
    try { await load() }
    catch { setMessage(language==='fa'?'معلومات بوکینگ بارگیری نشد. دکمه تازه‌سازی را بزنید و دوباره کوشش کنید.':'Booking data could not load. Use Refresh to try again.') }
  },[load,language])
  useEffect(()=>{void Promise.resolve().then(refreshForm)},[refreshForm])
  const refreshBookings=useCallback(async()=>{const [bookings,finance]=await Promise.all([allRows(supabase,'bookings',selection),rpc('booking_finance_rows',{})]);const money=new Map(finance.map(r=>[r.id,r]));const updated=bookings.filter(r=>!r.deleted_at).map(r=>({...r,...money.get(r.id)})).sort((a,b)=>b.created_at.localeCompare(a.created_at));setRows(updated);return updated},[])
  useEffect(()=>{
    const update=()=>{if(!document.hidden&&!busy&&!open)void refreshBookings().catch(e=>setMessage(explain(e,language)))}
    const timer=window.setInterval(update,30000)
    window.addEventListener('focus',update)
    return()=>{clearInterval(timer);window.removeEventListener('focus',update)}
  },[refreshBookings,busy,open,language])
  const statuses={confirmed:t('Confirmed','تأییدشده'),in_transit:t('On road','در راه'),completed:t('Completed','تکمیل‌شده'),cancelled:t('Cancelled','لغوشده')}
  const attentionDay = attention ? kabulToday() : ''
  const matchesOverview = row => !overviewStatus || (row.status===overviewStatus
    && (overviewStatus!=='in_transit' || !driverReportForCurrentLeg(row).delivered))
  const visibleRows=rows.filter(r=>(targetBooking ? r.id===targetBooking : !!r.archived_at===archived)&&matchesOverview(r)&&(!attention||attentionForBooking(r,attentionDay)===attention)&&(!president||scope==='all'||(scope==='head-office'?!r.branch_id:r.branch_id===scope))&&`${r.booking_number} ${r.trader_first_name||r.traders?.full_name||''} ${r.trader_last_name||''} ${r.origin} ${r.destination}`.toLowerCase().includes(query.toLowerCase()))
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
  function edit(row){
    setEditing(row);setWithHandoff(!!row.handoff_date);request.current=null
    setForm({...Object.fromEntries(Object.keys(blank).map(key=>[key,row[key]??blank[key]])),quantity_unit:row.quantity_unit||(row.volume_m3?'m3':'tons'),quantity_amount:row.quantity_amount||row.weight_tons||row.volume_m3||'',received_now:''})
    setBorder(Object.fromEntries(Object.keys(blankBorder).map(key=>[key,row.managed_transport?.[key]??''])))
    const charges=row.managed_transport?.charges??[]
    setManagedCharges([...managedDefaults(row.service_type).map(line=>charges.find(charge=>charge.key===line.key)??line),...charges.filter(charge=>charge.key.startsWith('other:'))])
    setMessage('');setOpen(true)
  }
  async function changeStatus(row,status){if(busy)return;setBusy(true);setMessage('');try{await rpc('change_booking_status',{p_id:row.id,p_status:status,p_request:crypto.randomUUID(),p_expected:row.updated_at});setCancelRow(null);setHandoffRow(null);await load()}catch(e){setMessage(explain(e,language))}finally{setBusy(false)}}
  function printBooking(row) {
    const contacts = (name, phone, address) => [name, phone, address].filter(Boolean).join(' · ')
    const vehicle = vehicles.find(item => item.id === row.vehicle_id)
    const driver = drivers.find(item => item.id === row.driver_id)
    const branch = branches.find(item => item.id === row.branch_id)
    const managed = row.service_type === 'managed'
    const domestic = row.service_type === 'domestic'
    const amount = value => value == null ? '—' : money(value,row.commission_currency)
    const sections = [
      { title: t('Booking details','مشخصات بوکینگ'), rows: [
        [t('Booking date','تاریخ بوکینگ'),formatSolarHijri(row.booking_date)],
        ...(managed && row.managed_transport ? [] : [
          [t('Departure date','تاریخ حرکت'),formatSolarHijri(row.departure_date || row.booking_date)],
          [t('Arrival date','تاریخ رسیدن'),formatSolarHijri(row.arrival_date || row.departure_date || row.booking_date)],
        ]),
        [t('Status','وضعیت'),statuses[row.status]],
        [t('Service','خدمات'),t(...bookingTypeLabels[row.service_type])],
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
        ] : []),
        ...(managed || domestic ? [[t('Receiver','گیرنده'),contacts(row.receiver_name,row.receiver_phone,row.receiver_address)]] : []),
        [t('Vehicle','واسطه'),contacts(vehicle?.plate_number || row.vehicles?.plate_number,vehicle?.vehicle_type,domestic ? null : vehicle?.foreign_plate_number)],
        [t('Driver','راننده'),contacts(driver?.full_name || row.drivers?.full_name,driver?.phone)],
      ] },
    ]
    if (row.handoff_date) sections.push({ title: t('Truck handoff','انتقال بار به واسطهٔ دوم'), rows: [
      [t('Transfer location','محل انتقال'),row.handoff_location],
      [t('Planned transfer date','تاریخ برنامه‌ریزی‌شدهٔ انتقال'),formatSolarHijri(row.handoff_date)],
      [t('Second vehicle','واسطهٔ دوم'),row.onward_vehicle?.plate_number || '—'],
      [t('Second driver','رانندهٔ دوم'),row.onward_driver?.full_name || '—'],
      [t('Transfer status','وضعیت انتقال'),row.handoff_confirmed_at ? t('Confirmed','تأیید شد') : t('Planned','برنامه‌ریزی شده')],
      ...(row.handoff_confirmed_at ? [[t('Confirmed on','تاریخ تأیید'),formatSolarHijri(kabulISODate(new Date(row.handoff_confirmed_at)))]] : []),
    ] })
    if (row.managed_transport) {
      const details=row.managed_transport
      if (managed) sections.push({title:t('Foreign vehicle','مشخصات موتر خارجی'),rows:[
        [t('Border handover','محل تحویل در مرز'),details.border_location],
        [t('Plate number','نمبر پلیت'),details.foreign_plate],
        [t('Driver name','نام راننده'),details.foreign_driver],
        [t('Mobile','موبایل'),details.foreign_mobile],
        [t('Afghan waybill','نمبر بارنامهٔ موتر افغانی'),details.afghan_waybill],
      ]})
      sections.push(...managedStatementSections({...details,domestic},language).filter(section=>section.rows.length))
    } else if (row.commission_currency) {
      const charges = [[t('Commission','کمیسیون'),amount(row.commission_amount)]]
      if (row.commission_driver_id) charges.push([t('Commission payer','پرداخت‌کنندهٔ کمیسیون'),driver?.full_name || t('Driver','راننده')])
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
  const payableBalances = row => (row.managed_transport?.balances??[]).filter(balance=>bookingDue(balance.charged,balance.paid)>0)
  const paymentLimit = paymentRow ? (paymentRow.managed_transport
    ? payableBalances(paymentRow).find(balance=>balance.currency===paymentForm.currency)
    : paymentRow) : null
  const paymentDue = bookingDue(paymentLimit?.charged,paymentLimit?.paid)
  function openPayment(row){
    paymentRequest.current=null;setPaymentError('')
    setPaymentForm({amount:'',date:kabulToday(),currency:row.managed_transport ? payableBalances(row)[0]?.currency : row.commission_currency})
    setPaymentRow(row)
  }
  async function savePayment(e){
    e.preventDefault();if(busy||!paymentRow||!president)return
    const amount=Number(paymentForm.amount)
    if(!Number.isFinite(amount)||amount<=0||!/^\d+(\.\d{1,2})?$/.test(paymentForm.amount)||amount>paymentDue/100){setPaymentError(t('Enter a valid amount no greater than the booking balance.','مبلغ درست و کمتر یا مساوی باقی‌مانده بوکینگ وارد کنید.'));return}
    const payload={branch_id:paymentRow.branch_id,currency:paymentForm.currency,direction:'in',amount:paymentForm.amount,date:paymentForm.date,description:`Booking #${paymentRow.booking_number} payment received`,trader_id:paymentRow.trader_id,booking_id:paymentRow.id}
    const key=JSON.stringify(payload);if(paymentRequest.current?.key!==key)paymentRequest.current={key,id:crypto.randomUUID()}
    setBusy(true);setPaymentError('')
    try {
      const p_request=paymentRequest.current.id
      if(paymentRow.commission_driver_id){
        await rpc('receive_driver_booking_commission',{p_request,p_booking:paymentRow.id,p_driver:paymentRow.commission_driver_id,p_amount:paymentForm.amount,p_date:paymentForm.date})
      }else await rpc('cashbook_simple_post',{p_request,p_data:payload})
      setPaymentRow(null)
      window.dispatchEvent(new Event('pedram:cashbook-changed'))
      try{await refreshBookings()}catch{setMessage(t('Payment saved. Refresh bookings to update the balance.','پرداخت ثبت شد. برای تازه‌سازی باقی‌مانده بوکینگ‌ها را تازه کنید.'))}
    }
    catch(error){setPaymentError(explain(error,language))}
    finally{setBusy(false)}
  }
  function openExpense(charge){
    expenseRequest.current=null;setExpenseError('')
    setExpense({charge,date:kabulToday(),account:detail.branch_id??''})
  }
  async function payExpense(event){
    event.preventDefault()
    if (busy||!expense) return
    const payload={
      p_charge:expense.charge.id,p_account_branch:expense.account||null,p_date:expense.date,
      p_expected_amount:expense.charge.amount,p_expected_currency:expense.charge.currency,
    }
    const key=JSON.stringify(payload)
    if(expenseRequest.current?.key!==key)expenseRequest.current={key,id:crypto.randomUUID()}
    setBusy(true);setExpenseError('')
    try {
      await rpc('pay_managed_booking_expense',{p_request:expenseRequest.current.id,...payload})
      setExpense(null)
      window.dispatchEvent(new Event('pedram:cashbook-changed'))
      try {
        const updated=await refreshBookings()
        setDetail(current=>updated.find(row=>row.id===current?.id)??null)
      } catch {
        setDetail(null)
        setMessage(t('Expense paid. Refresh Bookings to see the receipt.','تادیهٔ مصرف ثبت شد. برای دیدن رسید، بار نامه‌ها را تازه کنید.'))
      }
    } catch(error){setExpenseError(explain(error,language))}
    finally{setBusy(false)}
  }
  const vehicle = vehicles.find(v => v.id === form.vehicle_id)
  const driver = drivers.find(d => d.id === form.driver_id)
  const domestic = form.service_type==='domestic'
  const borderManaged = form.service_type==='managed' && (!editing || !!editing.managed_transport)
  const structuredManaged = borderManaged || domestic
  const arrangement = form.service_type==='arrangement'
  const driverPaysCommission = editing ? !!editing.commission_driver_id : form.service_type === 'arrangement'
  const departureDate = borderManaged ? form.booking_date : form.departure_date || form.booking_date
  const arrivalDate = borderManaged ? form.booking_date : form.arrival_date || departureDate
  const handoffDate = form.handoff_date || departureDate
  const canBookForBranch = !branchManager || branches.some(branch => branch.id === profile.branch_id && !branch.archived_at)
  const belongsToBookingBranch = row => row.branch_id == null || row.branch_id === form.branch_id
  const availableVehiclesFor = (endDate, exclude) => vehicles.filter(row => belongsToBookingBranch(row) &&
    row.id !== exclude && !row.archived_at && row.status === 'available' &&
    (!row.owner_id || row.vehicle_owners && !row.vehicle_owners.archived_at) && (!row.permit_expiry || row.permit_expiry >= endDate))
  const availableDriversFor = (endDate, exclude) => drivers.filter(row => belongsToBookingBranch(row) &&
    row.id !== exclude && !row.archived_at && row.status === 'available' && (!row.license_expiry || row.license_expiry >= endDate))
  const availableVehicles = availableVehiclesFor(withHandoff&&!structuredManaged ? handoffDate : arrivalDate)
  const availableDrivers = availableDriversFor(withHandoff&&!structuredManaged ? handoffDate : arrivalDate)
  const onwardVehicles = withHandoff ? availableVehiclesFor(arrivalDate, form.vehicle_id) : []
  const onwardDrivers = withHandoff ? availableDriversFor(arrivalDate, form.driver_id) : []
  const sender = form.sender_is_trader ? { sender_name: `${form.trader_first_name} ${form.trader_last_name}`.trim(), sender_phone: form.trader_phone, sender_address: form.trader_address } : { sender_name: form.sender_name, sender_phone: form.sender_phone, sender_address: form.sender_address }
  const receiver = form.receiver_is_trader ? { receiver_name: `${form.trader_first_name} ${form.trader_last_name}`.trim(), receiver_phone: form.trader_phone, receiver_address: form.trader_address } : { receiver_name: form.receiver_name, receiver_phone: form.receiver_phone, receiver_address: form.receiver_address }
  const quantityText = row => row.quantity_amount ? `${row.quantity_amount} ${{tons:'ټن',pieces:'عدد',m3:'متر مکعب'}[row.quantity_unit]||''}` : row.weight_tons ? `${row.weight_tons} ټن` : row.volume_m3 ? `${row.volume_m3} متر مکعب` : row.quantity||'—'
  const money = (amount,currency) => `${Number(amount||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})} ${currency||'AFN'}`
  const field = (key, en, fa, { type = 'text', required = true, value = form[key], disabled = false, minDate, maxDate, maxLength } = {}) => { const finance=['commission_amount','freight_amount','carrier_cost'].includes(key); return <label><span>{t(en,fa)}{required ? ' *' : ''}</span>{type === 'date' ? <SolarHijriDateInput required={required} disabled={disabled} language={language} value={value ?? ''} min={minDate} max={maxDate} onChange={value => setForm(current => ({ ...current, [key]: value }))} ariaLabel={t(en,fa)} /> : <input type={type} required={required} disabled={disabled} maxLength={maxLength} min={type === 'number' ? (finance ? key==='commission_amount'?'0.01':'0' : '0.001') : undefined} step={type === 'number' ? finance?'0.01':'0.001' : undefined} value={value ?? ''} onChange={e => setForm(current => ({ ...current, [key]: e.target.value }))} />}</label> }
  const borderField=(key,en,fa,{required=false,maxLength=100,type='text',wide=false}={})=><label className={wide?'wide':undefined}>
    <span>{t(en,fa)}{required?' *':''}</span>
    <input type={type} required={required} maxLength={maxLength} value={border[key]}
      onChange={event=>setBorder(current=>({...current,[key]:event.target.value}))}/>
  </label>
  function fleetSelect(key, rows, en, fa, display) {
    const selected = form[key]
    return <label><span>{t(en,fa)} *</span>
      <select required value={selected} onChange={e=>setForm(current=>({...current,[key]:e.target.value}))}>
        <option value="">—</option>
        {selected && !rows.some(row=>row.id===selected) && <option disabled value={selected}>{t('Choose another','انتخاب دوباره')}</option>}
        {rows.map(row=><option key={row.id} value={row.id}>{display(row)}</option>)}
      </select>
    </label>
  }
  function chooseTrader(id) {
    const trader = traders.find(r => r.id === id)
    setForm(current => ({ ...current, trader_id: id, trader_first_name: trader?.first_name || trader?.full_name || '', trader_last_name: trader?.last_name || '', trader_phone: trader?.phone || '', trader_address: trader?.address || '' }))
  }
  async function submit(e) {
    e.preventDefault()
    if (busy) return
    if (departureDate < form.booking_date || arrivalDate < departureDate) { setMessage(explain(new Error('INVALID_DATES'), language)); return }
    if (withHandoff && !structuredManaged && (!form.handoff_location.trim() || handoffDate < departureDate || handoffDate > arrivalDate ||
      !onwardVehicles.some(row=>row.id===form.onward_vehicle_id) || !onwardDrivers.some(row=>row.id===form.onward_driver_id))) {
      setMessage(explain(new Error('INVALID_HANDOFF'), language)); return
    }
    if (!availableVehicles.some(row=>row.id===form.vehicle_id) || !availableDrivers.some(row=>row.id===form.driver_id)) {
      setMessage(t('Choose an available vehicle and driver for this branch and date.','واسطه و راننده در دسترس برای این شعبه و تاریخ را انتخاب کنید.'))
      return
    }
    if (!form.quantity_amount || Number(form.quantity_amount)<=0) { setMessage(t('Enter a positive goods amount.','مقدار بار را بیشتر از صفر وارد کنید.')); return }
    if (!structuredManaged && (!form.commission_amount || Number(form.commission_amount)<=0)) { setMessage(t('Enter the commission amount.','مقدار کمیسیون را وارد کنید.')); return }
    if (Number(form.received_now||0)<0 || Number(form.received_now||0)>bookingTotal(form)/100) { setMessage(t('Amount received now must not exceed the total owed.','مبلغ دریافتی فعلی نباید از مجموع بدهی بیشتر باشد.')); return }
    setBusy(true); setMessage('')
    try {
      const payload = Object.fromEntries(Object.entries({
        ...form,
        ...(form.service_type==='managed' ? sender : {sender_is_trader:false,sender_name:'',sender_phone:'',sender_address:''}),
        ...(arrangement ? {receiver_is_trader:false,receiver_name:'',receiver_phone:'',receiver_address:''} : receiver),
        ...(arrangement || domestic ? {freight_amount:'',carrier_cost:'',other_expenses:[]} : {}),
      }).map(([k,v]) => [k, typeof v === 'string' ? v.trim() : v]))
      payload.branch_id=payload.branch_id||null
      payload.departure_date=departureDate
      payload.arrival_date=arrivalDate
      Object.assign(payload, !structuredManaged && withHandoff ? {handoff_date:handoffDate} :
        {handoff_date:null,handoff_location:null,onward_vehicle_id:null,onward_driver_id:null})
      if (structuredManaged) {
        if (borderManaged) payload.managed_border=border
        payload.managed_charges=managedCharges.filter(row=>String(row.amount).trim()!=='')
          .map(({key,amount,currency,description})=>({key,amount,currency,description}))
      }
      const key=JSON.stringify(payload);if(request.current?.key!==key)request.current={key,id:crypto.randomUUID()}
      const id=await rpc('save_booking_record',{p_id:editing?.id||null,p_request:request.current.id,p_data:payload,p_expected:editing?.updated_at||null})
      if (Number(payload.received_now)>0) window.dispatchEvent(new Event('pedram:cashbook-changed'))
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
      <button type="button" className="registry-primary booking-add" disabled={!ready||!canBookForBranch} onClick={() => { setEditing(null);setWithHandoff(false);request.current=null;setBorder(blankBorder);setManagedCharges(managedDefaults('managed'));setForm({ ...blank, branch_id:branchManager?profile.branch_id:'',booking_date: today() }); setMessage(''); setOpen(true) }}><Plus size={18} aria-hidden="true" />{t('New booking','بار نامه جدید')}</button>
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
    {(overviewStatus || targetBooking) && <div className="booking-attention-filter">
      <strong>{targetBooking ? t('Selected booking','بارنامه انتخاب‌شده') : overviewStatus==='confirmed' ? t('Waiting to start','منتظر حرکت') : t('On the road','در راه')} · {visibleRows.length}</strong>
      <a href={withRecordReturn('#/bookings',destination.get('return'))}>{t('Show all bookings','نمایش همه بارنامه‌ها')}</a>
    </div>}
    {attention && <div className="booking-attention-filter">
      <strong>{t(...bookingAttention[attention])}{ready && <> · <bdi>{visibleRows.length}</bdi></>}</strong>
      <button type="button" className="registry-secondary" onClick={onClearAttention}>{t('Clear attention filter','پاک‌کردن فیلتر بررسی')}</button>
    </div>}
    {branchManager&&(!profile.branch_id||(ready&&!canBookForBranch))&&<p role="alert" className="registry-notice error">{t('Your account needs an active branch assignment before you can book. Ask the President to check the branch manager account.','برای ثبت بوکینگ حساب شما باید به شعبه فعال وصل باشد. از رئیس بخواهید حساب مدیر شعبه را بررسی کند.')}</p>}
    {message && !open && !detail && !handoffRow && <div role="alert" className="registry-notice error">{message}</div>}
    {bookingSelection.controls}
    {!ready && !message && <p className="booking-list-loading" role="status">{t('Loading bookings…','در حال بارگیری بار نامه‌ها…')}</p>}
    <div className="booking-list">{visibleRows.map(r => {
      const awaitingHandoff = r.status==='in_transit' && r.handoff_date && !r.handoff_confirmed_at
      const report = driverReportForCurrentLeg(r)
      return <article className="booking-record" data-status={r.status} key={r.id}>
      <header className="booking-card-header">
        <div className="booking-card-identity">
          {bookingSelection.checkbox(r)}
          <span className="booking-card-reference"><ClipboardList size={16} aria-hidden="true" /><bdi>#{r.booking_number}</bdi></span>
        </div>
        <h3><bdi>{r.trader_first_name ? `${r.trader_first_name} ${r.trader_last_name || ''}` : r.traders?.full_name || '—'}</bdi></h3>
        <span className={`status-pill ${r.status}`}>{statuses[r.status]}</span>
      </header>
      <div className="booking-card-body">
      {!r.archived_at&&['confirmed','in_transit'].includes(r.status)&&(report.delivered?<p className="driver-booking-report"><CheckCheck size={20}/>{awaitingHandoff ? t('Driver reported arrival at the transfer point','راننده رسیدن به محل انتقال را گزارش داد') : t('Driver reported delivery · confirm completion','راننده تحویل بار را گزارش داد · تکمیل سفر را تأیید کنید')}</p>:report.accepted?<p className="driver-booking-report"><BadgeCheck size={20}/>{t('Driver accepted','راننده برنامه را پذیرفت')}</p>:null)}
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
            {r.departure_date && (r.departure_date !== r.booking_date || r.arrival_date !== r.departure_date) &&
              <dd>{t('Trip','سفر')} · <bdi dir="ltr">{formatSolarHijri(r.departure_date)} – {formatSolarHijri(r.arrival_date || r.departure_date)}</bdi></dd>}
            <dd>{t(...bookingTypeLabels[r.service_type])}</dd>
            {president && (r.managed_transport
              ? (r.managed_transport.balances??[]).map(balance=><dd key={balance.currency} className="booking-card-balance">{t('Trader owes','بدهی تاجر')} · <bdi dir="ltr">{money(bookingDue(balance.charged,balance.paid)/100,balance.currency)}</bdi></dd>)
              : <dd className="booking-card-balance">{r.commission_driver_id ? t('Driver owes','بدهی راننده') : t('Trader owes','بدهی تاجر')} · <bdi dir="ltr">{money(bookingDue(r.charged,r.paid)/100,r.commission_currency)}</bdi></dd>)}
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
        {r.handoff_date && <p className="booking-handoff-note"><ArrowLeftRight size={16} aria-hidden="true" />
          <span><strong>{r.handoff_confirmed_at ? t('Handoff confirmed','انتقال تأیید شد') : r.status === 'cancelled' ? t('Planned handoff','انتقال برنامه‌ریزی‌شده') : t('Truck handoff','انتقال بار')}</strong>
            {' · '}<bdi>{r.handoff_location}</bdi>{' · '}<bdi dir="ltr">{formatSolarHijri(r.handoff_confirmed_at ? kabulISODate(new Date(r.handoff_confirmed_at)) : r.handoff_date)}</bdi>
            <small><bdi>{r.onward_vehicle?.plate_number || '—'}</bdi>{' · '}<bdi>{r.onward_driver?.full_name || '—'}</bdi></small>
          </span>
        </p>}
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
          {awaitingHandoff && <button type="button" className="registry-secondary booking-handoff-action" disabled={busy} onClick={()=>{setMessage('');setHandoffRow(r)}}><ArrowLeftRight size={17} aria-hidden="true" />{t('Confirm handoff','تأیید انتقال')}</button>}
          {r.status==='in_transit' && !awaitingHandoff && <IconButton icon={CheckCircle2} className="booking-journey" disabled={busy} label={t('Complete journey','تکمیل سفر')} onClick={()=>changeStatus(r,'completed')}/>}
          {['confirmed','in_transit'].includes(r.status) && <IconButton icon={XCircle} className="booking-cancel" disabled={busy} label={t('Cancel booking','لغو بوکینگ')} onClick={()=>{setMessage('');setCancelRow(r)}}/>}
          {president && (r.commission_driver_id || r.trader_id) && (r.managed_transport ? payableBalances(r).length>0 : bookingDue(r.charged,r.paid)>0) && <button type="button" className="registry-secondary booking-payment" disabled={busy} onClick={()=>openPayment(r)}>{r.commission_driver_id ? t('Receive driver commission','دریافت کمیسیون راننده') : t('Receive payment','دریافت پول')}</button>}
        </>}
      </div>
    </article>})}</div>
    {ready && !visibleRows.length && <div className="registry-empty"><ClipboardList size={32} />{rows.length?t('No bookings match these filters.','هیچ بوکینگی با این فیلترها مطابقت ندارد.'):t('No bookings registered yet.','هنوز بوکینگ ثبت نشده است.')}</div>}
    {open && <Modal title={editing?t('Edit booking','ویرایش بوکینگ'):t('New booking','بوکینگ جدید')}
      busy={busy} onClose={() => setOpen(false)} className="registration-form-card booking-form-card">
      <form className="registration-form booking-form" onSubmit={submit}><fieldset disabled={busy} className="registration-fieldset">
        <RegistrationSection kind="booking" tone="blue" title={arrangement ? t('Trip dates','تاریخ‌های سفر') : t('Booking','بار نامه')} icon={CalendarDays}>{field('booking_date','Booking date','تاریخ ثبت',{type:'date'})}
        {!branchManager&&<label><span>{t('Branch','شعبه')}</span><select disabled={!!editing} value={form.branch_id||''} onChange={event=>setForm(current=>({
          ...current,branch_id:event.target.value,vehicle_id:'',driver_id:'',onward_vehicle_id:'',onward_driver_id:'',
          ...(current.trader_id?{trader_id:'',trader_first_name:'',trader_last_name:'',trader_phone:'',trader_address:''}:{}),
        }))}><option value="">{t('Head office','دفتر مرکزی')}</option>{branches.filter(b=>!b.archived_at||b.id===form.branch_id).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>}
        <label><span>{t('Booking type','نوع بوکینگ')}</span><select disabled={!!editing?.commission_amount||!!editing?.managed_transport} value={form.service_type} onChange={e => {
          const type=e.target.value
          if(type!=='arrangement')setWithHandoff(false)
          setManagedCharges(managedDefaults(type))
          setForm({...form,service_type:type,received_now:''})
        }}>
          {Object.entries(bookingTypeLabels).map(([type,label])=><option key={type} value={type}>{t(...label)}</option>)}
        </select></label>
        {(arrangement||domestic)&&<div className="wide booking-trip-dates">
          {field('departure_date','Departure date','تاریخ حرکت',{type:'date',value:departureDate,minDate:form.booking_date})}
          {field('arrival_date','Arrival date','تاریخ رسیدن',{type:'date',value:arrivalDate,minDate:departureDate})}
        </div>}
        </RegistrationSection>
        <RegistrationSection kind="trader" tone="teal" title={t('Trader information','مشخصات تاجر')} icon={UserRound}>
        <label className="wide"><span>{t('Select an existing trader or enter a new trader below','تاجر ثبت‌شده را انتخاب کنید یا مشخصات تاجر جدید را وارد کنید')}</span><select value={form.trader_id} onChange={e => chooseTrader(e.target.value)}><option value="">{t('New trader','تاجر جدید')}</option>{traders.filter(r=>!r.archived_at&&belongsToBookingBranch(r)).map(r => <option key={r.id} value={r.id}>{r.full_name} · {r.phone}</option>)}</select></label>
        {field('trader_first_name','First name','نام')}{field('trader_last_name','Last name / surname','تخلص',{required:false})}{field('trader_phone','Contact number','شماره تماس',{type:'tel'})}{field('trader_address','Address','آدرس')}
        </RegistrationSection>
        {form.service_type==='managed'&&<RegistrationSection kind="sender" tone="blue" title={t('Sender information','مشخصات فرستنده')} icon={Send}>
        <label className="wide registry-check"><input type="checkbox" checked={form.sender_is_trader} onChange={e => setForm({ ...form, sender_is_trader: e.target.checked })} /><span>{t('Trader is the sender','تاجر فرستنده است')}</span></label>
        {field('sender_name','Full name (with surname)','نام و تخلص',{value:sender.sender_name,disabled:form.sender_is_trader})}{field('sender_phone','Phone','موبایل',{type:'tel',value:sender.sender_phone,disabled:form.sender_is_trader})}{field('sender_address','Address','آدرس',{value:sender.sender_address,disabled:form.sender_is_trader})}
        </RegistrationSection>}
        {!arrangement&&<RegistrationSection kind="receiver" tone="purple" title={t('Receiver information','مشخصات گیرنده')} icon={Users}><label className="wide registry-check"><input type="checkbox" checked={form.receiver_is_trader} onChange={e=>setForm({...form,receiver_is_trader:e.target.checked})}/><span>{t('Trader is the receiver','تاجر گیرنده است')}</span></label>{field('receiver_name','Full name (with surname)','نام و تخلص',{value:receiver.receiver_name,disabled:form.receiver_is_trader})}{field('receiver_phone','Contact number','شماره تماس',{type:'tel',value:receiver.receiver_phone,disabled:form.receiver_is_trader})}{field('receiver_address','Address','آدرس',{value:receiver.receiver_address,disabled:form.receiver_is_trader})}</RegistrationSection>}
        <RegistrationSection kind="goods" tone="amber" title={t('Goods information','مشخصات بار')} icon={Package}>
          <div className="wide">{field('goods','Goods name','نام بار')}</div>
          {field('quantity_amount','Goods quantity','مقدار بار',{type:'number'})}
          <label>
            <span>{t('Unit','واحد')}</span>
            <select value={form.quantity_unit} onChange={event=>setForm(current=>({...current,quantity_unit:event.target.value}))}>
              <option value="tons">{t('Tons','تن')}</option>
              <option value="pieces">{t('Pieces','عدد')}</option>
              <option value="m3">{t('Cubic metres','متر مکعب')}</option>
            </select>
          </label>
        </RegistrationSection>
        <RegistrationSection kind="route" tone="blue" title={t('Route','مسیر')} icon={MapPin}>{field('origin','Origin location','محل مبدأ')}{field('destination','Destination location','محل مقصد')}
        {borderManaged && borderField('border_location','Border handover location','محل تحویل در مرز',{required:true,maxLength:200,wide:true})}
        {arrangement&&<label className="wide registry-check booking-handoff-toggle"><input type="checkbox" checked={withHandoff} onChange={e=>setWithHandoff(e.target.checked)} /><span>{t('Transfer the cargo to a second truck','انتقال بار به واسطهٔ دوم')}</span></label>}
        {arrangement&&withHandoff && <>
          {field('handoff_location','Transfer location','محل انتقال',{maxLength:200})}
          {field('handoff_date','Transfer date','تاریخ انتقال',{type:'date',value:handoffDate,minDate:departureDate,maxDate:arrivalDate})}
        </>}
        </RegistrationSection>
        {borderManaged&&<RegistrationSection kind="foreign-vehicle" tone="blue" title={t('Foreign vehicle details','مشخصات موتر خارجی')} icon={Truck}>
          {borderField('foreign_driver','Driver name','نام راننده',{maxLength:200,wide:true})}
          {borderField('foreign_mobile','Mobile','موبایل',{type:'tel',maxLength:80})}
          {borderField('foreign_plate','Plate number','نمبر پلیت')}
        </RegistrationSection>}
        {!structuredManaged&&<RegistrationSection kind="finance" tone="purple" title={t('Booking finance','کمیسیون بوکینگ')} icon={Package}><label><span>{t('Currency for all booking amounts','واحد پول همه مبالغ بوکینگ')}</span><select disabled={!!editing?.commission_amount} value={form.commission_currency} onChange={e=>setForm({...form,commission_currency:e.target.value})}>{currencies.map(c=><option key={c}>{c}</option>)}</select></label>{field('commission_amount','Commission amount','مقدار کمیسیون',{type:'number',disabled:!!editing?.commission_amount})}
        {form.service_type==='managed'&&<>{field('freight_amount','Freight owed by trader','کرایه بار قابل پرداخت توسط تاجر',{type:'number'})}{field('carrier_cost','Vehicle / driver cost owed by trader','مصارف واسطه و راننده قابل پرداخت توسط تاجر',{type:'number'})}<h3 className="booking-section-heading">{t('More expenses owed by trader','مصارف بیشتر قابل پرداخت توسط تاجر')}</h3>{form.other_expenses.map((expense,index)=><div className="wide booking-preview" key={index}><label><span>{t('Expense','مصرف')}</span><input required value={expense.description} onChange={e=>setForm(current=>({...current,other_expenses:current.other_expenses.map((x,i)=>i===index?{...x,description:e.target.value}:x)}))}/></label><label><span>{t('Amount','مقدار')}</span><input required type="number" min="0.01" step="0.01" value={expense.amount} onChange={e=>setForm(current=>({...current,other_expenses:current.other_expenses.map((x,i)=>i===index?{...x,amount:e.target.value}:x)}))}/></label><button type="button" onClick={()=>setForm(current=>({...current,other_expenses:current.other_expenses.filter((_,i)=>i!==index)}))}>{t('Remove','حذف')}</button></div>)}<button type="button" className="registry-secondary" onClick={()=>setForm(current=>({...current,other_expenses:[...current.other_expenses,{description:'',amount:''}]}))}>{t('Add expense','افزودن مصرف')}</button></>}
        <p className="wide booking-help">{driverPaysCommission ? t('Driver commission','کمیسیون راننده') : t('Total owed by trader','مجموع بدهی تاجر')}: <strong>{money(bookingTotal(form)/100,form.commission_currency)}</strong>{driverPaysCommission && <small> · {driver?.full_name || (withHandoff ? t('First driver','رانندهٔ اول') : t('Assigned driver','راننده تعیین‌شده'))}</small>}</p>
        {president&&!editing&&<label><span>{driverPaysCommission ? t('Received from driver (optional)','دریافت از راننده (اختیاری)') : t('Received now (optional)','دریافت فعلی (اختیاری)')}</span><input type="number" min="0" max={bookingTotal(form)/100} step="0.01" value={form.received_now} onChange={e=>setForm(current=>({...current,received_now:e.target.value}))}/><small>{driverPaysCommission ? t('Record only the amount received. Enter later payments in Bookings or Cashbook.','فقط مبلغ دریافت‌شده را ثبت کنید. پرداخت بعدی را در بار نامه‌ها یا روزنامچه ثبت کنید.') : t('Only this received amount is added to Cashbook Money In. Record later payments from Bookings or the trader account.','فقط مبلغ دریافت‌شده در پول آمد روزنامچه ثبت می‌شود. پرداخت بعدی را از بوکینگ‌ها یا حساب تاجر ثبت کنید.')}</small></label>}
        </RegistrationSection>}
        <RegistrationSection kind="fleet" tone="teal" title={borderManaged ? t('Afghan vehicle and driver','موتر و رانندهٔ افغانی') : withHandoff ? t('First leg','مرحلهٔ اول') : t('Vehicle and driver','واسطه و راننده')} icon={Truck}>
        {(!availableVehicles.length||!availableDrivers.length)&&<p className="wide booking-help" role="status">
          {!availableVehicles.length&&t('No eligible vehicle. Check its availability, permit, and active owner in Fleet. ','واسطه واجد شرایط نیست. دسترسی، جواز و مالک فعال آن را در وسایط بررسی کنید. ')}
          {!availableDrivers.length&&t('No eligible driver. Check driver availability and licence in Fleet. ','راننده واجد شرایط نیست. دسترسی و لایسنس راننده را در وسایط بررسی کنید. ')}
          {branchManager&&t('Use branch fleet or ask the President to assign or share the missing record.','از وسایط شعبه استفاده کنید یا از رئیس بخواهید ریکارد لازم را اختصاص دهد یا شریک کند.')}
        </p>}
        {fleetSelect('vehicle_id',availableVehicles,'Registered vehicle','واسطه ثبت‌شده',v=>`${v.plate_number} · ${v.vehicle_type}`)}
        {fleetSelect('driver_id',availableDrivers,'Registered driver','راننده ثبت‌شده',d=>`${d.full_name} · ${d.phone}`)}
        {borderManaged&&borderField('afghan_waybill','Afghan waybill number','نمبر بارنامهٔ موتر افغانی',{wide:true})}
        {vehicle && <dl className="booking-preview"><dt>{domestic ? t('Plate number','نمبر پلیت') : t('Plate / foreign plate','پلیت / پلیت خارجی')}</dt><dd>{vehicle.plate_number}{!domestic && (' / '+(vehicle.foreign_plate_number || '—'))}</dd><dt>{t('Type / color','نوع / رنگ')}</dt><dd>{vehicle.vehicle_type} / {vehicle.color || '—'}</dd><dt>{t('VIN','نمبر شاسی')}</dt><dd>{vehicle.vin_number || '—'}</dd><dt>{t('Owner','مالک')}</dt><dd>{vehicle.vehicle_owners?.full_name || '—'} · {vehicle.vehicle_owners?.phone || '—'}</dd><dt>{t('Permit expiry','تاریخ ختم جواز')}</dt><dd>{formatSolarHijri(vehicle.permit_expiry)}</dd></dl>}
        {driver && <dl className="booking-preview"><dt>{t('Driver','راننده')}</dt><dd>{driver.full_name}</dd><dt>{t('Father name','نام پدر')}</dt><dd>{driver.father_name || '—'}</dd><dt>{t('Contact','تماس')}</dt><dd>{driver.phone}</dd><dt>{t('Address','آدرس')}</dt><dd>{driver.address || '—'}</dd>{president && driver.license_number && <><dt>{t('Licence number','نمبر لایسنس')}</dt><dd>{driver.license_number}</dd></>}</dl>}
        {(driver&&!driver.user_id || withHandoff && onwardDrivers.some(d=>d.id===form.onward_driver_id&&!d.user_id))&&<p className="wide booking-help">{t('Link each driver’s login using the key icon in Fleet → Drivers to show the assignment in their portal.','برای نمایش برنامه در درگاه راننده، حساب هر راننده را با آیکن کلید در بخش وسایط ← رانندگان وصل کنید.')}</p>}
        <p className="wide booking-help">{t('Register missing vehicles and drivers in Fleet first. Trader details are saved with this booking; existing trader profiles are not overwritten.','وسایط و رانندگان جدید را ابتدا در بخش وسایط ثبت کنید. مشخصات تاجر با این بوکینگ ذخیره می‌شود؛ مشخصات قبلی تاجر تغییر نمی‌کند.')}</p>
        </RegistrationSection>
        {structuredManaged&&<RegistrationSection kind="finance" tone="purple" title={t('Booking finance',domestic ? 'مصارف بار نامه' : 'کمیسیون بوکینگ')} icon={Package}>
          <ManagedBookingCharges charges={managedCharges} setCharges={setManagedCharges} language={language}/>
        </RegistrationSection>}
        {withHandoff && <RegistrationSection kind="onward" tone="purple" title={t('Second leg','مرحلهٔ دوم')} icon={ArrowLeftRight}>
          {fleetSelect('onward_vehicle_id',onwardVehicles,'Second vehicle','واسطهٔ دوم',v=>`${v.plate_number} · ${v.vehicle_type}`)}
          {fleetSelect('onward_driver_id',onwardDrivers,'Second driver','رانندهٔ دوم',d=>`${d.full_name} · ${d.phone}`)}
        </RegistrationSection>}
      </fieldset>
      {message && <div role="alert" className="wide registry-notice error">{message}</div>}
      <div className="registry-form-actions registration-actions"><button type="button" disabled={busy} onClick={() => setOpen(false)}>{t('Cancel','انصراف')}</button><button className="registry-primary" disabled={busy||!availableVehicles.length||!availableDrivers.length}>{busy ? t('Saving…','در حال ثبت…') : t('Save booking','ثبت بوکینگ')}</button></div></form>
    </Modal>}
    {deletion&&<ConfirmArchive language={language} busy={busy} error={message} restore={!!deletion.archived_at} onClose={()=>setDeletion(null)} onConfirm={async()=>{setBusy(true);try{await rpc('archive_booking_record',{p_id:deletion.id,p_archived:!deletion.archived_at,p_expected:deletion.updated_at});setDeletion(null);await load()}catch(e){setMessage(explain(e,language))}finally{setBusy(false)}}}/>}
    {bookingSelection.dialog}
    {paymentRow&&<Modal title={`${paymentRow.commission_driver_id ? t('Receive driver commission','دریافت کمیسیون راننده') : t('Receive payment for booking','دریافت پول بوکینگ')} #${paymentRow.booking_number}`}
      busy={busy} onClose={()=>setPaymentRow(null)}>
      <form className="registry-form" onSubmit={savePayment}>
        {paymentRow.commission_driver_id&&<p className="wide booking-help">{t('Driver','راننده')}: <strong>{drivers.find(driver=>driver.id===paymentRow.commission_driver_id)?.full_name || paymentRow.drivers?.full_name}</strong></p>}
        <p className="wide booking-help">{t('Remaining owed','باقی‌مانده قابل پرداخت')}: <strong>{money(paymentDue/100,paymentForm.currency)}</strong></p>
        <fieldset disabled={busy} className="booking-fields wide">
          {paymentRow.managed_transport&&<label>
            <span>{t('Payment currency','واحد پول پرداخت')}</span>
            <select value={paymentForm.currency} onChange={event=>setPaymentForm(current=>({...current,currency:event.target.value,amount:''}))}>
              {payableBalances(paymentRow).map(row=><option key={row.currency}>{row.currency}</option>)}
            </select>
          </label>}
          <label><span>{t('Amount received','مبلغ دریافت‌شده')} ({paymentForm.currency}) *</span>
            <input required type="number" min="0.01" max={paymentDue/100} step="0.01" value={paymentForm.amount}
              onChange={e=>setPaymentForm(current=>({...current,amount:e.target.value}))}/>
          </label>
          <label><span>{t('Payment date','تاریخ دریافت')} *</span>
            <SolarHijriDateInput required max={kabulToday()} language={language} value={paymentForm.date}
              onChange={date=>setPaymentForm(current=>({...current,date}))} ariaLabel={t('Payment date','تاریخ دریافت')}/>
          </label>
        </fieldset>
        {paymentError&&<p className="wide registry-notice error" role="alert">{paymentError}</p>}
        <div className="registry-form-actions">
          <button type="button" disabled={busy} onClick={()=>setPaymentRow(null)}>{t('Cancel','انصراف')}</button>
          <button className="registry-primary" disabled={busy}>{t('Save payment','ثبت پرداخت')}</button>
        </div>
      </form>
    </Modal>}
    {expense&&<Modal title={t('Mark expense as paid','ثبت تادیهٔ مصرف')} busy={busy} onClose={()=>setExpense(null)}>
      <form className="registry-form" onSubmit={payExpense}>
        <p className="wide booking-help">{managedChargeLabel(expense.charge,language)} · <strong><bdi>{money(expense.charge.amount,expense.charge.currency)}</bdi></strong></p>
        <fieldset disabled={busy} className="booking-fields wide">
          {president ? <label><span>{t('Paying account','حساب پرداخت‌کننده')}</span>
            <select value={expense.account} onChange={event=>setExpense(current=>({...current,account:event.target.value}))}>
              <option value="">{t('Head office','دفتر مرکزی')}</option>
              {branches.filter(branch=>!branch.archived_at).map(branch=><option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </label> : <p>{t('Paying account','حساب پرداخت‌کننده')}: <strong>{branches.find(branch=>branch.id===expense.account)?.name}</strong></p>}
          <label><span>{t('Expense payment date','تاریخ تادیهٔ مصرف')} *</span>
            <SolarHijriDateInput required max={kabulToday()} language={language} value={expense.date}
              onChange={date=>setExpense(current=>({...current,date}))} ariaLabel={t('Expense payment date','تاریخ تادیهٔ مصرف')}/>
          </label>
        </fieldset>
        <p className="wide booking-help">{t('Saving records this expense in Cashbook Money Out.','با ثبت تادیه، مصرف در پول رفت روزنامچه ثبت می‌شود.')}</p>
        {expenseError&&<p className="wide registry-notice error" role="alert">{expenseError}</p>}
        <div className="registry-form-actions">
          <button type="button" disabled={busy} onClick={()=>setExpense(null)}>{t('Cancel','انصراف')}</button>
          <button className="registry-primary" disabled={busy}>{t('Save expense payment','ثبت تادیه')}</button>
        </div>
      </form>
    </Modal>}
    {cancelRow&&<Modal title={t('Cancel booking','لغو بوکینگ')} onClose={()=>setCancelRow(null)} busy={busy}><div className="record-modal-body"><p>{t('Cancel this booking and release its vehicle and driver?','این بوکینگ لغو و واسطه و راننده آزاد شوند؟')}</p>{message&&<p role="alert" className="registry-notice error">{message}</p>}<button className="registry-primary" disabled={busy} onClick={()=>changeStatus(cancelRow,'cancelled')}>{t('Cancel booking','لغو بوکینگ')}</button></div></Modal>}
    {handoffRow && <Modal title={t('Confirm truck handoff','تأیید انتقال بار')} onClose={()=>setHandoffRow(null)} busy={busy}>
      <div className="record-modal-body">
        <p>{t('Has the cargo been transferred to the second truck? Confirming completes the first leg and starts the second.', 'آیا بار به واسطهٔ دوم منتقل شده است؟ با تأیید، مرحلهٔ اول تکمیل و مرحلهٔ دوم آغاز می‌شود.')}</p>
        <p className="booking-handoff-note"><bdi>{handoffRow.handoff_location}</bdi>{' · '}<bdi>{handoffRow.onward_vehicle?.plate_number || '—'}</bdi></p>
        {message && <p role="alert" className="registry-notice error">{message}</p>}
        <button type="button" className="registry-primary" disabled={busy} onClick={()=>changeStatus(handoffRow,'handoff')}>{t('Confirm handoff','تأیید انتقال')}</button>
      </div>
    </Modal>}
    {detail && !expense && <Modal className="booking-detail-card" title={`${t('Booking details','جزئیات بار نامه')} · \u2066#${detail.booking_number}\u2069`} onClose={()=>setDetail(null)}>
      <BookingInformation row={detail} language={language} president={president}
        vehicle={vehicles.find(row=>row.id===detail.vehicle_id)}
        driver={drivers.find(row=>row.id===detail.driver_id)}
        branch={branches.find(row=>row.id===detail.branch_id)}
        onPrint={()=>printBooking(detail)} onPayExpense={detail.managed_transport && detail.service_type==='managed' ? openExpense : undefined} message={message}/>
    </Modal>}
  </div>
}
