import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  CircleParking,
  Plus,
  Search,
  Truck,
  UserRound,
  Wrench,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

const copy = {
  en: {
    owner: 'Register Owner', vehicle: 'Register Vehicle', all: 'All Vehicles', available: 'Available',
    assigned: 'Assigned', on_trip: 'On Trip', under_repair: 'Under Repair', inactive: 'Inactive',
    owners: 'Vehicle Owners', search: 'Search plate, owner or type', noVehicles: 'No vehicles found.',
    noOwners: 'Register an owner before adding a vehicle.', fullName: 'Owner name', fatherName: 'Father name',
    phone: 'Phone number', nationalId: 'National ID', address: 'Address', notes: 'Notes', saveOwner: 'Save owner',
    plate: 'Plate number', type: 'Vehicle type', capacity: 'Capacity (tons)', model: 'Model year', color: 'Color',
    selectOwner: 'Select vehicle owner', status: 'Status', permit: 'Permit number', permitExpiry: 'Permit expiry',
    registrationExpiry: 'Registration expiry', saveVehicle: 'Save vehicle', cancel: 'Cancel', saved: 'Record saved.',
    loadError: 'The vehicle database is not ready. Apply the latest Supabase migration.', required: 'Complete the required fields.',
    total: 'Registered', ownerCount: 'Owners', expiring: 'Expiring soon', database: 'Vehicle registry',
  },
  fa: {
    owner: 'ثبت مالک', vehicle: 'ثبت واسطه', all: 'تمام وسایط', available: 'آماده', assigned: 'تعیین‌شده',
    on_trip: 'در سفر', under_repair: 'در ترمیم', inactive: 'غیرفعال', owners: 'مالکان وسایط',
    search: 'جستجوی پلیت، مالک یا نوع واسطه', noVehicles: 'واسطه‌ای یافت نشد.',
    noOwners: 'قبل از ثبت واسطه، مالک را ثبت کنید.', fullName: 'نام مالک', fatherName: 'نام پدر',
    phone: 'شماره تماس', nationalId: 'نمبر تذکره', address: 'آدرس', notes: 'ملاحظات', saveOwner: 'ثبت مالک',
    plate: 'نمبر پلیت', type: 'نوع واسطه', capacity: 'ظرفیت (تن)', model: 'سال ساخت', color: 'رنگ',
    selectOwner: 'انتخاب مالک واسطه', status: 'وضعیت', permit: 'نمبر جواز', permitExpiry: 'تاریخ ختم جواز',
    registrationExpiry: 'تاریخ ختم ثبت', saveVehicle: 'ثبت واسطه', cancel: 'انصراف', saved: 'معلومات ثبت شد.',
    loadError: 'دیتابیس وسایط آماده نیست. آخرین مایگریشن Supabase را اجرا کنید.', required: 'خانه‌های ضروری را تکمیل کنید.',
    total: 'ثبت‌شده', ownerCount: 'مالکان', expiring: 'نزدیک به انقضا', database: 'ثبت وسایط',
  },
}

const emptyOwner = { full_name: '', father_name: '', phone: '', national_id: '', address: '', notes: '' }
const emptyVehicle = { owner_id: '', plate_number: '', vehicle_type: '', capacity_tons: '', model_year: '', color: '', status: 'available', permit_number: '', permit_expiry: '', registration_expiry: '', notes: '' }

