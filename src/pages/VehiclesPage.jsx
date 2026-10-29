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
    owner: 'Register Owner', vehicle: 'Register Vehicle', driver: 'Register Driver', all: 'All Vehicles', available: 'Available',
    assigned: 'Assigned', on_trip: 'On Trip', under_repair: 'Under Repair', inactive: 'Inactive',
    owners: 'Vehicle Owners', search: 'Search plate, owner or type', noVehicles: 'No vehicles found.',
    noOwners: 'Register an owner before adding a vehicle.', fullName: 'Owner name', fatherName: 'Father name',
    phone: 'Phone number', nationalId: 'National ID', address: 'Address', notes: 'Notes', saveOwner: 'Save owner',
    plate: 'Plate number', type: 'Vehicle type', capacity: 'Capacity (tons)', model: 'Model year', color: 'Color',
    selectOwner: 'Select vehicle owner', status: 'Status', permit: 'Permit number', permitExpiry: 'Permit expiry',
    registrationExpiry: 'Registration expiry', saveVehicle: 'Save vehicle', cancel: 'Cancel', saved: 'Record saved.',
    loadError: 'The vehicle database is not ready. Apply the latest Supabase migration.', required: 'Complete the required fields.',
    total: 'Vehicles', ownerCount: 'Owners', driverCount: 'Drivers', drivers: 'Drivers', noDrivers: 'No drivers registered.',
    driverName: 'Driver name', license: 'Licence number', licenseExpiry: 'Licence expiry', saveDriver: 'Save driver',
    ownerIsDriver: 'Owner is also a driver', selectDriver: 'Assign an existing driver', addDriverNow: 'Register a new driver with this vehicle',
  },
  fa: {
    owner: 'ثبت مالک', vehicle: 'ثبت واسطه', driver: 'ثبت راننده', all: 'تمام وسایط', available: 'آماده', assigned: 'تعیین‌شده',
    on_trip: 'در سفر', under_repair: 'در ترمیم', inactive: 'غیرفعال', owners: 'مالکان وسایط',
    search: 'جستجوی پلیت، مالک یا نوع واسطه', noVehicles: 'واسطه‌ای یافت نشد.',
    noOwners: 'قبل از ثبت واسطه، مالک را ثبت کنید.', fullName: 'نام مالک', fatherName: 'نام پدر',
    phone: 'شماره تماس', nationalId: 'نمبر تذکره', address: 'آدرس', notes: 'ملاحظات', saveOwner: 'ثبت مالک',
    plate: 'نمبر پلیت', type: 'نوع واسطه', capacity: 'ظرفیت (تن)', model: 'سال ساخت', color: 'رنگ',
    selectOwner: 'انتخاب مالک واسطه', status: 'وضعیت', permit: 'نمبر جواز', permitExpiry: 'تاریخ ختم جواز',
    registrationExpiry: 'تاریخ ختم ثبت', saveVehicle: 'ثبت واسطه', cancel: 'انصراف', saved: 'معلومات ثبت شد.',
    loadError: 'دیتابیس وسایط آماده نیست. آخرین مایگریشن Supabase را اجرا کنید.', required: 'خانه‌های ضروری را تکمیل کنید.',
    total: 'وسایط', ownerCount: 'مالکان', driverCount: 'رانندگان', drivers: 'رانندگان', noDrivers: 'راننده‌ای ثبت نشده است.',
    driverName: 'نام راننده', license: 'نمبر جواز رانندگی', licenseExpiry: 'تاریخ ختم جواز', saveDriver: 'ثبت راننده',
    ownerIsDriver: 'مالک راننده نیز است', selectDriver: 'انتخاب راننده موجود', addDriverNow: 'ثبت راننده جدید با این واسطه',
  },
}

const emptyOwner = { full_name: '', father_name: '', phone: '', national_id: '', address: '', notes: '', owner_is_driver: false, license_number: '', license_expiry: '' }
const emptyDriver = { owner_id: '', full_name: '', father_name: '', phone: '', national_id: '', license_number: '', license_expiry: '', address: '' }
const emptyVehicle = { owner_id: '', driver_id: '', add_driver: false, driver_name: '', driver_phone: '', driver_license: '', plate_number: '', vehicle_type: '', capacity_tons: '', model_year: '', color: '', status: 'available', permit_number: '', permit_expiry: '', notes: '' }

