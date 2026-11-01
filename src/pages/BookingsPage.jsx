import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight, ClipboardList, Eye, Pencil, Plus, Truck } from 'lucide-react'
import { rows, rpc } from '../lib/api'
import { canOperate, clean, errorCode } from '../lib/operations'
import { kabulToday } from '../lib/cashbook'
import {
  EmptyState,
  FormActions,
  FormField,
  FormSection,
  Loading,
  Modal,
  Notice,
  PageHeading,
  Pagination,
  RefreshButton,
  SearchBox,
} from '../components/Workspace'

const blank = {
  branch_id: '',
  booking_date: '',
  departure_date: '',
  arrival_date: '',
  trader_id: '',
  trader_first_name: '',
  trader_last_name: '',
  trader_phone: '',
  trader_address: '',
  sender_is_trader: false,
  sender_name: '',
  sender_phone: '',
  sender_address: '',
  receiver_name: '',
  receiver_phone: '',
  receiver_address: '',
  goods: '',
  weight_tons: '',
  volume_m3: '',
  origin: '',
  destination: '',
  vehicle_id: '',
  driver_id: '',
  service_type: 'arrangement',
}
const selection =
  'id,booking_number,trader_id,vehicle_id,driver_id,service_type,origin,destination,goods,quantity,departure_date,created_at,booking_date,trader_first_name,trader_last_name,trader_address,trader_phone,sender_is_trader,sender_name,sender_phone,sender_address,receiver_name,receiver_phone,receiver_address,weight_tons,volume_m3,branch_id,status,arrival_date,updated_at,vehicles(plate_number),drivers(full_name)'
const statusLabel = (status, t) =>
  ({
    confirmed: t('Confirmed', 'تأییدشده'),
    in_transit: t('In transit', 'در مسیر'),
    completed: t('Completed', 'تکمیل‌شده'),
    cancelled: t('Cancelled', 'لغوشده'),
  })[status] || status