export default function VehiclesPage({ language }) {
  const text = copy[language] || copy.en
  const [vehicles, setVehicles] = useState([])
  const [owners, setOwners] = useState([])
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [dialog, setDialog] = useState(null)
  const [ownerForm, setOwnerForm] = useState(emptyOwner)
  const [vehicleForm, setVehicleForm] = useState(emptyVehicle)
  const [message, setMessage] = useState(null)
  const [loading, setLoading] = useState(true)
  const [today] = useState(() => Date.now())

  const loadRegistry = useCallback(async () => {
    if (!supabase) return setLoading(false)
    const [vehicleResult, ownerResult] = await Promise.all([
      supabase.from('vehicles').select('*, vehicle_owners(id, full_name, phone)').order('created_at', { ascending: false }),
      supabase.from('vehicle_owners').select('*').order('full_name'),
    ])
    setLoading(false)
    if (vehicleResult.error || ownerResult.error) return setMessage({ type: 'error', text: text.loadError })
    setVehicles(vehicleResult.data || [])
    setOwners(ownerResult.data || [])
  }, [text.loadError])

  // Loading external registry data is the synchronization performed by this effect.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { void loadRegistry() }, [loadRegistry])

  const displayedVehicles = useMemo(() => vehicles.filter(vehicle => {
    const matchesStatus = filter === 'all' || vehicle.status === filter
    const haystack = `${vehicle.plate_number} ${vehicle.vehicle_type} ${vehicle.vehicle_owners?.full_name || ''}`.toLowerCase()
    return matchesStatus && haystack.includes(query.trim().toLowerCase())
  }), [vehicles, filter, query])

  const expiringSoon = vehicles.filter(vehicle => {
    const dates = [vehicle.permit_expiry, vehicle.registration_expiry].filter(Boolean)
    const deadline = today + 30 * 86400000
    return dates.some(value => new Date(value).getTime() <= deadline)
  }).length

  async function submitOwner(event) {
    event.preventDefault()
    if (!ownerForm.full_name.trim() || !ownerForm.phone.trim()) return setMessage({ type: 'error', text: text.required })
    const { error } = await supabase.from('vehicle_owners').insert(ownerForm)
    if (error) return setMessage({ type: 'error', text: error.message })
    setOwnerForm(emptyOwner); setDialog(null); setMessage({ type: 'success', text: text.saved }); loadRegistry()
  }

  async function submitVehicle(event) {
    event.preventDefault()
    if (!vehicleForm.owner_id || !vehicleForm.plate_number.trim() || !vehicleForm.vehicle_type.trim()) return setMessage({ type: 'error', text: text.required })
    const payload = {
      ...vehicleForm,
      capacity_tons: vehicleForm.capacity_tons || null,
      model_year: vehicleForm.model_year || null,
      permit_expiry: vehicleForm.permit_expiry || null,
      registration_expiry: vehicleForm.registration_expiry || null,
    }
    const { error } = await supabase.from('vehicles').insert(payload)
    if (error) return setMessage({ type: 'error', text: error.message })
    setVehicleForm(emptyVehicle); setDialog(null); setMessage({ type: 'success', text: text.saved }); loadRegistry()
  }

  const filters = [
    ['all', text.all, Truck], ['available', text.available, CheckCircle2], ['assigned', text.assigned, CircleParking],
    ['on_trip', text.on_trip, Truck], ['under_repair', text.under_repair, Wrench], ['inactive', text.inactive, AlertTriangle],
  ]

  return <div className="registry-page">
    <div className="registry-actions">
      <button className="registry-primary" onClick={() => { setMessage(null); setDialog('vehicle') }} disabled={!owners.length}><Plus size={18} />{text.vehicle}</button>
      <button className="registry-secondary" onClick={() => { setMessage(null); setDialog('owner') }}><UserRound size={18} />{text.owner}</button>
    </div>

    {message && <div className={`registry-notice ${message.type}`}>{message.text}</div>}
    {!owners.length && !loading && !message && <div className="registry-notice info">{text.noOwners}</div>}

    <div className="registry-stats">
      <div><Truck size={21} /><span><strong>{vehicles.length}</strong>{text.total}</span></div>
      <div><UserRound size={21} /><span><strong>{owners.length}</strong>{text.ownerCount}</span></div>
      <div><CheckCircle2 size={21} /><span><strong>{vehicles.filter(v => v.status === 'available').length}</strong>{text.available}</span></div>
      <div><AlertTriangle size={21} /><span><strong>{expiringSoon}</strong>{text.expiring}</span></div>
    </div>

    <div className="registry-toolbar">
      <div className="registry-filters">{filters.map(([id, label, FilterIcon]) => <button key={id} className={filter === id ? 'active' : ''} onClick={() => setFilter(id)}><FilterIcon size={16} />{label}<small>{id === 'all' ? vehicles.length : vehicles.filter(v => v.status === id).length}</small></button>)}</div>
      <label className="registry-search"><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder={text.search} /></label>
    </div>

    <div className="vehicle-list">
      {loading ? <span className="spinner dark" /> : displayedVehicles.length ? displayedVehicles.map(vehicle => <article className="vehicle-row" key={vehicle.id}>
        <span className={`vehicle-mark ${vehicle.status}`}><Truck size={25} /></span>
        <div className="vehicle-main"><strong>{vehicle.plate_number}</strong><small>{vehicle.vehicle_type}{vehicle.capacity_tons ? ` · ${vehicle.capacity_tons} t` : ''}</small></div>
        <div className="vehicle-owner"><UserRound size={15} /><span><strong>{vehicle.vehicle_owners?.full_name}</strong><small>{vehicle.vehicle_owners?.phone}</small></span></div>
        <span className={`status-pill ${vehicle.status}`}>{text[vehicle.status]}</span>
      </article>) : <div className="registry-empty"><Truck size={34} /><strong>{text.noVehicles}</strong></div>}
    </div>

    {dialog && <div className="registry-modal" role="dialog" aria-modal="true"><div className="registry-form-card">
      <div className="registry-form-head"><span className="module-card-icon green">{dialog === 'owner' ? <UserRound size={27} /> : <Truck size={27} />}</span><h2>{dialog === 'owner' ? text.owner : text.vehicle}</h2></div>
      {dialog === 'owner' ? <form onSubmit={submitOwner} className="registry-form">
        <Input label={text.fullName} required value={ownerForm.full_name} onChange={value => setOwnerForm({ ...ownerForm, full_name: value })} />
        <Input label={text.fatherName} value={ownerForm.father_name} onChange={value => setOwnerForm({ ...ownerForm, father_name: value })} />
        <Input label={text.phone} required value={ownerForm.phone} onChange={value => setOwnerForm({ ...ownerForm, phone: value })} />
        <Input label={text.nationalId} value={ownerForm.national_id} onChange={value => setOwnerForm({ ...ownerForm, national_id: value })} />
        <Input label={text.address} value={ownerForm.address} onChange={value => setOwnerForm({ ...ownerForm, address: value })} wide />
        <Input label={text.notes} value={ownerForm.notes} onChange={value => setOwnerForm({ ...ownerForm, notes: value })} wide />
        <FormActions text={text} onCancel={() => setDialog(null)} submit={text.saveOwner} />
      </form> : <form onSubmit={submitVehicle} className="registry-form">
        <label><span>{text.selectOwner} *</span><select required value={vehicleForm.owner_id} onChange={event => setVehicleForm({ ...vehicleForm, owner_id: event.target.value })}><option value="">—</option>{owners.map(owner => <option key={owner.id} value={owner.id}>{owner.full_name} · {owner.phone}</option>)}</select></label>
        <Input label={text.plate} required value={vehicleForm.plate_number} onChange={value => setVehicleForm({ ...vehicleForm, plate_number: value })} />
        <Input label={text.type} required value={vehicleForm.vehicle_type} onChange={value => setVehicleForm({ ...vehicleForm, vehicle_type: value })} />
        <Input label={text.capacity} type="number" value={vehicleForm.capacity_tons} onChange={value => setVehicleForm({ ...vehicleForm, capacity_tons: value })} />
        <Input label={text.model} type="number" value={vehicleForm.model_year} onChange={value => setVehicleForm({ ...vehicleForm, model_year: value })} />
        <Input label={text.color} value={vehicleForm.color} onChange={value => setVehicleForm({ ...vehicleForm, color: value })} />
        <label><span>{text.status}</span><select value={vehicleForm.status} onChange={event => setVehicleForm({ ...vehicleForm, status: event.target.value })}>{filters.slice(1).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <Input label={text.permit} value={vehicleForm.permit_number} onChange={value => setVehicleForm({ ...vehicleForm, permit_number: value })} />
        <Input label={text.permitExpiry} type="date" value={vehicleForm.permit_expiry} onChange={value => setVehicleForm({ ...vehicleForm, permit_expiry: value })} />
        <Input label={text.registrationExpiry} type="date" value={vehicleForm.registration_expiry} onChange={value => setVehicleForm({ ...vehicleForm, registration_expiry: value })} />
        <Input label={text.notes} value={vehicleForm.notes} onChange={value => setVehicleForm({ ...vehicleForm, notes: value })} wide />
        <FormActions text={text} onCancel={() => setDialog(null)} submit={text.saveVehicle} />
      </form>}
    </div></div>}
  </div>
}

function Input({ label, required, type = 'text', value, onChange, wide }) {
  return <label className={wide ? 'wide' : ''}><span>{label}{required ? ' *' : ''}</span><input required={required} type={type} value={value} onChange={event => onChange(event.target.value)} /></label>
}

function FormActions({ text, onCancel, submit }) {
  return <div className="registry-form-actions"><button type="button" onClick={onCancel}>{text.cancel}</button><button type="submit" className="registry-primary">{submit}</button></div>
}