export default function VehiclesPage({ language }) {
  const text = copy[language] || copy.en
  const [vehicles, setVehicles] = useState([])
  const [owners, setOwners] = useState([])
  const [drivers, setDrivers] = useState([])
  const [query, setQuery] = useState('')
  const [dialog, setDialog] = useState(null)
  const [ownerForm, setOwnerForm] = useState(emptyOwner)
  const [vehicleForm, setVehicleForm] = useState(emptyVehicle)
  const [driverForm, setDriverForm] = useState(emptyDriver)
  const [message, setMessage] = useState(null)
  const [loading, setLoading] = useState(true)
  const [documents, setDocuments] = useState({})

  useEffect(() => { setDocuments({}) }, [dialog])

  async function uploadDocuments(kind, id) {
    for (const [category, files] of Object.entries(documents)) {
      for (const file of files) {
        const path = `${kind}/${id}/${category}/${crypto.randomUUID()}.${file.name.split('.').pop()}`
        const { error } = await supabase.storage.from('fleet-documents').upload(path, file)
        if (error) throw error
      }
    }
    setDocuments({})
  }

  function documentFields(kind) {
    const labels = kind === 'vehicle'
      ? [['photos', 'Vehicle pictures (2)', 'عکس‌های موتر (۲ قطعه)'], ['permit', 'Road permit', 'جواز سیر'], ['card', 'Vehicle card', 'کارت'], ['booklet', 'Vehicle booklet', 'کتابچه'], ['international', 'International certificate', 'سرتفیکت بین المللی']]
      : kind === 'owner' ? [['identity', 'CNIC / Tazkira scan', 'اسکن تذکره']]
        : [['identity', 'CNIC / Tazkira scan', 'اسکن تذکره'], ['licence', 'Driving licence', 'اسکن لایسنس'], ['health', 'Health card', 'کارت صحت'], ['contract', 'Contract', 'قرارداد خط']]
    return labels.map(([key, en, fa]) => <label key={key}><span>{language === 'fa' ? fa : en}</span><input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.heif,.tif,.tiff" onChange={event => setDocuments(current => ({ ...current, [key]: Array.from(event.target.files || []) }))} /></label>)
  }

  const loadRegistry = useCallback(async () => {
    if (!supabase) return setLoading(false)
    const [vehicleResult, ownerResult, driverResult] = await Promise.all([
      supabase.from('vehicles').select('*, vehicle_owners(id, full_name, phone), drivers(id, full_name, phone)').order('created_at', { ascending: false }),
      supabase.from('vehicle_owners').select('*').order('full_name'),
      supabase.from('drivers').select('*, vehicles(plate_number), vehicle_owners(full_name)').order('full_name'),
    ])
    setLoading(false)
    if (vehicleResult.error || ownerResult.error || driverResult.error) return setMessage({ type: 'error', text: text.loadError })
    setVehicles(vehicleResult.data || [])
    setOwners(ownerResult.data || [])
    setDrivers(driverResult.data || [])
  }, [text.loadError])

  // Loading external registry data is the synchronization performed by this effect.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { void loadRegistry() }, [loadRegistry])

  const displayedVehicles = useMemo(() => vehicles.filter(vehicle => {
    const haystack = `${vehicle.plate_number} ${vehicle.vehicle_type} ${vehicle.vehicle_owners?.full_name || ''}`.toLowerCase()
    return haystack.includes(query.trim().toLowerCase())
  }), [vehicles, query])

  async function submitOwner(event) {
    event.preventDefault()
    if (!ownerForm.full_name.trim() || !ownerForm.phone.trim()) return setMessage({ type: 'error', text: text.required })
    const { owner_is_driver, license_number, license_expiry, ...ownerPayload } = ownerForm
    const { data: owner, error } = await supabase.from('vehicle_owners').insert(ownerPayload).select('id').single()
    if (error) return setMessage({ type: 'error', text: error.message })
    try { await uploadDocuments('owner', owner.id) } catch (error) { return setMessage({ type: 'error', text: `${text.saved} ${error.message}` }) }
    if (owner_is_driver) {
      const { error: driverError } = await supabase.from('drivers').insert({ owner_id: owner.id, full_name: ownerForm.full_name, father_name: ownerForm.father_name || null, phone: ownerForm.phone, national_id: ownerForm.national_id || null, address: ownerForm.address || null, license_number: license_number || null, license_expiry: license_expiry || null })
      if (driverError) return setMessage({ type: 'error', text: driverError.message })
    }
    setOwnerForm(emptyOwner); setDialog(null); setMessage({ type: 'success', text: text.saved }); loadRegistry()
  }

  async function submitVehicle(event) {
    event.preventDefault()
    if (!vehicleForm.owner_id || !vehicleForm.plate_number.trim() || !vehicleForm.vehicle_type.trim()) return setMessage({ type: 'error', text: text.required })
    const { driver_id, add_driver, driver_name, driver_phone, driver_license, ...vehicleFields } = vehicleForm
    const payload = {
      ...vehicleFields,
      capacity_tons: vehicleForm.capacity_tons || null,
      model_year: vehicleForm.model_year || null,
      permit_expiry: vehicleForm.permit_expiry || null,
    }
    const { data: vehicle, error } = await supabase.from('vehicles').insert(payload).select('id').single()
    if (error) return setMessage({ type: 'error', text: error.message })
    try { await uploadDocuments('vehicle', vehicle.id) } catch (error) { return setMessage({ type: 'error', text: `${text.saved} ${error.message}` }) }
    if (driver_id) await supabase.from('drivers').update({ vehicle_id: vehicle.id, status: 'assigned' }).eq('id', driver_id)
    if (add_driver && driver_name && driver_phone) {
      const { error: driverError } = await supabase.from('drivers').insert({ owner_id: vehicleForm.owner_id, vehicle_id: vehicle.id, full_name: driver_name, phone: driver_phone, license_number: driver_license || null, status: 'assigned' })
      if (driverError) return setMessage({ type: 'error', text: driverError.message })
    }
    setVehicleForm(emptyVehicle); setDialog(null); setMessage({ type: 'success', text: text.saved }); loadRegistry()
  }

  async function submitDriver(event) {
    event.preventDefault()
    if (!driverForm.full_name.trim() || !driverForm.phone.trim()) return setMessage({ type: 'error', text: text.required })
    const payload = { ...driverForm, owner_id: driverForm.owner_id || null, license_expiry: driverForm.license_expiry || null }
    const { data: driver, error } = await supabase.from('drivers').insert(payload).select('id').single()
    if (error) return setMessage({ type: 'error', text: error.message })
    try { await uploadDocuments('driver', driver.id) } catch (error) { return setMessage({ type: 'error', text: `${text.saved} ${error.message}` }) }
    setDriverForm(emptyDriver); setDialog(null); setMessage({ type: 'success', text: text.saved }); loadRegistry()
  }

  const filters = [
    ['all', text.all, Truck], ['available', text.available, CheckCircle2], ['assigned', text.assigned, CircleParking],
    ['on_trip', text.on_trip, Truck], ['under_repair', text.under_repair, Wrench], ['inactive', text.inactive, AlertTriangle],
  ]

  return <div className="registry-page">
    <div className="registry-actions">
      <button className="registry-primary" onClick={() => { setMessage(null); setDialog('vehicle') }} disabled={!owners.length}><Plus size={18} />{text.vehicle}</button>
      <button className="registry-secondary" onClick={() => { setMessage(null); setDialog('owner') }}><UserRound size={18} />{text.owner}</button>
      <button className="registry-secondary" onClick={() => { setMessage(null); setDialog('driver') }}><UserRound size={18} />{text.driver}</button>
    </div>

    {message && <div className={`registry-notice ${message.type}`}>{message.text}</div>}
    {!owners.length && !loading && !message && <div className="registry-notice info">{text.noOwners}</div>}

    <div className="registry-stats">
      <div><Truck size={21} /><span><strong>{vehicles.length}</strong>{text.total}</span></div>
      <div><UserRound size={21} /><span><strong>{owners.length}</strong>{text.ownerCount}</span></div>
      <div><UserRound size={21} /><span><strong>{drivers.length}</strong>{text.driverCount}</span></div>
      <div><CheckCircle2 size={21} /><span><strong>{vehicles.filter(v => v.status === 'available').length}</strong>{text.available}</span></div>
    </div>

    <div className="registry-toolbar">
      <label className="registry-search"><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder={text.search} /></label>
    </div>

    <h3 className="fleet-section-title"><Truck size={18} />{text.total}</h3>
    <div className="vehicle-list">
      {loading ? <span className="spinner dark" /> : displayedVehicles.length ? displayedVehicles.map(vehicle => <article className="vehicle-row" key={vehicle.id}>
        <span className={`vehicle-mark ${vehicle.status}`}><Truck size={25} /></span>
        <div className="vehicle-main"><strong>{vehicle.plate_number}</strong><small>{vehicle.vehicle_type}{vehicle.capacity_tons ? ` · ${vehicle.capacity_tons} t` : ''}</small></div>
        <div className="vehicle-owner"><UserRound size={15} /><span><strong>{vehicle.drivers?.[0]?.full_name || vehicle.vehicle_owners?.full_name}</strong><small>{vehicle.drivers?.[0] ? text.drivers : text.ownerCount}</small></span></div>
        <span className={`status-pill ${vehicle.status}`}>{text[vehicle.status]}</span>
      </article>) : <div className="registry-empty"><Truck size={34} /><strong>{text.noVehicles}</strong></div>}
    </div>

    <div className="fleet-drivers"><h3><UserRound size={18} />{text.drivers}</h3>{drivers.length ? drivers.map(driver => <div className="driver-row" key={driver.id}><span className="driver-avatar"><UserRound size={18} /></span><span><strong>{driver.full_name}</strong><small>{driver.phone}</small></span><span>{driver.vehicles?.plate_number || text.available}</span></div>) : <div className="registry-empty"><UserRound size={30} /><strong>{text.noDrivers}</strong></div>}</div>

    {dialog && <div className="registry-modal" role="dialog" aria-modal="true"><div className="registry-form-card">
      <div className="registry-form-head"><span className="module-card-icon green">{dialog === 'vehicle' ? <Truck size={27} /> : <UserRound size={27} />}</span><h2>{dialog === 'owner' ? text.owner : dialog === 'driver' ? text.driver : text.vehicle}</h2></div>
      {dialog === 'owner' ? <form onSubmit={submitOwner} className="registry-form">
        <Input label={text.fullName} required value={ownerForm.full_name} onChange={value => setOwnerForm({ ...ownerForm, full_name: value })} />
        <Input label={text.fatherName} value={ownerForm.father_name} onChange={value => setOwnerForm({ ...ownerForm, father_name: value })} />
        <Input label={text.phone} required value={ownerForm.phone} onChange={value => setOwnerForm({ ...ownerForm, phone: value })} />
        <Input label={text.nationalId} value={ownerForm.national_id} onChange={value => setOwnerForm({ ...ownerForm, national_id: value })} />
        <Input label={text.address} value={ownerForm.address} onChange={value => setOwnerForm({ ...ownerForm, address: value })} wide />
        <Input label={language === 'fa' ? 'ولایت محل سکونت' : 'Province of residence'} value={ownerForm.province || ''} onChange={value => setOwnerForm({ ...ownerForm, province: value })} />
        <Input label={text.notes} value={ownerForm.notes} onChange={value => setOwnerForm({ ...ownerForm, notes: value })} wide />
        <label className="wide registry-check"><input type="checkbox" checked={ownerForm.owner_is_driver} onChange={event => setOwnerForm({ ...ownerForm, owner_is_driver: event.target.checked })} /><span>{text.ownerIsDriver}</span></label>
        {ownerForm.owner_is_driver && <><Input label={text.license} value={ownerForm.license_number} onChange={value => setOwnerForm({ ...ownerForm, license_number: value })} /><Input label={text.licenseExpiry} type="date" value={ownerForm.license_expiry} onChange={value => setOwnerForm({ ...ownerForm, license_expiry: value })} /></>}
        {documentFields('owner')}
        <FormActions text={text} onCancel={() => setDialog(null)} submit={text.saveOwner} />
      </form> : dialog === 'driver' ? <form onSubmit={submitDriver} className="registry-form">
        <Input label={text.driverName} required value={driverForm.full_name} onChange={value => setDriverForm({ ...driverForm, full_name: value })} />
        <Input label={text.fatherName} value={driverForm.father_name} onChange={value => setDriverForm({ ...driverForm, father_name: value })} />
        <Input label={text.phone} required value={driverForm.phone} onChange={value => setDriverForm({ ...driverForm, phone: value })} />
        <Input label={text.nationalId} value={driverForm.national_id} onChange={value => setDriverForm({ ...driverForm, national_id: value })} />
        <Input label={text.license} value={driverForm.license_number} onChange={value => setDriverForm({ ...driverForm, license_number: value })} />
        <Input label={text.licenseExpiry} type="date" value={driverForm.license_expiry} onChange={value => setDriverForm({ ...driverForm, license_expiry: value })} />
        <label><span>{text.selectOwner}</span><select value={driverForm.owner_id} onChange={event => setDriverForm({ ...driverForm, owner_id: event.target.value })}><option value="">—</option>{owners.map(owner => <option key={owner.id} value={owner.id}>{owner.full_name}</option>)}</select></label>
        <Input label={text.address} value={driverForm.address} onChange={value => setDriverForm({ ...driverForm, address: value })} wide />
        {documentFields('driver')}
        <FormActions text={text} onCancel={() => setDialog(null)} submit={text.saveDriver} />
      </form> : <form onSubmit={submitVehicle} className="registry-form">
        <label><span>{text.selectOwner} *</span><select required value={vehicleForm.owner_id} onChange={event => setVehicleForm({ ...vehicleForm, owner_id: event.target.value })}><option value="">—</option>{owners.map(owner => <option key={owner.id} value={owner.id}>{owner.full_name} · {owner.phone}</option>)}</select></label>
        <Input label={text.plate} required value={vehicleForm.plate_number} onChange={value => setVehicleForm({ ...vehicleForm, plate_number: value })} />
        <Input label={language === 'fa' ? 'نمبر پلیت خارجی (اختیاری)' : 'Foreign plate number (optional)'} value={vehicleForm.foreign_plate_number || ''} onChange={value => setVehicleForm({ ...vehicleForm, foreign_plate_number: value })} />
        <Input label={language === 'fa' ? 'نمبر شاسی' : 'VIN / Chassis number'} value={vehicleForm.vin_number || ''} onChange={value => setVehicleForm({ ...vehicleForm, vin_number: value })} />
        <Input label={text.type} required value={vehicleForm.vehicle_type} onChange={value => setVehicleForm({ ...vehicleForm, vehicle_type: value })} />
        <Input label={text.capacity} type="number" value={vehicleForm.capacity_tons} onChange={value => setVehicleForm({ ...vehicleForm, capacity_tons: value })} />
        <Input label={text.model} type="number" value={vehicleForm.model_year} onChange={value => setVehicleForm({ ...vehicleForm, model_year: value })} />
        <Input label={text.color} value={vehicleForm.color} onChange={value => setVehicleForm({ ...vehicleForm, color: value })} />
        <label><span>{text.status}</span><select value={vehicleForm.status} onChange={event => setVehicleForm({ ...vehicleForm, status: event.target.value })}>{filters.slice(1).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <Input label={text.permit} value={vehicleForm.permit_number} onChange={value => setVehicleForm({ ...vehicleForm, permit_number: value })} />
        <Input label={text.permitExpiry} type="date" value={vehicleForm.permit_expiry} onChange={value => setVehicleForm({ ...vehicleForm, permit_expiry: value })} />
        <Input label={text.notes} value={vehicleForm.notes} onChange={value => setVehicleForm({ ...vehicleForm, notes: value })} wide />
        <label className="wide"><span>{text.selectDriver}</span><select value={vehicleForm.driver_id} onChange={event => setVehicleForm({ ...vehicleForm, driver_id: event.target.value, add_driver: false })}><option value="">—</option>{drivers.filter(driver => !driver.vehicle_id).map(driver => <option key={driver.id} value={driver.id}>{driver.full_name} · {driver.phone}</option>)}</select></label>
        <label className="wide registry-check"><input type="checkbox" checked={vehicleForm.add_driver} onChange={event => setVehicleForm({ ...vehicleForm, add_driver: event.target.checked, driver_id: '' })} /><span>{text.addDriverNow}</span></label>
        {vehicleForm.add_driver && <><Input label={text.driverName} required value={vehicleForm.driver_name} onChange={value => setVehicleForm({ ...vehicleForm, driver_name: value })} /><Input label={text.phone} required value={vehicleForm.driver_phone} onChange={value => setVehicleForm({ ...vehicleForm, driver_phone: value })} /><Input label={text.license} value={vehicleForm.driver_license} onChange={value => setVehicleForm({ ...vehicleForm, driver_license: value })} /></>}
        {documentFields('vehicle')}
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
