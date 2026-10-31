import { useEffect, useState } from 'react'
import { ClipboardList, Plus, Search, X } from 'lucide-react'
import { supabase } from '../lib/supabase'

const blank = { trader_id: '', vehicle_id: '', driver_id: '', service_type: 'arrangement', origin: '', destination: '', goods: '', quantity: '', departure_date: '', currency: 'AFN', total_freight: '', commission: '' }

export default function BookingsPage({ language }) {
  const fa = language === 'fa'
  const t = (en, dari) => fa ? dari : en
  const [rows, setRows] = useState([])
  const [traders, setTraders] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [drivers, setDrivers] = useState([])
  const [form, setForm] = useState(blank)
  const [trader, setTrader] = useState({ full_name: '', phone: '' })
  const [open, setOpen] = useState(false)
  const [addingTrader, setAddingTrader] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [query, setQuery] = useState('')
  useEffect(() => {
    let active = true
    async function load() {
      if (!supabase) return
      const results = await Promise.all([supabase.from('bookings').select('*, traders(full_name,phone), vehicles(plate_number), drivers(full_name)').order('created_at', { ascending: false }), supabase.from('traders').select('*').order('full_name'), supabase.from('vehicles').select('id,plate_number'), supabase.from('drivers').select('id,full_name,vehicle_id')])
      if (!active) return
      if (results.some(r => r.error)) { setMessage(language === 'fa' ? 'دیتابیس بوکینگ آماده نیست. آخرین مایگریشن دیتابیس را اجرا کنید.' : 'Booking database is not ready. Apply the latest database migration.'); return }
      setRows(results[0].data); setTraders(results[1].data); setVehicles(results[2].data); setDrivers(results[3].data)
    }
    void load()
    return () => { active = false }
  }, [language])
  const field = (key, en, dari, type = 'text', required = true) => <label><span>{t(en, dari)}{required ? ' *' : ''}</span><input type={type} required={required} min={type === 'number' ? '0' : undefined} step={type === 'number' ? '0.01' : undefined} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} /></label>
  async function saveTrader() {
    if (!trader.full_name.trim() || !trader.phone.trim() || busy) return
    setBusy(true)
    const { data, error } = await supabase.from('traders').insert(trader).select().single()
    setBusy(false)
    if (error) return setMessage(error.message)
    setTraders([...traders, data]); setForm({ ...form, trader_id: data.id }); setAddingTrader(false); setTrader({ full_name: '', phone: '' })
  }
  async function submit(e) {
    e.preventDefault()
    if (busy) return
    if (Number(form.commission) > Number(form.total_freight)) return setMessage(t('Commission cannot exceed total freight.', 'کمیشن از کرایه مجموعی بیشتر شده نمی‌تواند.'))
    setBusy(true); setMessage('')
    const payload = { ...form, vehicle_id: form.vehicle_id || null, driver_id: form.driver_id || null, departure_date: form.departure_date || null, total_freight: Number(form.total_freight), commission: Number(form.commission) }
    const { data, error } = await supabase.from('bookings').insert(payload).select('*, traders(full_name,phone), vehicles(plate_number), drivers(full_name)').single()
    setBusy(false)
    if (error) return setMessage(error.message)
    setRows([data, ...rows]); setOpen(false); setForm(blank)
  }
  return <div className="registry-page">
    <div className="booking-page-header"><h1>{t('Bookings', 'بوکینگ‌ها')}</h1><button className="registry-primary" onClick={() => { setOpen(true); setMessage('') }}><Plus size={18} />{t('New booking', 'بوکینگ جدید')}</button></div>
    {message && <div role="alert" className="registry-notice error">{message}</div>}
    <label className="registry-search"><Search size={17} /><input placeholder={t('Search booking, trader or route', 'جستجوی بوکینگ، تاجر یا مسیر')} value={query} onChange={e => setQuery(e.target.value)} /></label>
    <div className="booking-list">{rows.filter(r => `${r.booking_number} ${r.traders?.full_name} ${r.origin} ${r.destination}`.toLowerCase().includes(query.toLowerCase())).map(r => <article className="booking-record" key={r.id}>
      <h3><ClipboardList size={20} />#{r.booking_number} · {r.traders?.full_name}</h3><p>{r.origin} → {r.destination} · {r.goods}</p>
      <p>{r.service_type === 'managed' ? t('Company-managed transport', 'انتقال توسط شرکت') : t('Vehicle arrangement', 'معرفی واسطه')} · {r.vehicles?.plate_number || '—'} · {r.drivers?.full_name || '—'}</p>
      <div className="booking-totals"><span>{t('Trader total', 'مجموع کرایه تاجر')}<strong>{r.total_freight} {r.currency}</strong></span><span>{t('Included commission', 'کمیشن شامل کرایه')}<strong>{r.commission} {r.currency}</strong></span><span>{t('Driver/owner entitlement', 'حق راننده / مالک')}<strong>{r.carrier_entitlement} {r.currency}</strong></span></div>
    </article>)}</div>
    {!rows.length && <div className="registry-empty"><ClipboardList size={32} />{t('No bookings registered yet.', 'هنوز بوکینگ ثبت نشده است.')}</div>}
    {open && <div className="registry-modal" role="dialog" aria-modal="true" aria-label={t('New booking', 'بوکینگ جدید')}><div className="registry-form-card"><div className="registry-form-head"><h2>{t('New booking', 'بوکینگ جدید')}</h2><button type="button" className="registry-secondary" disabled={busy} onClick={() => setOpen(false)} aria-label={t('Close', 'بستن')}><X size={18} /></button></div>
      {message && <div role="alert" className="registry-notice error">{message}</div>}
      <form className="registry-form" onSubmit={submit}>
        <label><span>{t('Trader', 'تاجر')} *</span><select required value={form.trader_id} onChange={e => setForm({ ...form, trader_id: e.target.value })}><option value="">—</option>{traders.map(r => <option key={r.id} value={r.id}>{r.full_name} · {r.phone}</option>)}</select></label>
        <button type="button" className="registry-secondary" onClick={() => setAddingTrader(!addingTrader)}><Plus size={16} />{t('Add trader', 'ثبت تاجر')}</button>
        {addingTrader && <div className="wide"><label>{t('Trader name', 'نام تاجر')}<input value={trader.full_name} onChange={e => setTrader({ ...trader, full_name: e.target.value })} /></label><label>{t('Mobile', 'موبایل')}<input value={trader.phone} onChange={e => setTrader({ ...trader, phone: e.target.value })} /></label><button type="button" className="registry-secondary" disabled={busy} onClick={saveTrader}>{t('Save trader', 'ثبت تاجر')}</button></div>}
        <label><span>{t('Booking type', 'نوع بوکینگ')}</span><select value={form.service_type} onChange={e => setForm({ ...form, service_type: e.target.value })}><option value="arrangement">{t('Vehicle arrangement', 'معرفی واسطه')}</option><option value="managed">{t('Company-managed transport', 'انتقال توسط شرکت')}</option></select></label>
        <label><span>{t('Vehicle', 'واسطه')}</span><select value={form.vehicle_id} onChange={e => setForm({ ...form, vehicle_id: e.target.value, driver_id: drivers.find(d => d.vehicle_id === e.target.value)?.id || '' })}><option value="">—</option>{vehicles.map(r => <option key={r.id} value={r.id}>{r.plate_number}</option>)}</select></label>
        <label><span>{t('Driver', 'راننده')}</span><select value={form.driver_id} onChange={e => setForm({ ...form, driver_id: e.target.value })}><option value="">—</option>{drivers.map(r => <option key={r.id} value={r.id}>{r.full_name}</option>)}</select></label>
        {field('origin','Origin','مبدأ')}{field('destination','Destination','مقصد')}{field('goods','Goods','نوع بار')}{field('quantity','Quantity / weight','مقدار / وزن','text',false)}{field('departure_date','Departure date','تاریخ حرکت','date',false)}
        <label><span>{t('Currency', 'واحد پول')}</span><select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })}>{['AFN','USD','PKR','IRR'].map(c => <option key={c}>{c}</option>)}</select></label>
        {field('total_freight','Total fare','کرایه مجموعی','number')}{field('commission','Company commission','کمیشن شرکت','number')}
        <div className="wide booking-totals"><span>{t('Driver/owner entitlement', 'حق راننده / مالک')}<strong>{(Number(form.total_freight) - Number(form.commission)).toFixed(2)} {form.currency}</strong></span></div>
        <div className="registry-form-actions"><button type="button" disabled={busy} onClick={() => setOpen(false)}>{t('Cancel', 'انصراف')}</button><button className="registry-primary" disabled={busy}>{busy ? t('Saving…','در حال ثبت…') : t('Save booking','ثبت بوکینگ')}</button></div>
      </form></div></div>}
  </div>
}
