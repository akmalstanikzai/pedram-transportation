import { formatSolarHijri } from '../lib/solarHijri'

const hasValue = value => value !== null && value !== undefined && String(value).trim() !== ''
const normalizeAddress = value => String(value || '').replace(/[,،\s]+/g, ' ').trim()

export function InformationGroup({ title, fields, address = false }) {
  const visible = fields.filter(field => !field.optional || hasValue(field.value))
  if (!visible.length) return null
  return <section className="fleet-information-section" aria-label={title}>
    <h3>{title}</h3>
    <dl className={`record-details fleet-information-grid ${address ? 'fleet-address-grid' : ''}`}>
      {visible.map(({ key, label, value, wide, ltr }) => <div key={key} className={wide ? 'wide' : ''}>
        <dt>{label}</dt>
        <dd>{hasValue(value) ? ltr ? <bdi dir="ltr">{value}</bdi> : value : '—'}</dd>
      </div>)}
    </dl>
  </section>
}

export default function FleetInformation({ kind, row, language, photoUrl, owner }) {
  const t = (en,fa) => language === 'fa' ? fa : en
  const field = (key,en,fa,value,options = {}) => ({ key, label:t(en,fa), value, ...options })
  const optional = { optional:true }
  const numeric = { optional:true, ltr:true }
  const status = { available:t('Available','آماده'), assigned:t('Assigned','تعیین‌شده'), on_trip:t('On trip','در سفر'), under_repair:t('Under repair','در ترمیم'), inactive:t('Inactive','غیرفعال') }[row.status] || row.status
  const photoLabel = kind === 'vehicle' ? t('Vehicle picture','عکس موتر') : kind === 'driver' ? t('Photo of Driver','عکس راننده') : t('Person Photo','عکس شخص')
  const addressParts = [row.province,row.district,row.village]
  const showFullAddress = hasValue(row.address) && normalizeAddress(row.address) !== normalizeAddress(addressParts.filter(hasValue).join('، '))
  const hasAddress = addressParts.some(hasValue) || hasValue(row.address)
  return <div className="record-modal-body fleet-information-view">
    {photoUrl && <img className="fleet-information-photo" src={photoUrl} alt={photoLabel}/>}
    {kind === 'vehicle' ? <>
      <InformationGroup title={t('Vehicle information','معلومات واسطه')} fields={[
        field('plate','Plate number','نمبر پلیت',row.plate_number),
        field('province','Province','ولایت',row.province),
        field('type','Vehicle type','نوعیت',row.vehicle_type),
        field('body','Body style','حالت',row.vehicle_condition),
        field('model','Model','ماډل',row.model),
        field('color','Color','رنگ',row.color),
        field('foreign','Foreign plate','پلیت خارجی',row.foreign_plate_number,optional),
        field('status','Status','وضعیت',status,optional),
      ]}/>
      <InformationGroup title={t('Capacity','ظرفیت')} fields={[
        field('gross','Gross permitted weight (kg)','وزن مجموعی مجاز (کیلوگرام)',row.gross_weight_kg,numeric),
        field('empty','Empty vehicle weight (kg)','وزن خالی موتر (کیلوگرام)',row.empty_weight_kg,numeric),
        field('cargo','Cargo capacity (tons)','ظرفیت بار (تن)',row.capacity_tons,numeric),
        field('volume','Volume capacity (m³)','ظرفیت حجمی (متر مکعب)',row.volume_capacity_m3,numeric),
      ]}/>
      <InformationGroup title={t('Owner','مالک')} fields={owner ? [
        field('owner','Name','نام',owner.full_name),
        field('phone','Mobile','موبایل',owner.phone,{ ltr:true }),
      ] : [field('owner','Owner','مالک',row.owner_id ? '—' : t('Not selected','انتخاب نشده است'),{ wide:true })]}/>
      <InformationGroup title={t('Additional details','معلومات بیشتر')} fields={[
        field('vin','VIN / chassis','نمبر شاسی',row.vin_number,optional),
        field('year','Model year','سال ساخت',row.model_year,optional),
        field('permit','Permit number','نمبر جواز',row.permit_number,optional),
        field('expiry','Permit expiry','تاریخ ختم جواز',row.permit_expiry ? formatSolarHijri(row.permit_expiry) : null,numeric),
        field('notes','Notes','ملاحظات',row.notes,{ ...optional, wide:true }),
      ]}/>
    </> : <>
      <InformationGroup title={kind === 'driver' ? t('Driver information','معلومات راننده') : t('Owner information','معلومات مالک')} fields={[
        field('name','Name','نام',row.first_name ?? row.full_name),
        field('surname','Surname','تخلص',row.surname),
        field('father','Father name','نام پدر',row.father_name),
        field('mobile','Mobile','موبایل',row.phone,{ ltr:true }),
        field('second','Second mobile','موبایل دوم',row.phone_secondary,numeric),
      ]}/>
      {hasAddress && <InformationGroup title={t('Address','آدرس')} address fields={[
        ...(addressParts.some(hasValue) ? [
          field('province','Province','ولایت',row.province),
          field('district','District','ولسوالی',row.district),
          field('village','Village','قریه',row.village),
        ] : []),
        field('full-address','Full address','آدرس کامل',showFullAddress ? row.address : null,{ ...optional, wide:true }),
      ]}/>}
      <InformationGroup title={t('Additional details','معلومات بیشتر')} fields={[
        field('status','Status','وضعیت',status,optional),
        field('license-expiry','Licence expiry','تاریخ ختم لایسنس',row.license_expiry ? formatSolarHijri(row.license_expiry) : null,numeric),
        field('national-id','Tazkira number','نمبر تذکره',row.national_id,optional),
        field('licence','Licence number','نمبر لایسنس',row.license_number,optional),
        field('previous-company','Previous company','شرکت قبلی',row.previous_company,optional),
        field('next-company','Company after leaving','شرکت بعد از ترک کار',row.destination_company,optional),
        field('left-on','Left on','تاریخ ترک کار',row.left_company_at ? formatSolarHijri(row.left_company_at) : null,numeric),
        field('notes','Notes','ملاحظات',row.notes,{ ...optional, wide:true }),
      ]}/>
    </>}
  </div>
}
