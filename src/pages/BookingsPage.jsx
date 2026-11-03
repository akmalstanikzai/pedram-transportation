import { useCallback, useEffect, useRef, useState } from 'react'
import { Archive, BadgeCheck, Building2, CalendarDays, CheckCheck, CheckCircle2, ClipboardList, MapPin, Package, Play, Plus, RefreshCw, Search, Send, Truck, UserRound, Users, X, XCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { allRows } from '../lib/cashbook'
import { bookingColumns, rpc, explain } from '../lib/operations'
import { ConfirmArchive, IconButton, Modal, RecordTools } from '../components/RecordTools'

const blank = { booking_date: '', departure_date:'', arrival_date:'',branch_id:'', trader_id: '', trader_first_name: '', trader_last_name: '', trader_phone: '', trader_address: '', sender_is_trader: false, sender_name: '', sender_phone: '', sender_address: '', receiver_name: '', receiver_phone: '', receiver_address: '', goods: '', weight_tons: '', volume_m3: '', origin: '', destination: '', vehicle_id: '', driver_id: '', service_type: 'arrangement' }
const selection = `${bookingColumns}, traders(full_name,phone), vehicles(plate_number), drivers(full_name)`
function today() {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Kabul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const get = type => parts.find(p => p.type === type).value
  return `${get('year')}-${get('month')}-${get('day')}`
}

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
  const [branches,setBranches]=useState([]),[editing,setEditing]=useState(null),[archived,setArchived]=useState(false),[deletion,setDeletion]=useState(null),[detail,setDetail]=useState(null),[cancelRow,setCancelRow]=useState(null)
  const request=useRef(null)
  const load=useCallback(async()=>{const [bookings,traders,vehicles,drivers,branches]=await Promise.all([allRows(supabase,'bookings',selection),allRows(supabase,'traders'),allRows(supabase,'vehicles','*, vehicle_owners(full_name,phone)'),allRows(supabase,'drivers'),allRows(supabase,'branches')]);setRows(bookings.sort((a,b)=>b.created_at.localeCompare(a.created_at)));setTraders(traders);setVehicles(vehicles);setDrivers(drivers);setBranches(branches);setReady(true)},[])
  useEffect(()=>{void Promise.resolve().then(load).catch(e=>setMessage(explain(e,language)))},[load,language])
  const refreshBookings=useCallback(async()=>{const bookings=await allRows(supabase,'bookings',selection);setRows(bookings.sort((a,b)=>b.created_at.localeCompare(a.created_at)))},[])
  useEffect(()=>{
    const update=()=>{if(!document.hidden&&!busy&&!open)void refreshBookings().catch(e=>setMessage(explain(e,language)))}
    const timer=window.setInterval(update,30000)
    window.addEventListener('focus',update)
    return()=>{clearInterval(timer);window.removeEventListener('focus',update)}
  },[refreshBookings,busy,open,language])
  const statuses={confirmed:t('Confirmed','تأییدشده'),in_transit:t('On road','در راه'),completed:t('Completed','تکمیل‌شده'),cancelled:t('Cancelled','لغوشده')}
  const visibleRows=rows.filter(r=>!!r.archived_at===archived&&(!president||scope==='all'||(scope==='head-office'?!r.branch_id:r.branch_id===scope))&&`${r.booking_number} ${r.trader_first_name||r.traders?.full_name||''} ${r.trader_last_name||''} ${r.origin} ${r.destination}`.toLowerCase().includes(query.toLowerCase()))
  function edit(row){setEditing(row);request.current=null;setForm(Object.fromEntries(Object.keys(blank).map(key=>[key,row[key]??blank[key]])));setMessage('');setOpen(true)}
  async function changeStatus(row,status){if(busy)return;setBusy(true);setMessage('');try{await rpc('change_booking_status',{p_id:row.id,p_status:status,p_request:crypto.randomUUID(),p_expected:row.updated_at});setCancelRow(null);await load()}catch(e){setMessage(explain(e,language))}finally{setBusy(false)}}
  const vehicle = vehicles.find(v => v.id === form.vehicle_id)
  const driver = drivers.find(d => d.id === form.driver_id)
  const sender = form.sender_is_trader ? { sender_name: `${form.trader_first_name} ${form.trader_last_name}`.trim(), sender_phone: form.trader_phone, sender_address: form.trader_address } : { sender_name: form.sender_name, sender_phone: form.sender_phone, sender_address: form.sender_address }
  const field = (key, en, fa, { type = 'text', required = true, value = form[key], disabled = false } = {}) => <label><span>{t(en,fa)}{required ? ' *' : ''}</span><input type={type} required={required} disabled={disabled} min={type === 'number' ? '0.001' : undefined} step={type === 'number' ? '0.001' : undefined} value={value ?? ''} onChange={e => setForm(current => ({ ...current, [key]: e.target.value }))} /></label>
  const heading = (Icon, en, fa) => <h3 className="booking-section-heading"><Icon size={21} />{t(en,fa)}</h3>
  function chooseTrader(id) {
    const trader = traders.find(r => r.id === id)
    setForm(current => ({ ...current, trader_id: id, trader_first_name: trader?.first_name || trader?.full_name || '', trader_last_name: trader?.last_name || '', trader_phone: trader?.phone || '', trader_address: trader?.address || '' }))
  }
  async function submit(e) {
    e.preventDefault()
    if (busy) return
    if (!form.weight_tons && !form.volume_m3) { setMessage(t('Enter weight in tons, volume in m³, or both.', 'وزن به تن، حجم به متر مکعب یا هر دو را وارد کنید.')); return }
    setBusy(true); setMessage('')
    try {
      const payload = Object.fromEntries(Object.entries({ ...form, ...sender }).map(([k,v]) => [k, typeof v === 'string' ? v.trim() : v]))
      payload.branch_id=payload.branch_id||null
      const key=JSON.stringify(payload);if(request.current?.key!==key)request.current={key,id:crypto.randomUUID()}
      const id=await rpc('save_booking_record',{p_id:editing?.id||null,p_request:request.current.id,p_data:payload,p_expected:editing?.updated_at||null})
      const { data, error: readError } = await supabase.from('bookings').select(selection).eq('id',id).single()
      // Saving has committed; a list refresh failure must not invite duplicate submission.
      setOpen(false); setForm(blank)
      if (readError) setMessage(t('Booking saved. Reload the page to refresh the list.', 'بوکینگ ثبت شد. برای تازه‌سازی فهرست صفحه را دوباره باز کنید.'))
      else setRows(current => [data,...current.filter(r=>r.id!==data.id)])
      const { data: updated } = await supabase.from('traders').select('*').order('full_name')
      if (updated) setTraders(updated)
    } catch (error) { setMessage(explain(error,language)) }
    finally { setBusy(false) }
  }
  return <div className="registry-page">
    <div className="booking-page-header"><h1>{t('Bookings','بوکینگ‌ها')}</h1><div className="record-tools"><IconButton icon={RefreshCw} label={t('Refresh','تازه‌سازی')} disabled={busy} onClick={()=>{setMessage('');void refreshBookings().catch(e=>setMessage(explain(e,language)))}}/><button className="registry-primary" disabled={!ready||(branchManager&&!profile?.branch_id)} onClick={() => { setEditing(null);request.current=null;setForm({ ...blank, branch_id:branchManager?profile.branch_id:'',booking_date: today(),departure_date:today(),arrival_date:today() }); setMessage(''); setOpen(true) }}><Plus size={18} />{t('New booking','بوکینگ جدید')}</button></div></div>
    {president&&<div className="booking-branch-filter"><label><span><Building2 size={17}/>{t('Branch','شعبه')}</span><select value={scope} onChange={e=>setScope(e.target.value)}><option value="all">{t('All branches','تمام شعبات')}</option><option value="head-office">{t('Head office','دفتر مرکزی')}</option>{[...branches].sort((a,b)=>a.name.localeCompare(b.name)).map(branch=><option key={branch.id} value={branch.id}>{branch.name}{branch.archived_at?` · ${t('Archived','بایگانی‌شده')}`:''}</option>)}</select></label></div>}
    {message && !open && <div role="alert" className="registry-notice error">{message}</div>}
    <label className="registry-search"><Search size={17} /><input aria-label={t('Search bookings','جستجوی بوکینگ‌ها')} placeholder={t('Search booking, trader or route','جستجوی بوکینگ، تاجر یا مسیر')} value={query} onChange={e => setQuery(e.target.value)} /></label>
    <button className="registry-secondary" aria-pressed={archived} onClick={()=>setArchived(!archived)}><Archive size={18}/>{t('Archive','بایگانی')}</button>
    <div className="booking-list">{visibleRows.map(r => <article className="booking-record" key={r.id}>
      <h3><ClipboardList size={20} />#{r.booking_number} · {r.trader_first_name ? `${r.trader_first_name} ${r.trader_last_name || ''}` : r.traders?.full_name}</h3>
      <div className="booking-record-actions"><span className={`status-pill ${r.status}`}>{statuses[r.status]}</span><RecordTools language={language} disabled={busy} archived={r.archived_at} onView={()=>setDetail(r)} onEdit={r.status==='confirmed'?()=>edit(r):undefined} onArchive={()=>{setMessage('');setDeletion(r)}}/>{!r.archived_at&&<div className="record-tools">{r.status==='confirmed'&&<IconButton icon={Play} disabled={busy} label={t('Start journey','شروع سفر')} onClick={()=>changeStatus(r,'in_transit')}/>} {r.status==='in_transit'&&<IconButton icon={CheckCircle2} disabled={busy} label={t('Complete journey','تکمیل سفر')} onClick={()=>changeStatus(r,'completed')}/>} {['confirmed','in_transit'].includes(r.status)&&<IconButton icon={XCircle} disabled={busy} label={t('Cancel booking','لغو بوکینگ')} onClick={()=>{setMessage('');setCancelRow(r)}}/>}</div>}</div>
      {!r.archived_at&&['confirmed','in_transit'].includes(r.status)&&(r.driver_delivered_at?<p className="driver-booking-report"><CheckCheck size={20}/>{t('Driver reported delivery · confirm completion','راننده تحویل بار را گزارش داد · تکمیل سفر را تأیید کنید')}</p>:r.driver_accepted_at?<p className="driver-booking-report"><BadgeCheck size={20}/>{t('Driver accepted','راننده برنامه را پذیرفت')}</p>:null)}
      <p><strong>{t('Date','تاریخ')}:</strong> {r.booking_date || '—'} · {r.service_type === 'managed' ? t('Company-managed transport','انتقال توسط شرکت') : t('Vehicle arrangement','معرفی واسطه')}</p>
      <p>{r.origin} → {r.destination} · {r.goods}{r.weight_tons ? ` · ${r.weight_tons} ${t('tons','تن')}` : ''}{r.volume_m3 ? ` · ${r.volume_m3} m³` : ''}{!r.weight_tons && !r.volume_m3 && r.quantity ? ` · ${r.quantity}` : ''}</p>
      <p>{t('Sender','فرستنده')}: {r.sender_name || '—'} · {t('Receiver','گیرنده')}: {r.receiver_name || '—'}</p><p>{r.vehicles?.plate_number || '—'} · {r.drivers?.full_name || '—'}</p>
      <details className="booking-contact-details"><summary>{t('Contact details','مشخصات تماس')}</summary><dl className="booking-preview"><dt>{t('Trader contact / address','تماس / آدرس تاجر')}</dt><dd>{r.trader_phone || r.traders?.phone || '—'} · {r.trader_address || '—'}</dd><dt>{t('Sender contact / address','تماس / آدرس فرستنده')}</dt><dd>{r.sender_phone || '—'} · {r.sender_address || '—'}</dd><dt>{t('Receiver contact / address','تماس / آدرس گیرنده')}</dt><dd>{r.receiver_phone || '—'} · {r.receiver_address || '—'}</dd></dl></details>
    </article>)}</div>
    {ready && !visibleRows.length && <div className="registry-empty"><ClipboardList size={32} />{rows.length?t('No bookings match these filters.','هیچ بوکینگی با این فیلترها مطابقت ندارد.'):t('No bookings registered yet.','هنوز بوکینگ ثبت نشده است.')}</div>}
    {open && <div className="registry-modal" role="dialog" aria-modal="true" aria-labelledby="booking-title"><div className="registry-form-card booking-form-card"><div className="registry-form-head"><h2 id="booking-title">{editing?t('Edit booking','ویرایش بوکینگ'):t('New booking','بوکینگ جدید')}</h2><button type="button" className="registry-secondary" disabled={busy} onClick={() => setOpen(false)} aria-label={t('Close','بستن')}><X size={18} /></button></div>
      <form className="registry-form booking-form" onSubmit={submit}><fieldset disabled={busy} className="booking-fields">
        {heading(CalendarDays,'Booking date','تاریخ بوکینگ')}{field('booking_date','Date','تاریخ',{type:'date'})}
        {field('departure_date','Departure','تاریخ حرکت',{type:'date'})}{field('arrival_date','Expected arrival','تاریخ رسیدن',{type:'date'})}
        {!branchManager&&<label><span>{t('Branch','شعبه')}</span><select disabled={!!editing} value={form.branch_id||''} onChange={e=>setForm({...form,branch_id:e.target.value})}><option value="">{t('Head office','دفتر مرکزی')}</option>{branches.filter(b=>!b.archived_at||b.id===form.branch_id).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>}
        <label><span>{t('Booking type','نوع بوکینگ')}</span><select value={form.service_type} onChange={e => setForm({ ...form, service_type: e.target.value })}><option value="arrangement">{t('Vehicle arrangement','معرفی واسطه')}</option><option value="managed">{t('Company-managed transport','انتقال توسط شرکت')}</option></select></label>
        {heading(UserRound,'Trader information','مشخصات تاجر')}
        <label className="wide"><span>{t('Select an existing trader or enter a new trader below','تاجر ثبت‌شده را انتخاب کنید یا مشخصات تاجر جدید را وارد کنید')}</span><select value={form.trader_id} onChange={e => chooseTrader(e.target.value)}><option value="">{t('New trader','تاجر جدید')}</option>{traders.filter(r=>!r.archived_at).map(r => <option key={r.id} value={r.id}>{r.full_name} · {r.phone}</option>)}</select></label>
        {field('trader_first_name','First name','نام')}{field('trader_last_name','Last name / surname','تخلص',{required:false})}{field('trader_phone','Contact number','شماره تماس',{type:'tel'})}{field('trader_address','Address','آدرس')}
        {heading(Send,'Sender information','مشخصات فرستنده')}
        <label className="wide registry-check"><input type="checkbox" checked={form.sender_is_trader} onChange={e => setForm({ ...form, sender_is_trader: e.target.checked })} /><span>{t('Trader is the sender','تاجر فرستنده است')}</span></label>
        {field('sender_name','Full name (with surname)','نام و تخلص',{value:sender.sender_name,disabled:form.sender_is_trader})}{field('sender_phone','Phone','موبایل',{type:'tel',value:sender.sender_phone,disabled:form.sender_is_trader})}{field('sender_address','Address','آدرس',{value:sender.sender_address,disabled:form.sender_is_trader})}
        {heading(Users,'Receiver information','مشخصات گیرنده')}{field('receiver_name','Full name (with surname)','نام و تخلص')}{field('receiver_phone','Contact number','شماره تماس',{type:'tel'})}{field('receiver_address','Address','آدرس')}
        {heading(Package,'Goods information','مشخصات بار')}{field('goods','Goods name','نام بار')}{field('weight_tons','Weight (tons)','وزن (تن)',{type:'number',required:false})}{field('volume_m3','Volume (m³)','حجم (متر مکعب)',{type:'number',required:false})}
        <p className="wide booking-help">{t('Enter weight, volume, or both. Tons measure weight; m³ measures volume.','وزن، حجم یا هر دو را وارد کنید. تن واحد وزن و متر مکعب واحد حجم است.')}</p>
        {heading(MapPin,'Route','مسیر')}{field('origin','Origin location','محل مبدأ')}{field('destination','Destination location','محل مقصد')}
        {heading(Truck,'Vehicle and driver','واسطه و راننده')}
        <label><span>{t('Registered vehicle','واسطه ثبت‌شده')} *</span><select required value={form.vehicle_id} onChange={e => setForm(current => ({ ...current, vehicle_id:e.target.value }))}><option value="">—</option>{vehicles.filter(v=>!v.archived_at&&v.status==='available'&&(!v.branch_id||v.branch_id===form.branch_id)).map(v => <option key={v.id} value={v.id}>{v.plate_number} · {v.vehicle_type}</option>)}</select></label>
        <label><span>{t('Registered driver','راننده ثبت‌شده')} *</span><select required value={form.driver_id} onChange={e => setForm(current => ({ ...current, driver_id:e.target.value }))}><option value="">—</option>{drivers.filter(d=>!d.archived_at&&d.status==='available'&&(!d.branch_id||d.branch_id===form.branch_id)).map(d => <option key={d.id} value={d.id}>{d.full_name} · {d.phone}</option>)}</select></label>
        {vehicle && <dl className="booking-preview"><dt>{t('Plate / foreign plate','پلیت / پلیت خارجی')}</dt><dd>{vehicle.plate_number} / {vehicle.foreign_plate_number || '—'}</dd><dt>{t('Type / color','نوع / رنگ')}</dt><dd>{vehicle.vehicle_type} / {vehicle.color || '—'}</dd><dt>{t('VIN','نمبر شاسی')}</dt><dd>{vehicle.vin_number || '—'}</dd><dt>{t('Owner','مالک')}</dt><dd>{vehicle.vehicle_owners?.full_name || '—'} · {vehicle.vehicle_owners?.phone || '—'}</dd><dt>{t('Permit expiry','تاریخ ختم جواز')}</dt><dd>{vehicle.permit_expiry || '—'}</dd></dl>}
        {driver && <dl className="booking-preview"><dt>{t('Driver','راننده')}</dt><dd>{driver.full_name}</dd><dt>{t('Father name','نام پدر')}</dt><dd>{driver.father_name || '—'}</dd><dt>{t('Contact','تماس')}</dt><dd>{driver.phone}</dd><dt>{t('Address','آدرس')}</dt><dd>{driver.address || '—'}</dd><dt>{t('Licence number','نمبر لایسنس')}</dt><dd>{driver.license_number || '—'}</dd></dl>}
        {driver&&!driver.user_id&&<p className="wide booking-help">{t('To show this job in the driver portal, connect this driver’s login using the key icon in Fleet → Drivers.','برای نمایش برنامه در درگاه راننده، حساب این راننده را با آیکن کلید در بخش وسایط ← رانندگان وصل کنید.')}</p>}
        <p className="wide booking-help">{t('Register missing vehicles and drivers in Fleet first. Trader details are saved with this booking; existing trader profiles are not overwritten.','وسایط و رانندگان جدید را ابتدا در بخش وسایط ثبت کنید. مشخصات تاجر با این بوکینگ ذخیره می‌شود؛ مشخصات قبلی تاجر تغییر نمی‌کند.')}</p>
      </fieldset>
      {message && <div role="alert" className="wide registry-notice error">{message}</div>}
      <div className="registry-form-actions"><button type="button" disabled={busy} onClick={() => setOpen(false)}>{t('Cancel','انصراف')}</button><button className="registry-primary" disabled={busy}>{busy ? t('Saving…','در حال ثبت…') : t('Save booking','ثبت بوکینگ')}</button></div></form>
    </div></div>}
    {deletion&&<ConfirmArchive language={language} busy={busy} error={message} restore={!!deletion.archived_at} onClose={()=>setDeletion(null)} onConfirm={async()=>{setBusy(true);try{await rpc('archive_booking_record',{p_id:deletion.id,p_archived:!deletion.archived_at,p_expected:deletion.updated_at});setDeletion(null);await load()}catch(e){setMessage(explain(e,language))}finally{setBusy(false)}}}/>}
    {cancelRow&&<Modal title={t('Cancel booking','لغو بوکینگ')} onClose={()=>setCancelRow(null)} busy={busy}><div className="record-modal-body"><p>{t('Cancel this booking and release its vehicle and driver?','این بوکینگ لغو و واسطه و راننده آزاد شوند؟')}</p>{message&&<p role="alert" className="registry-notice error">{message}</p>}<button className="registry-primary" disabled={busy} onClick={()=>changeStatus(cancelRow,'cancelled')}>{t('Cancel booking','لغو بوکینگ')}</button></div></Modal>}
    {detail&&<Modal title={`#${detail.booking_number}`} onClose={()=>setDetail(null)}><dl className="record-details record-modal-body">{[[t('Trader','تاجر'),`${detail.trader_first_name} ${detail.trader_last_name||''}`],[t('Status','وضعیت'),statuses[detail.status]],[t('Departure','حرکت'),detail.departure_date],[t('Arrival','رسیدن'),detail.arrival_date],[t('Sender','فرستنده'),detail.sender_name],[t('Sender contact','تماس فرستنده'),detail.sender_phone],[t('Sender address','آدرس فرستنده'),detail.sender_address],[t('Receiver','گیرنده'),detail.receiver_name],[t('Receiver contact','تماس گیرنده'),detail.receiver_phone],[t('Receiver address','آدرس گیرنده'),detail.receiver_address],[t('Goods','بار'),detail.goods],[t('Weight / volume','وزن / حجم'),`${detail.weight_tons||'—'} t / ${detail.volume_m3||'—'} m³`],[t('Route','مسیر'),`${detail.origin} → ${detail.destination}`],[t('Vehicle','واسطه'),detail.vehicles?.plate_number],[t('Driver','راننده'),detail.drivers?.full_name]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||'—'}</dd></div>)}</dl></Modal>}
  </div>
}