export default function BookingsPage({
  language,
  profile,
  action,
  recordId,
  traderId,
  onAlertsChanged,
}) {
  const t = (en, fa) => (language === 'fa' ? fa : en)
  const writable = canOperate(profile.role)
  const [data, setData] = useState({
    bookings: [],
    traders: [],
    vehicles: [],
    drivers: [],
    branches: [],
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState(action === 'active' ? 'active' : 'all')
  const [page, setPage] = useState(1)
  const [editor, setEditor] = useState(() =>
    action === 'new' && writable ? { record: null, request: crypto.randomUUID() } : null,
  )
  const [details, setDetails] = useState(null)
  const [transition, setTransition] = useState(null)
  const load = useCallback(async () => {
    const [bookings, traders, vehicles, drivers, branches] = await Promise.all([
      rows('bookings', selection),
      writable ? rows('traders') : [],
      writable ? rows('vehicles', '*, vehicle_owners(full_name,phone)') : [],
      writable ? rows('drivers') : [],
      writable ? rows('branches', 'id,name,archived_at') : [],
    ])
    return {
      bookings: bookings.sort((a, b) => b.created_at.localeCompare(a.created_at)),
      traders,
      vehicles,
      drivers,
      branches,
    }
  }, [writable])
  useEffect(() => {
    let active = true
    void load()
      .then((result) => {
        if (active) {
          setData(result)
          if (action === 'view' && recordId) {
            const record = result.bookings.find((item) => item.id === recordId)
            if (record) setDetails(record)
            else setError(new Error('ACCESS_DENIED'))
          }
        }
      })
      .catch((failure) => {
        if (active) setError(failure)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [load, action, recordId])
  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      setData(await load())
    } catch (failure) {
      setError(failure)
    } finally {
      setLoading(false)
    }
  }
  async function committed() {
    setEditor(null)
    setTransition(null)
    setDetails(null)
    setSaved(true)
    onAlertsChanged?.()
    await refresh()
  }
  const filtered = data.bookings.filter(
    (record) =>
      (!traderId || record.trader_id === traderId) &&
      (filter === 'all' ||
        (filter === 'active'
          ? ['confirmed', 'in_transit'].includes(record.status || 'confirmed')
          : record.status === filter)) &&
      `${record.booking_number} ${record.trader_first_name} ${record.trader_last_name || ''} ${record.origin} ${record.destination} ${record.vehicles?.plate_number || ''}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  )
  const visiblePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / 15)))
  return (
    <>
      {traderId && (
        <p className="table-filter-note">
          {t(
            'Showing bookings for the selected trader.',
            'بوکینگ‌های تاجر انتخاب‌شده نمایش داده می‌شوند.',
          )}{' '}
          <a href="#/bookings">{t('Show all bookings', 'نمایش تمام بوکینگ‌ها')}</a>
        </p>
      )}
      <PageHeading
        title={
          profile.role === 'driver' ? t('My bookings', 'بوکینگ‌های من') : t('Bookings', 'بوکینگ‌ها')
        }
        description={t(
          'Clear details, dependable assignments, and a complete record of every booking.',
          'مشخصات روشن، تعیین منظم وسایط و سابقه کامل هر بوکینگ.',
        )}
      >
        <RefreshButton loading={loading} onClick={refresh} language={language} />
        {writable && (
          <button
            className="registry-primary"
            disabled={loading}
            onClick={() => {
              setSaved(false)
              setEditor({ record: null, request: crypto.randomUUID() })
            }}
          >
            <Plus size={17} />
            {t('New booking', 'بوکینگ جدید')}
          </button>
        )}
      </PageHeading>
      <div className="mini-stats">
        {['confirmed', 'in_transit', 'completed'].map((status) => (
          <div key={status}>
            <span>{statusLabel(status, t)}</span>
            <strong>
              {loading || error
                ? '—'
                : data.bookings.filter((b) => (b.status || 'confirmed') === status).length}
            </strong>
          </div>
        ))}
      </div>
      <Notice
        error={error}
        message={saved ? t('Booking saved.', 'بوکینگ ثبت شد.') : null}
        language={language}
      />
      <section className="surface-card">
        <div className="table-toolbar">
          <label className="filter-select">
            <span className="sr-only">{t('Filter status', 'انتخاب وضعیت')}</span>
            <select
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value)
                setPage(1)
              }}
            >
              <option value="all">{t('All bookings', 'تمام بوکینگ‌ها')}</option>
              <option value="active">{t('Active bookings', 'بوکینگ‌های فعال')}</option>
              {['confirmed', 'in_transit', 'completed', 'cancelled'].map((status) => (
                <option key={status} value={status}>
                  {statusLabel(status, t)}
                </option>
              ))}
            </select>
          </label>
          <SearchBox
            label={t('Search booking, trader or route…', 'جستجوی بوکینگ، تاجر یا مسیر…')}
            value={query}
            onChange={(value) => {
              setQuery(value)
              setPage(1)
            }}
          />
        </div>
        {loading ? (
          <Loading language={language} />
        ) : error && !data.bookings.length ? (
          <EmptyState
            title={t('Bookings could not be loaded', 'بوکینگ‌ها بارگیری نشد')}
            description={t(
              'Resolve the error above, then refresh. Your bookings have not been deleted.',
              'خطای بالا را رفع و صفحه را تازه‌سازی کنید. بوکینگ‌های شما حذف نشده‌اند.',
            )}
          />
        ) : !filtered.length ? (
          <EmptyState
            title={t('No matching bookings', 'بوکینگی یافت نشد')}
            description={
              writable
                ? t(
                    'Create a booking or change your filters.',
                    'بوکینگ ثبت کنید یا جستجو را تغییر دهید.',
                  )
                : t(
                    'Your assigned bookings will appear here.',
                    'بوکینگ‌های تعیین‌شده برای شما اینجا نمایش داده می‌شوند.',
                  )
            }
          />
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('Booking / trader', 'بوکینگ / تاجر')}</th>
                  <th>{t('Route / cargo', 'مسیر / بار')}</th>
                  <th>{t('Vehicle / driver', 'واسطه / راننده')}</th>
                  <th>{t('Schedule', 'زمان‌بندی')}</th>
                  <th>{t('Status', 'وضعیت')}</th>
                  <th>{t('Actions', 'عملیات')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice((visiblePage - 1) * 15, visiblePage * 15).map((record) => (
                  <tr key={record.id}>
                    <td>
                      <div className="record-identity">
                        <span className="table-record-icon">
                          <ClipboardList size={19} />
                        </span>
                        <span>
                          <strong>#{record.booking_number}</strong>
                          <small>
                            {record.trader_first_name} {record.trader_last_name}
                          </small>
                        </span>
                      </div>
                    </td>
                    <td>
                      <strong className="route-cell">
                        {record.origin}
                        <ArrowRight size={13} />
                        {record.destination}
                      </strong>
                      <small>
                        {record.goods}
                        {record.weight_tons ? ` · ${record.weight_tons} t` : ''}
                        {record.volume_m3 ? ` · ${record.volume_m3} m³` : ''}
                      </small>
                    </td>
                    <td>
                      <strong>{record.vehicles?.plate_number || '—'}</strong>
                      <small>{record.drivers?.full_name || '—'}</small>
                    </td>
                    <td>
                      <strong>
                        <bdi dir="ltr">{record.departure_date || record.booking_date}</bdi>
                      </strong>
                      <small>
                        {record.arrival_date ? `${t('Until', 'تا')} ${record.arrival_date}` : '—'}
                      </small>
                    </td>
                    <td>
                      <span className={`status-badge ${record.status || 'confirmed'}`}>
                        {statusLabel(record.status || 'confirmed', t)}
                      </span>
                    </td>
                    <td>
                      <div className="table-actions">
                        <button
                          className="icon-button"
                          aria-label={`${t('View booking', 'مشاهده بوکینگ')} ${record.booking_number}`}
                          onClick={() => setDetails(record)}
                        >
                          <Eye size={18} />
                        </button>
                        {writable && (record.status || 'confirmed') === 'confirmed' && (
                          <button
                            className="icon-button"
                            aria-label={`${t('Edit booking', 'ویرایش بوکینگ')} ${record.booking_number}`}
                            onClick={() => setEditor({ record, request: crypto.randomUUID() })}
                          >
                            <Pencil size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && (!error || data.bookings.length > 0) && (
          <Pagination
            page={visiblePage}
            setPage={setPage}
            count={filtered.length}
            language={language}
          />
        )}
      </section>
      {editor && (
        <BookingEditor
          key={editor.request}
          record={editor.record}
          request={editor.request}
          data={data}
          profile={profile}
          language={language}
          onClose={() => setEditor(null)}
          onSaved={committed}
        />
      )}
      {details && (
        <Modal
          title={`${t('Booking', 'بوکینگ')} #${details.booking_number}`}
          language={language}
          onClose={() => setDetails(null)}
          wide
        >
          <div className="workspace-form">
            <span className={`status-badge ${details.status || 'confirmed'}`}>
              {statusLabel(details.status || 'confirmed', t)}
            </span>
            <dl className="details-grid">
              {[
                [t('Booking date', 'تاریخ بوکینگ'), details.booking_date],
                [
                  t('Service', 'نوع خدمت'),
                  details.service_type === 'managed'
                    ? t('Company-managed transport', 'انتقال توسط شرکت')
                    : t('Vehicle arrangement', 'معرفی واسطه'),
                ],
                [
                  t('Trader', 'تاجر'),
                  `${details.trader_first_name} ${details.trader_last_name || ''}`,
                ],
                [
                  t('Trader contact / address', 'تماس / آدرس تاجر'),
                  `${details.trader_phone || '—'} · ${details.trader_address || '—'}`,
                ],
                [
                  t('Sender', 'فرستنده'),
                  `${details.sender_name || '—'} · ${details.sender_phone || '—'} · ${details.sender_address || '—'}`,
                ],
                [
                  t('Receiver', 'گیرنده'),
                  `${details.receiver_name || '—'} · ${details.receiver_phone || '—'} · ${details.receiver_address || '—'}`,
                ],
                [t('Route', 'مسیر'), `${details.origin} → ${details.destination}`],
                [
                  t('Goods', 'بار'),
                  `${details.goods}${details.weight_tons ? ` · ${details.weight_tons} t` : ''}${details.volume_m3 ? ` · ${details.volume_m3} m³` : ''}`,
                ],
                [
                  t('Vehicle / driver', 'واسطه / راننده'),
                  `${details.vehicles?.plate_number || '—'} · ${details.drivers?.full_name || '—'}`,
                ],
                [
                  t('Departure / expected arrival', 'حرکت / رسیدن مورد انتظار'),
                  `${details.departure_date || details.booking_date} → ${details.arrival_date || '—'}`,
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value || '—'}</dd>
                </div>
              ))}
            </dl>
            {writable && ['confirmed', 'in_transit'].includes(details.status || 'confirmed') && (
              <div className="form-actions">
                {(details.status || 'confirmed') === 'confirmed' ? (
                  <button
                    className="registry-primary"
                    onClick={() => {
                      setTransition({
                        record: details,
                        status: 'in_transit',
                        request: crypto.randomUUID(),
                      })
                      setDetails(null)
                    }}
                  >
                    <Truck size={17} />
                    {t('Start transport', 'آغاز انتقال')}
                  </button>
                ) : (
                  <button
                    className="registry-primary"
                    onClick={() => {
                      setTransition({
                        record: details,
                        status: 'completed',
                        request: crypto.randomUUID(),
                      })
                      setDetails(null)
                    }}
                  >
                    {t('Mark completed', 'تکمیل انتقال')}
                  </button>
                )}
                <button
                  className="danger-button"
                  onClick={() => {
                    setTransition({
                      record: details,
                      status: 'cancelled',
                      request: crypto.randomUUID(),
                    })
                    setDetails(null)
                  }}
                >
                  {t('Cancel booking', 'لغو بوکینگ')}
                </button>
              </div>
            )}
          </div>
        </Modal>
      )}
      {transition && (
        <StatusChange
          {...transition}
          language={language}
          onClose={() => setTransition(null)}
          onSaved={committed}
        />
      )}
    </>
  )
}

