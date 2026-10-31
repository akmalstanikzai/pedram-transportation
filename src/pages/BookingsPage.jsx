import { useEffect, useState } from 'react'
import { CalendarDays, ClipboardList, MapPin, Package, Plus, Search, Send, Truck, UserRound, Users, X } from 'lucide-react'
import { supabase } from '../lib/supabase'

const blank = { booking_date: '', trader_id: '', trader_first_name: '', trader_last_name: '', trader_phone: '', trader_address: '', sender_is_trader: false, sender_name: '', sender_phone: '', sender_address: '', receiver_name: '', receiver_phone: '', receiver_address: '', goods: '', weight_tons: '', volume_m3: '', origin: '', destination: '', vehicle_id: '', driver_id: '', service_type: 'arrangement' }
const selection = '*, traders(full_name,phone), vehicles(plate_number), drivers(full_name)'
function today() {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Kabul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const get = type => parts.find(p => p.type === type).value
  return `${get('year')}-${get('month')}-${get('day')}`
}

export default function BookingsPage({ language }) {
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
  useEffect(() => {
    let active = true
    async function load() {
      if (!supabase) { setMessage(language === 'fa' ? 'اتصال دیتابیس تنظیم نشده است.' : 'Database connection is not configured.'); return }
      const results = await Promise.all([supabase.from('bookings').select(selection).order('created_at', { ascending: false }), supabase.from('traders').select('*').order('full_name'), supabase.from('vehicles').select('*, vehicle_owners(full_name,phone)').order('plate_number'), supabase.from('drivers').select('*').order('full_name')])
      if (!active) return
      if (results.some(r => r.error)) { setMessage(language === 'fa' ? 'معلومات بارگیری نشد. اتصال و تنظیمات دیتابیس را بررسی کنید.' : 'Could not load records. Check the connection and database setup.'); return }
      setRows(results[0].data); setTraders(results[1].data); setVehicles(results[2].data); setDrivers(results[3].data); setReady(true)
    }
    void load()
    return () => { active = false }
  }, [language])
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
      const { data: id, error } = await supabase.rpc('create_booking_record', { p_data: payload })
      if (error) throw error
      const { data, error: readError } = await supabase.from('bookings').select(selection).eq('id',id).single()
      // Saving has committed; a list refresh failure must not invite duplicate submission.
      setOpen(false); setForm(blank)
      if (readError) setMessage(t('Booking saved. Reload the page to refresh the list.', 'بوکینگ ثبت شد. برای تازه‌سازی فهرست صفحه را دوباره باز کنید.'))
      else setRows(current => [data,...current])
      const { data: updated } = await supabase.from('traders').select('*').order('full_name')
      if (updated) setTraders(updated)
    } catch (error) { setMessage(t('Could not save booking: ', 'بوکینگ ثبت نشد: ') + error.message) }
    finally { setBusy(false) }
  }
  return <div className="registry-page">
    <div className="booking-page-header"><h1>{t('Bookings','بوکینگ‌ها')}</h1><button className="registry-primary" disabled={!ready} onClick={() => { setForm({ ...blank, booking_date: today() }); setMessage(''); setOpen(true) }}><Plus size={18} />{t('New booking','بوکینگ جدید')}</button></div>
    {message && !open && <div role="alert" className="registry-notice error">{message}</div>}
    <label className="registry-search"><Search size={17} /><input aria-label={t('Search bookings','جستجوی بوکینگ‌ها')} placeholder={t('Search booking, trader or route','جستجوی بوکینگ، تاجر یا مسیر')} value={query} onChange={e => setQuery(e.target.value)} /></label>
    <div className="booking-list">{rows.filter(r => `${r.booking_number} ${r.trader_first_name || r.traders?.full_name} ${r.trader_last_name || ''} ${r.origin} ${r.destination}`.toLowerCase().includes(query.toLowerCase())).map(r => <article className="booking-record" key={r.id}>
      <h3><ClipboardList size={20} />#{r.booking_number} · {r.trader_first_name ? `${r.trader_first_name} ${r.trader_last_name || ''}` : r.traders?.full_name}</h3>
      <p><strong>{t('Date','تاریخ')}:</strong> {r.booking_date || '—'} · {r.service_type === 'managed' ? t('Company-managed transport','انتقال توسط شرکت') : t('Vehicle arrangement','معرفی واسطه')}</p>
      <p>{r.origin} → {r.destination} · {r.goods}{r.weight_tons ? ` · ${r.weight_tons} ${t('tons','تن')}` : ''}{r.volume_m3 ? ` · ${r.volume_m3} m³` : ''}{!r.weight_tons && !r.volume_m3 && r.quantity ? ` · ${r.quantity}` : ''}</p>
      <p>{t('Sender','فرستنده')}: {r.sender_name || '—'} · {t('Receiver','گیرنده')}: {r.receiver_name || '—'}</p><p>{r.vehicles?.plate_number || '—'} · {r.drivers?.full_name || '—'}</p>
      <details className="booking-contact-details"><summary>{t('Contact details','مشخصات تماس')}</summary><dl className="booking-preview"><dt>{t('Trader contact / address','تماس / آدرس تاجر')}</dt><dd>{r.trader_phone || r.traders?.phone || '—'} · {r.trader_address || '—'}</dd><dt>{t('Sender contact / address','تماس / آدرس فرستنده')}</dt><dd>{r.sender_phone || '—'} · {r.sender_address || '—'}</dd><dt>{t('Receiver contact / address','تماس / آدرس گیرنده')}</dt><dd>{r.receiver_phone || '—'} · {r.receiver_address || '—'}</dd></dl></details>
    </article>)}</div>
    {ready && !rows.length && <div className="registry-empty"><ClipboardList size={32} />{t('No bookings registered yet.','هنوز بوکینگ ثبت نشده است.')}</div>}
    {open && <div className="registry-modal" role="dialog" aria-modal="true" aria-labelledby="booking-title"><div className="registry-form-card booking-form-card"><div className="registry-form-head"><h2 id="booking-title">{t('New booking','بوکینگ جدید')}</h2><button type="button" className="registry-secondary" disabled={busy} onClick={() => setOpen(false)} aria-label={t('Close','بستن')}><X size={18} /></button></div>
      <form className="registry-form booking-form" onSubmit={submit}><fieldset disabled={busy} className="booking-fields">
        {heading(CalendarDays,'Booking date','تاریخ بوکینگ')}{field('booking_date','Date','تاریخ',{type:'date'})}
        <label><span>{t('Booking type','نوع بوکینگ')}</span><select value={form.service_type} onChange={e => setForm({ ...form, service_type: e.target.value })}><option value="arrangement">{t('Vehicle arrangement','معرفی واسطه')}</option><option value="managed">{t('Company-managed transport','انتقال توسط شرکت')}</option></select></label>
        {heading(UserRound,'Trader information','مشخصات تاجر')}
        <label className="wide"><span>{t('Select an existing trader or enter a new trader below','تاجر ثبت‌شده را انتخاب کنید یا مشخصات تاجر جدید را وارد کنید')}</span><select value={form.trader_id} onChange={e => chooseTrader(e.target.value)}><option value="">{t('New trader','تاجر جدید')}</option>{traders.map(r => <option key={r.id} value={r.id}>{r.full_name} · {r.phone}</option>)}</select></label>
        {field('trader_first_name','First name','نام')}{field('trader_last_name','Last name / surname','تخلص',{required:false})}{field('trader_phone','Contact number','شماره تماس',{type:'tel'})}{field('trader_address','Address','آدرس')}
        {heading(Send,'Sender information','مشخصات فرستنده')}
        <label className="wide registry-check"><input type="checkbox" checked={form.sender_is_trader} onChange={e => setForm({ ...form, sender_is_trader: e.target.checked })} /><span>{t('Trader is the sender','تاجر فرستنده است')}</span></label>
        {field('sender_name','Full name (with surname)','نام و تخلص',{value:sender.sender_name,disabled:form.sender_is_trader})}{field('sender_phone','Phone','موبایل',{type:'tel',value:sender.sender_phone,disabled:form.sender_is_trader})}{field('sender_address','Address','آدرس',{value:sender.sender_address,disabled:form.sender_is_trader})}
        {heading(Users,'Receiver information','مشخصات گیرنده')}{field('receiver_name','Full name (with surname)','نام و تخلص')}{field('receiver_phone','Contact number','شماره تماس',{type:'tel'})}{field('receiver_address','Address','آدرس')}
        {heading(Package,'Goods information','مشخصات بار')}{field('goods','Goods name','نام بار')}{field('weight_tons','Weight (tons)','وزن (تن)',{type:'number',required:false})}{field('volume_m3','Volume (m³)','حجم (متر مکعب)',{type:'number',required:false})}
        <p className="wide booking-help">{t('Enter weight, volume, or both. Tons measure weight; m³ measures volume.','وزن، حجم یا هر دو را وارد کنید. تن واحد وزن و متر مکعب واحد حجم است.')}</p>
        {heading(MapPin,'Route','مسیر')}{field('origin','Origin location','محل مبدأ')}{field('destination','Destination location','محل مقصد')}
        {heading(Truck,'Vehicle and driver','واسطه و راننده')}
        <label><span>{t('Registered vehicle','واسطه ثبت‌شده')} *</span><select required value={form.vehicle_id} onChange={e => setForm(current => ({ ...current, vehicle_id:e.target.value }))}><option value="">—</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.plate_number} · {v.vehicle_type}</option>)}</select></label>
        <label><span>{t('Registered driver','راننده ثبت‌شده')} *</span><select required value={form.driver_id} onChange={e => setForm(current => ({ ...current, driver_id:e.target.value }))}><option value="">—</option>{drivers.map(d => <option key={d.id} value={d.id}>{d.full_name} · {d.phone}</option>)}</select></label>
        {vehicle && <dl className="booking-preview"><dt>{t('Plate / foreign plate','پلیت / پلیت خارجی')}</dt><dd>{vehicle.plate_number} / {vehicle.foreign_plate_number || '—'}</dd><dt>{t('Type / color','نوع / رنگ')}</dt><dd>{vehicle.vehicle_type} / {vehicle.color || '—'}</dd><dt>{t('VIN','نمبر شاسی')}</dt><dd>{vehicle.vin_number || '—'}</dd><dt>{t('Owner','مالک')}</dt><dd>{vehicle.vehicle_owners?.full_name || '—'} · {vehicle.vehicle_owners?.phone || '—'}</dd><dt>{t('Permit expiry','تاریخ ختم جواز')}</dt><dd>{vehicle.permit_expiry || '—'}</dd></dl>}
        {driver && <dl className="booking-preview"><dt>{t('Driver','راننده')}</dt><dd>{driver.full_name}</dd><dt>{t('Father name','نام پدر')}</dt><dd>{driver.father_name || '—'}</dd><dt>{t('Contact','تماس')}</dt><dd>{driver.phone}</dd><dt>{t('Address','آدرس')}</dt><dd>{driver.address || '—'}</dd><dt>{t('Licence number','نمبر لایسنس')}</dt><dd>{driver.license_number || '—'}</dd></dl>}
        <p className="wide booking-help">{t('Register missing vehicles and drivers in Fleet first. Trader details are saved with this booking; existing trader profiles are not overwritten.','وسایط و رانندگان جدید را ابتدا در بخش وسایط ثبت کنید. مشخصات تاجر با این بوکینگ ذخیره می‌شود؛ مشخصات قبلی تاجر تغییر نمی‌کند.')}</p>
      </fieldset>
      {message && <div role="alert" className="wide registry-notice error">{message}</div>}
      <div className="registry-form-actions"><button type="button" disabled={busy} onClick={() => setOpen(false)}>{t('Cancel','انصراف')}</button><button className="registry-primary" disabled={busy}>{busy ? t('Saving…','در حال ثبت…') : t('Save booking','ثبت بوکینگ')}</button></div></form>
    </div></div>}
  </div>
}