function BookingEditor({ record, request, data, profile, language, onClose, onSaved }) {
  const t = (en, fa) => (language === 'fa' ? fa : en)
  const [form, setForm] = useState(() =>
    Object.fromEntries(
      Object.entries({
        ...blank,
        booking_date: kabulToday(),
        departure_date: kabulToday(),
        arrival_date: kabulToday(),
        branch_id: profile.branch_id || '',
      }).map(([key, value]) => [
        key,
        key === 'branch_id' && record ? record.branch_id || '' : (record?.[key] ?? value),
      ]),
    ),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [uncertain, setUncertain] = useState(false)
  const submission = useRef(null)
  const guard = useRef(false)
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const sender = form.sender_is_trader
    ? {
        sender_name: `${form.trader_first_name} ${form.trader_last_name}`.trim(),
        sender_phone: form.trader_phone,
        sender_address: form.trader_address,
      }
    : {}
  const vehicle = data.vehicles.find((v) => v.id === form.vehicle_id)
  const driver = data.drivers.find((d) => d.id === form.driver_id)
  const input = (key, label, props = {}) => (
    <FormField
      label={label}
      required
      {...props}
      value={sender[key] ?? form[key]}
      disabled={key in sender}
      onChange={(event) => update(key, event.target.value)}
    />
  )
  function chooseTrader(id) {
    const trader = data.traders.find((item) => item.id === id)
    setForm((current) => ({
      ...current,
      trader_id: id,
      trader_first_name: trader?.first_name || trader?.full_name || '',
      trader_last_name: trader?.last_name || '',
      trader_phone: trader?.phone || '',
      trader_address: trader?.address || '',
    }))
  }
  async function save(event) {
    event.preventDefault()
    if (guard.current) return
    guard.current = true
    setBusy(true)
    setError(null)
    try {
      if (!form.weight_tons && !form.volume_m3) throw new Error('INVALID_MEASUREMENT')
      if (
        form.weight_tons &&
        vehicle?.capacity_tons &&
        Number(form.weight_tons) > Number(vehicle.capacity_tons)
      )
        throw new Error('CAPACITY_EXCEEDED')
      if (form.departure_date < form.booking_date || form.arrival_date < form.departure_date)
        throw new Error('INVALID_DATES')
      submission.current ||= {
        p_id: record?.id || null,
        p_request: request,
        p_data: clean({ ...form, ...sender }),
        p_expected: record?.updated_at || null,
      }
      await rpc('save_booking_record', submission.current)
      await onSaved()
    } catch (failure) {
      setError(failure)
      const unknown = ['UNKNOWN_ERROR', 'NETWORK_ERROR'].includes(errorCode(failure))
      setUncertain(unknown)
      if (!unknown) submission.current = null
    } finally {
      guard.current = false
      setBusy(false)
    }
  }
  return (
    <Modal
      title={
        record
          ? `${t('Edit booking', 'ویرایش بوکینگ')} #${record.booking_number}`
          : t('New booking', 'بوکینگ جدید')
      }
      onClose={onClose}
      busy={busy}
      language={language}
      wide
    >
      <form className="workspace-form" onSubmit={save}>
        <fieldset disabled={busy || uncertain}>
          <FormSection title={t('01 · Booking & schedule', '01 · بوکینگ و زمان‌بندی')}>
            <FormField label={t('Branch', 'شعبه')}>
              <select
                value={form.branch_id}
                disabled={Boolean(record) || profile.role === 'branch_manager'}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    branch_id: event.target.value,
                    vehicle_id: '',
                    driver_id: '',
                    trader_id: '',
                  }))
                }
              >
                <option value="">{t('Central office', 'دفتر مرکزی')}</option>
                {data.branches
                  .filter((b) => !b.archived_at || b.id === form.branch_id)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
              </select>
            </FormField>
            <FormField label={t('Service type', 'نوع خدمت')}>
              <select
                value={form.service_type}
                onChange={(event) => update('service_type', event.target.value)}
              >
                <option value="arrangement">{t('Vehicle arrangement', 'معرفی واسطه')}</option>
                <option value="managed">
                  {t('Company-managed transport', 'انتقال توسط شرکت')}
                </option>
              </select>
            </FormField>
            {input('booking_date', t('Booking date', 'تاریخ بوکینگ'), { type: 'date' })}
            {input('departure_date', t('Departure date', 'تاریخ حرکت'), {
              type: 'date',
              min: form.booking_date,
            })}
            {input('arrival_date', t('Expected arrival date', 'تاریخ رسیدن مورد انتظار'), {
              type: 'date',
              min: form.departure_date,
            })}
            <p className="form-help span-full">
              {t(
                'The vehicle and driver are reserved for this inclusive date range. Overlapping active bookings are blocked.',
                'واسطه و راننده برای تمام روزهای این بازه رزرو می‌شوند. بوکینگ‌های فعال هم‌زمان مجاز نیستند.',
              )}
            </p>
          </FormSection>
          <FormSection title={t('02 · Trader', '02 · تاجر')}>
            <FormField
              label={t(
                'Choose an existing trader, or enter a new one',
                'تاجر موجود را انتخاب یا تاجر جدید ثبت کنید',
              )}
              wide
            >
              <select value={form.trader_id} onChange={(event) => chooseTrader(event.target.value)}>
                <option value="">{t('New trader', 'تاجر جدید')}</option>
                {data.traders
                  .filter((r) => (r.branch_id || '') === form.branch_id)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.full_name} · {r.phone}
                    </option>
                  ))}
              </select>
            </FormField>
            {input('trader_first_name', t('First name', 'نام'))}
            {input('trader_last_name', t('Surname', 'تخلص'), { required: false })}
            {input('trader_phone', t('Phone', 'شماره تماس'), { type: 'tel' })}
            {input('trader_address', t('Address', 'آدرس'))}
            <p className="form-help span-full">
              {t(
                'Contact details are saved with this booking; existing trader profiles are not overwritten.',
                'مشخصات تماس با همین بوکینگ حفظ می‌شوند؛ پروفایل قبلی تاجر تغییر نمی‌کند.',
              )}
            </p>
          </FormSection>
          <FormSection title={t('03 · Sender & receiver', '03 · فرستنده و گیرنده')}>
            <label className="check-field span-full">
              <input
                type="checkbox"
                checked={form.sender_is_trader}
                onChange={(event) => update('sender_is_trader', event.target.checked)}
              />
              {t('Trader is the sender', 'تاجر فرستنده است')}
            </label>
            {input('sender_name', t('Sender full name', 'نام کامل فرستنده'))}
            {input('sender_phone', t('Sender phone', 'شماره فرستنده'), { type: 'tel' })}
            {input('sender_address', t('Sender address', 'آدرس فرستنده'), { wide: true })}
            {input('receiver_name', t('Receiver full name', 'نام کامل گیرنده'))}
            {input('receiver_phone', t('Receiver phone', 'شماره گیرنده'), { type: 'tel' })}
            {input('receiver_address', t('Receiver address', 'آدرس گیرنده'), { wide: true })}
          </FormSection>
          <FormSection title={t('04 · Cargo & route', '04 · بار و مسیر')}>
            {input('goods', t('Goods', 'نام بار'), { wide: true })}
            {input('weight_tons', t('Weight (tons)', 'وزن (تن)'), {
              required: false,
              type: 'number',
              min: '0.001',
              max: '999999999.999',
              step: '0.001',
            })}
            {input('volume_m3', t('Volume (m³)', 'حجم (m³)'), {
              required: false,
              type: 'number',
              min: '0.001',
              max: '999999999.999',
              step: '0.001',
            })}
            {input('origin', t('Origin', 'مبدأ'))}
            {input('destination', t('Destination', 'مقصد'))}
            <p className="form-help span-full">
              {t(
                'Enter weight, volume, or both. Weight is checked against vehicle capacity.',
                'وزن، حجم یا هر دو را وارد کنید. وزن با ظرفیت واسطه بررسی می‌شود.',
              )}
            </p>
          </FormSection>
          <FormSection title={t('05 · Vehicle & driver', '05 · واسطه و راننده')}>
            <FormField label={t('Vehicle *', 'واسطه *')}>
              <select
                required
                value={form.vehicle_id}
                onChange={(event) => update('vehicle_id', event.target.value)}
              >
                <option value="">{t('Choose vehicle', 'انتخاب واسطه')}</option>
                {data.vehicles
                  .filter(
                    (v) =>
                      !v.archived_at &&
                      (v.branch_id || '') === form.branch_id &&
                      (v.status === 'available' || v.id === form.vehicle_id),
                  )
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.plate_number} · {v.vehicle_type}
                    </option>
                  ))}
              </select>
            </FormField>
            <FormField label={t('Driver *', 'راننده *')}>
              <select
                required
                value={form.driver_id}
                onChange={(event) => update('driver_id', event.target.value)}
              >
                <option value="">{t('Choose driver', 'انتخاب راننده')}</option>
                {data.drivers
                  .filter(
                    (d) =>
                      !d.archived_at &&
                      (d.branch_id || '') === form.branch_id &&
                      (d.status === 'available' || d.id === form.driver_id),
                  )
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.full_name} · {d.phone}
                    </option>
                  ))}
              </select>
            </FormField>
            {vehicle && (
              <dl className="booking-preview">
                <dt>{t('Vehicle / foreign plate / VIN', 'واسطه / پلیت خارجی / شاسی')}</dt>
                <dd>
                  {vehicle.plate_number} · {vehicle.foreign_plate_number || '—'} ·{' '}
                  {vehicle.vin_number || '—'}
                </dd>
                <dt>{t('Owner / contact', 'مالک / تماس')}</dt>
                <dd>
                  {vehicle.vehicle_owners?.full_name || '—'} ·{' '}
                  {vehicle.vehicle_owners?.phone || '—'}
                </dd>
                <dt>{t('Capacity / permit expiry', 'ظرفیت / ختم جواز')}</dt>
                <dd>
                  {vehicle.capacity_tons || '—'} t · {vehicle.permit_expiry || '—'}
                </dd>
                <dt>{t('Type / color', 'نوع / رنگ')}</dt>
                <dd>
                  {vehicle.vehicle_type} · {vehicle.color || '—'}
                </dd>
              </dl>
            )}
            {driver && (
              <dl className="booking-preview">
                <dt>{t('Driver / father name', 'راننده / نام پدر')}</dt>
                <dd>
                  {driver.full_name} · {driver.father_name || '—'}
                </dd>
                <dt>{t('Contact / address', 'تماس / آدرس')}</dt>
                <dd>
                  {driver.phone} · {driver.address || '—'}
                </dd>
                <dt>{t('Licence / expiry', 'لایسنس / ختم')}</dt>
                <dd>
                  {driver.license_number || '—'} · {driver.license_expiry || '—'}
                </dd>
              </dl>
            )}
            <p className="form-help span-full">
              {t(
                'Vehicles and drivers are chosen independently. Register missing records in Fleet first.',
                'واسطه و راننده جداگانه انتخاب می‌شوند. سوابق جدید را ابتدا در بخش وسایط ثبت کنید.',
              )}
            </p>
          </FormSection>
        </fieldset>
        <Notice error={error} language={language} />
        {uncertain && (
          <p className="form-help">
            {t(
              'The result was not confirmed. Retry the same details safely, or close and refresh first.',
              'نتیجه تأیید نشد. همان معلومات را دوباره ارسال کنید یا ابتدا فورم را بسته و فهرست را تازه کنید.',
            )}
          </p>
        )}
        <FormActions
          busy={busy}
          onClose={onClose}
          language={language}
          label={uncertain ? t('Retry save', 'کوشش مجدد') : t('Save booking', 'ثبت بوکینگ')}
        />
      </form>
    </Modal>
  )
}
function StatusChange({ record, status, request, language, onClose, onSaved }) {
  const t = (en, fa) => (language === 'fa' ? fa : en)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const guard = useRef(false)
  async function save(event) {
    event.preventDefault()
    if (guard.current) return
    guard.current = true
    setBusy(true)
    setError(null)
    try {
      await rpc('change_booking_status', {
        p_id: record.id,
        p_status: status,
        p_request: request,
        p_expected: record.updated_at,
      })
      await onSaved()
    } catch (failure) {
      setError(failure)
    } finally {
      guard.current = false
      setBusy(false)
    }
  }
  return (
    <Modal
      title={`${t('Update booking', 'تغییر بوکینگ')} #${record.booking_number}`}
      onClose={onClose}
      busy={busy}
      language={language}
    >
      <form className="workspace-form" onSubmit={save}>
        <p>
          {t('Change status to', 'تغییر وضعیت به')} <strong>{statusLabel(status, t)}</strong>?
        </p>
        <p className="form-help">
          {t(
            'Completed and cancelled bookings remain available as historical records.',
            'بوکینگ‌های تکمیل و لغوشده به‌عنوان سابقه حفظ می‌شوند.',
          )}
        </p>
        <Notice error={error} language={language} />
        <FormActions
          busy={busy}
          onClose={onClose}
          language={language}
          label={t('Confirm change', 'تأیید تغییر')}
        />
      </form>
    </Modal>
  )
}
