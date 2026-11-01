import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Archive,
  CalendarDays,
  Download,
  FileText,
  Pencil,
  Plus,
  Trash2,
  Truck,
  Upload,
  UserRound,
  Users,
} from 'lucide-react'
import { client, rows, rpc } from '../lib/api'
import { clean, errorCode, normalizePlate } from '../lib/operations'
import { documentCategories as categories, uploadFleetDocument } from '../lib/fleetDocuments'
import DocumentPicker from '../components/DocumentPicker'
import '../fleet-documents.css'
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

const tables = { vehicle: 'vehicles', owner: 'vehicle_owners', driver: 'drivers' }
const kinds = { vehicles: 'vehicle', owners: 'owner', drivers: 'driver' }
const blank = {
  full_name: '',
  father_name: '',
  phone: '',
  national_id: '',
  address: '',
  notes: '',
  province: '',
  owner_id: '',
  plate_number: '',
  foreign_plate_number: '',
  vin_number: '',
  vehicle_type: '',
  capacity_tons: '',
  model_year: '',
  color: '',
  status: 'available',
  permit_number: '',
  permit_expiry: '',
  license_number: '',
  license_expiry: '',
  user_id: '',
  owner_is_driver: false,
  branch_id: '',
  archived: false,
}
export default function VehiclesPage({
  language,
  profile,
  view = 'vehicles',
  action,
  recordId,
  documentId,
}) {
  const t = (en, fa) => (language === 'fa' ? fa : en)
  const kind = kinds[view]
  const [data, setData] = useState({ records: [], owners: [], branches: [], profiles: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)
  const [query, setQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [page, setPage] = useState(1)
  const [editor, setEditor] = useState(() =>
    action === 'new' ? { record: null, request: crypto.randomUUID() } : null,
  )
  const [documents, setDocuments] = useState(null)
  const load = useCallback(async () => {
    const [records, owners, branches, profiles] = await Promise.all([
      rows(tables[kind]),
      kind === 'vehicle' ? rows('vehicle_owners') : Promise.resolve([]),
      rows('branches', 'id,name,archived_at'),
      profile.role === 'president' && kind === 'driver'
        ? rows('profiles', 'id,full_name,role,branch_id,account_enabled', (q) =>
            q.eq('role', 'driver'),
          )
        : Promise.resolve([]),
    ])
    return {
      records: records.sort((a, b) => b.created_at.localeCompare(a.created_at)),
      owners,
      branches,
      profiles,
    }
  }, [kind, profile.role])
  useEffect(() => {
    let active = true
    void load()
      .then((result) => {
        if (active) {
          setData(result)
          if (recordId && ['view', 'documents'].includes(action)) {
            const record = result.records.find((item) => item.id === recordId)
            if (!record) setError(new Error('ACCESS_DENIED'))
            else {
              setShowArchived(Boolean(record.archived_at))
              if (action === 'documents') setDocuments(record)
              else setEditor({ record, request: crypto.randomUUID() })
            }
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
    setSaved(true)
    await refresh()
  }
  const title =
    kind === 'vehicle'
      ? t('Vehicles', 'وسایط')
      : kind === 'owner'
        ? t('Vehicle owners', 'مالکان وسایط')
        : t('Drivers', 'رانندگان')
  const register =
    kind === 'vehicle'
      ? t('Register vehicle', 'ثبت واسطه')
      : kind === 'owner'
        ? t('Register owner', 'ثبت مالک')
        : t('Register driver', 'ثبت راننده')
  const Icon = kind === 'vehicle' ? Truck : kind === 'owner' ? Users : UserRound
  const filtered = data.records.filter(
    (record) =>
      Boolean(record.archived_at) === showArchived &&
      `${record.plate_number || ''} ${record.vehicle_type || ''} ${record.full_name || ''} ${record.phone || ''}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  )
  const visiblePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / 15)))
  return (
    <>
      <PageHeading
        title={title}
        description={t(
          'One place for reliable fleet records, contacts and documents.',
          'محلی برای مدیریت سوابق وسایط، تماس‌ها و اسناد.',
        )}
      >
        <RefreshButton loading={loading} onClick={refresh} language={language} />
        <button
          className="registry-primary"
          disabled={loading}
          onClick={() => {
            setSaved(false)
            setEditor({ record: null, request: crypto.randomUUID() })
          }}
        >
          <Plus size={17} />
          {register}
        </button>
      </PageHeading>
      <div className="mini-stats">
        <div>
          <span>{t('Registered', 'ثبت‌شده')}</span>
          <strong>
            {loading || error ? '—' : data.records.filter((r) => !r.archived_at).length}
          </strong>
        </div>
        <div>
          <span>{t('Available', 'آماده')}</span>
          <strong>
            {loading || error
              ? '—'
              : data.records.filter(
                  (r) => !r.archived_at && (!r.status || r.status === 'available'),
                ).length}
          </strong>
        </div>
        <div>
          <span>{t('Archived', 'بایگانی')}</span>
          <strong>
            {loading || error ? '—' : data.records.filter((r) => r.archived_at).length}
          </strong>
        </div>
      </div>
      <Notice
        error={error}
        message={
          saved
            ? t('Record saved. Your list has been refreshed.', 'سابقه ثبت و فهرست تازه شد.')
            : null
        }
        language={language}
      />
      <section className="surface-card">
        <div className="table-toolbar">
          <div className="segmented-control">
            <button
              className={!showArchived ? 'active' : ''}
              onClick={() => {
                setShowArchived(false)
                setPage(1)
              }}
            >
              {t('Active records', 'سوابق فعال')}
            </button>
            <button
              className={showArchived ? 'active' : ''}
              onClick={() => {
                setShowArchived(true)
                setPage(1)
              }}
            >
              <Archive size={14} />
              {t('Archived', 'بایگانی')}
            </button>
          </div>
          <SearchBox
            label={t('Search records…', 'جستجوی سوابق…')}
            value={query}
            onChange={(value) => {
              setQuery(value)
              setPage(1)
            }}
          />
        </div>
        {loading ? (
          <Loading language={language} />
        ) : error && !data.records.length ? (
          <EmptyState
            title={t('Records could not be loaded', 'سوابق بارگیری نشد')}
            description={t(
              'Resolve the error above, then refresh. Your records have not been deleted.',
              'خطای بالا را رفع و صفحه را تازه‌سازی کنید. سوابق شما حذف نشده‌اند.',
            )}
          />
        ) : !filtered.length ? (
          <EmptyState
            title={t('No matching records', 'سابقه‌ای یافت نشد')}
            description={t(
              'Register a record or try another search.',
              'یک سابقه ثبت کنید یا جستجو را تغییر دهید.',
            )}
          />
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{kind === 'vehicle' ? t('Vehicle', 'واسطه') : t('Name', 'نام')}</th>
                  <th>
                    {kind === 'vehicle'
                      ? t('Owner / capacity', 'مالک / ظرفیت')
                      : t('Contact / identity', 'تماس / هویت')}
                  </th>
                  <th>{t('Branch', 'شعبه')}</th>
                  <th>{t('Status', 'وضعیت')}</th>
                  <th className="actions-cell">{t('Actions', 'عملیات')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice((visiblePage - 1) * 15, visiblePage * 15).map((record) => (
                  <tr key={record.id}>
                    <td>
                      <div className="record-identity">
                        <span className="table-record-icon">
                          <Icon size={20} />
                        </span>
                        <span>
                          <strong>{record.plate_number || record.full_name}</strong>
                          <small>
                            {record.vehicle_type || record.license_number || record.province || '—'}
                          </small>
                        </span>
                      </div>
                    </td>
                    <td>
                      <strong>
                        {kind === 'vehicle'
                          ? data.owners.find((o) => o.id === record.owner_id)?.full_name || '—'
                          : record.phone}
                      </strong>
                      <small>
                        {kind === 'vehicle'
                          ? record.capacity_tons
                            ? `${record.capacity_tons} ${t('tons', 'تن')}`
                            : t('Capacity not set', 'ظرفیت تعیین نشده')
                          : record.national_id || '—'}
                      </small>
                    </td>
                    <td>
                      {data.branches.find((b) => b.id === record.branch_id)?.name ||
                        t('Central office', 'دفتر مرکزی')}
                    </td>
                    <td>
                      <span
                        className={`status-badge ${record.archived_at ? 'archived' : record.status || 'available'}`}
                      >
                        {record.archived_at
                          ? t('Archived', 'بایگانی')
                          : statusText(record.status || 'available', t)}
                      </span>
                    </td>
                    <td>
                      <div className="table-actions">
                        <button
                          className="text-button"
                          onClick={() => {
                            setSaved(false)
                            setEditor({ record, request: crypto.randomUUID() })
                          }}
                        >
                          <Pencil size={15} />
                          {t('View / edit', 'مشاهده / ویرایش')}
                        </button>
                        <button
                          className="text-button"
                          title={t('Documents', 'اسناد')}
                          aria-label={`${t('Documents for', 'اسناد')} ${record.plate_number || record.full_name}`}
                          onClick={() => setDocuments(record)}
                        >
                          <FileText size={18} />
                          {t('Documents', 'اسناد')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && (!error || data.records.length > 0) && (
          <Pagination
            page={visiblePage}
            setPage={setPage}
            count={filtered.length}
            language={language}
          />
        )}
      </section>
      {editor && (
        <FleetEditor
          key={editor.request}
          kind={kind}
          record={editor.record}
          request={editor.request}
          data={data}
          profile={profile}
          language={language}
          title={
            editor.record
              ? `${t('Record details', 'مشخصات سابقه')} · ${editor.record.plate_number || editor.record.full_name}`
              : register
          }
          onClose={() => setEditor(null)}
          onSaved={committed}
          onManageDocuments={(record) => {
            setEditor(null)
            setDocuments(record)
          }}
        />
      )}
      {documents && (
        <Documents
          highlightId={documentId}
          kind={kind}
          record={documents}
          language={language}
          onClose={() => setDocuments(null)}
        />
      )}
    </>
  )
}
function statusText(status, t) {
  return (
    {
      available: t('Available', 'آماده'),
      assigned: t('Assigned', 'تعیین‌شده'),
      on_trip: t('On trip', 'در سفر'),
      under_repair: t('Under repair', 'در ترمیم'),
      inactive: t('Inactive', 'غیرفعال'),
    }[status] || status
  )
}

function FleetEditor({
  kind,
  record,
  request,
  data,
  profile,
  language,
  title,
  onClose,
  onSaved,
  onManageDocuments,
}) {
  const t = (en, fa) => (language === 'fa' ? fa : en)
  const [form, setForm] = useState(() => ({
    ...blank,
    ...record,
    branch_id: record ? record.branch_id || '' : profile.branch_id || '',
    archived: Boolean(record?.archived_at),
  }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [uncertain, setUncertain] = useState(false)
  const [jobs, setJobs] = useState([])
  const [savedId, setSavedId] = useState(null)
  const submission = useRef(null)
  const guard = useRef(false)
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const input = (key, label, props = {}) => (
    <FormField
      label={label}
      {...props}
      value={form[key]}
      onChange={(event) => update(key, event.target.value)}
    />
  )
  async function save(event) {
    event.preventDefault()
    if (guard.current) return
    guard.current = true
    setBusy(true)
    setError(null)
    let recordCommitted = Boolean(savedId)
    try {
      const payload = clean(form)
      if (kind === 'vehicle') payload.plate_number = normalizePlate(payload.plate_number)
      submission.current ||= {
        p_kind: kind,
        p_id: record?.id || null,
        p_request: request,
        p_data: payload,
        p_expected: record?.updated_at || null,
      }
      const parentId = savedId || (await rpc('save_fleet_record', submission.current))
      setSavedId(parentId)
      recordCommitted = true
      for (const job of jobs) {
        await uploadFleetDocument(kind, parentId, job, {
          rpc,
          storage: client().storage.from('fleet-documents'),
        })
        setJobs((current) => current.filter((item) => item.id !== job.id))
      }
      await onSaved()
    } catch (failure) {
      setError(failure)
      const unknown =
        !recordCommitted && ['UNKNOWN_ERROR', 'NETWORK_ERROR'].includes(errorCode(failure))
      setUncertain(unknown)
      if (!unknown) submission.current = null
    } finally {
      guard.current = false
      setBusy(false)
    }
  }
  return (
    <Modal
      title={title}
      language={language}
      busy={busy}
      onClose={savedId ? () => void onSaved() : onClose}
      wide
    >
      <form onSubmit={save} className="workspace-form">
        <fieldset disabled={busy || uncertain || Boolean(savedId)}>
          <FormSection title={t('Record information', 'معلومات سابقه')}>
            <FormField label={t('Branch', 'شعبه')}>
              <select
                value={form.branch_id}
                disabled={Boolean(record) || profile.role === 'branch_manager'}
                onChange={(event) => update('branch_id', event.target.value)}
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
            {kind === 'vehicle' ? (
              <>
                <FormField label={t('Vehicle owner *', 'مالک واسطه *')}>
                  <select
                    required
                    value={form.owner_id}
                    onChange={(event) => update('owner_id', event.target.value)}
                  >
                    <option value="">{t('Select owner', 'انتخاب مالک')}</option>
                    {data.owners
                      .filter((o) => !o.archived_at && (o.branch_id || '') === form.branch_id)
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.full_name} · {o.phone}
                        </option>
                      ))}
                  </select>
                </FormField>
                {input('plate_number', t('Plate number', 'نمبر پلیت'), {
                  required: true,
                  maxLength: 40,
                })}
                {input('foreign_plate_number', t('Foreign plate', 'پلیت خارجی'))}
                {input('vin_number', t('VIN / chassis number', 'نمبر شاسی'))}
                {input('vehicle_type', t('Vehicle type', 'نوع واسطه'), { required: true })}
                {input('capacity_tons', t('Capacity (tons)', 'ظرفیت (تن)'), {
                  type: 'number',
                  min: '0.01',
                  max: '999999.99',
                  step: '0.01',
                })}
                {input('model_year', t('Model year', 'سال ساخت'), {
                  type: 'number',
                  min: 1950,
                  max: 2100,
                  step: 1,
                })}
                {input('color', t('Color', 'رنگ'))}
                {input('permit_number', t('Road permit number', 'نمبر جواز سیر'))}
                {input('permit_expiry', t('Permit expiry', 'تاریخ ختم جواز'), { type: 'date' })}
              </>
            ) : (
              <>
                {input('full_name', t('Full name', 'نام کامل'), { required: true, maxLength: 160 })}
                {input('father_name', t('Father name', 'نام پدر'))}
                {input('phone', t('Phone number', 'شماره تماس'), {
                  required: true,
                  type: 'tel',
                  maxLength: 40,
                })}
                {input('national_id', t('National ID', 'نمبر تذکره'))}
                {input('address', t('Address', 'آدرس'), { wide: true })}
                {kind === 'owner' &&
                  input('province', t('Province of residence', 'ولایت محل سکونت'))}
              </>
            )}
            {kind !== 'owner' && (
              <FormField label={t('Status', 'وضعیت')}>
                <select
                  value={form.status}
                  onChange={(event) => update('status', event.target.value)}
                >
                  {(kind === 'vehicle'
                    ? ['available', 'assigned', 'on_trip', 'under_repair', 'inactive']
                    : ['available', 'assigned', 'inactive']
                  ).map((status) => (
                    <option key={status} value={status}>
                      {statusText(status, t)}
                    </option>
                  ))}
                </select>
              </FormField>
            )}
            {kind !== 'driver' && input('notes', t('Notes', 'ملاحظات'), { wide: true })}
          </FormSection>
          {(kind === 'driver' || kind === 'owner') && (
            <FormSection title={t('Driver information', 'معلومات راننده')}>
              {kind === 'owner' && !record && (
                <label className="check-field span-full">
                  <input
                    type="checkbox"
                    checked={form.owner_is_driver}
                    onChange={(event) => update('owner_is_driver', event.target.checked)}
                  />
                  {t('Owner is also a driver', 'مالک راننده نیز است')}
                </label>
              )}
              {(kind === 'driver' || form.owner_is_driver) && (
                <>
                  {input('license_number', t('Driving licence', 'نمبر لایسنس'))}
                  {input('license_expiry', t('Licence expiry', 'تاریخ ختم لایسنس'), {
                    type: 'date',
                  })}
                  {kind === 'driver' && profile.role === 'president' && (
                    <FormField
                      label={t(
                        'Link existing driver login (optional)',
                        'اتصال حساب راننده (اختیاری)',
                      )}
                      wide
                    >
                      <select
                        value={form.user_id || ''}
                        onChange={(event) => update('user_id', event.target.value)}
                      >
                        <option value="">{t('No linked account', 'بدون حساب مرتبط')}</option>
                        {data.profiles
                          .filter(
                            (p) => p.account_enabled && (p.branch_id || '') === form.branch_id,
                          )
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.full_name || p.id}
                            </option>
                          ))}
                      </select>
                    </FormField>
                  )}
                </>
              )}
            </FormSection>
          )}
          {record && (
            <FormSection title={t('Record lifecycle', 'مدیریت وضعیت سابقه')}>
              <label className="check-field span-full">
                <input
                  type="checkbox"
                  checked={form.archived}
                  disabled={jobs.length > 0}
                  onChange={(event) => update('archived', event.target.checked)}
                />
                {t('Archive this record', 'بایگانی این سابقه')}
              </label>
              <p className="form-help span-full">
                {t(
                  'Archived records remain in historical bookings. Records in active use cannot be archived.',
                  'سوابق بایگانی در بوکینگ‌های قبلی حفظ می‌شوند. سوابق در حال استفاده قابل بایگانی نیستند.',
                )}
              </p>
            </FormSection>
          )}
        </fieldset>
        {!form.archived && (
          <DocumentPicker
            kind={kind}
            language={language}
            jobs={jobs}
            onChange={setJobs}
            onError={setError}
            disabled={busy || uncertain || Boolean(savedId)}
            expiryDefaults={{ permit: form.permit_expiry, licence: form.license_expiry }}
            registration
            onManage={record ? () => onManageDocuments(record) : undefined}
          />
        )}
        <Notice error={error} language={language} />
        {savedId && jobs.length > 0 && !busy && (
          <div className="document-save-status" role="status">
            <FileText size={20} />
            <span>
              {t(
                'Your record is saved. Some files still need uploading. Keep this form open and retry the remaining files. The record will not be created again.',
                'سابقه ثبت شده است. برخی فایل‌ها هنوز آپلود نشده‌اند. فورم را باز نگه دارید و فایل‌های باقی‌مانده را دوباره آپلود کنید. سابقه دوباره ایجاد نمی‌شود.',
              )}
            </span>
          </div>
        )}
        {uncertain && (
          <p className="form-help">
            {t(
              'Retry sends the same request safely. Close and refresh to check the result before making different changes.',
              'کوشش مجدد همان درخواست را ارسال می‌کند. برای تغییر معلومات ابتدا فورم را بسته و فهرست را تازه کنید.',
            )}
          </p>
        )}
        <FormActions
          busy={busy}
          onClose={savedId ? () => void onSaved() : onClose}
          language={language}
          label={
            savedId
              ? t('Retry remaining uploads', 'آپلود فایل‌های باقی‌مانده')
              : uncertain
                ? t('Retry save', 'کوشش مجدد')
                : jobs.length > 0
                  ? t('Save and upload documents', 'ثبت و آپلود اسناد')
                  : undefined
          }
          busyLabel={
            savedId && jobs.length > 0
              ? t('Uploading documents…', 'در حال آپلود اسناد…')
              : undefined
          }
        />
      </form>
    </Modal>
  )
}

function Documents({ kind, record, language, onClose, highlightId }) {
  const t = (en, fa) => (language === 'fa' ? fa : en)
  const [items, setItems] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [jobs, setJobs] = useState([])
  const [uploadStarted, setUploadStarted] = useState(false)
  const [removing, setRemoving] = useState(null)
  const [editingExpiry, setEditingExpiry] = useState(null)
  const guard = useRef(false)
  const load = useCallback(
    () => rows('vehicle_documents', '*', (query) => query.eq(`${kind}_id`, record.id)),
    [kind, record.id],
  )
  useEffect(() => {
    let active = true
    void load()
      .then((data) => {
        if (active) setItems(data)
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
  }, [load])
  async function upload(event) {
    event.preventDefault()
    if (guard.current || !jobs.length) return
    guard.current = true
    setBusy(true)
    setError(null)
    setUploadStarted(true)
    try {
      for (const job of jobs) {
        await uploadFleetDocument(kind, record.id, job, {
          rpc,
          storage: client().storage.from('fleet-documents'),
        })
        setJobs((current) => current.filter((item) => item.id !== job.id))
      }
      setUploadStarted(false)
    } catch (failure) {
      setError(failure)
    } finally {
      try {
        setItems(await load())
      } catch (failure) {
        setError(failure)
      }
      guard.current = false
      setBusy(false)
    }
  }
  async function remove(item) {
    if (guard.current) return
    guard.current = true
    setBusy(true)
    setError(null)
    try {
      await rpc('remove_fleet_document', { p_id: item.id, p_finish: false })
      const { error: failure } = await client()
        .storage.from('fleet-documents')
        .remove([item.storage_path])
      if (failure) throw failure
      await rpc('remove_fleet_document', { p_id: item.id, p_finish: true })
      setItems(await load())
      setRemoving(null)
    } catch (failure) {
      setError(failure)
    } finally {
      guard.current = false
      setBusy(false)
    }
  }
  async function download(item) {
    setError(null)
    try {
      const { data, error: failure } = await client()
        .storage.from('fleet-documents')
        .download(item.storage_path)
      if (failure) throw failure
      const url = URL.createObjectURL(data)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = item.file_name
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (failure) {
      setError(failure)
    }
  }
  async function saveExpiry(event) {
    event.preventDefault()
    if (guard.current) return
    guard.current = true
    setBusy(true)
    setError(null)
    try {
      await rpc('set_fleet_document_expiry', {
        p_id: editingExpiry.id,
        p_expires: editingExpiry.date || null,
      })
      setItems(await load())
      setEditingExpiry(null)
    } catch (failure) {
      setError(failure)
    } finally {
      guard.current = false
      setBusy(false)
    }
  }
  return (
    <Modal
      title={`${t('Documents', 'اسناد')} · ${record.plate_number || record.full_name}`}
      onClose={onClose}
      busy={busy}
      language={language}
      wide
    >
      <div className="workspace-form">
        <Notice error={error} language={language} />
        {loading ? (
          <Loading language={language} />
        ) : items.length ? (
          <div className="document-list">
            {items.map((item) => (
              <div
                className={`document-row ${highlightId === item.id ? 'search-highlight' : ''}`}
                key={item.id}
              >
                <FileText size={22} />
                <div>
                  <strong>{item.file_name}</strong>
                  <small>
                    {categories[kind].find(([key]) => key === item.document_type)?.[
                      language === 'fa' ? 2 : 1
                    ] || item.document_type}{' '}
                    ·{' '}
                    {item.state === 'pending'
                      ? t('Upload pending', 'در انتظار آپلود')
                      : item.state === 'deleting'
                        ? t('Removal pending', 'در انتظار حذف')
                        : item.expires_on
                          ? `${t('Expires', 'تاریخ ختم')} ${item.expires_on}`
                          : t('No expiry set', 'بدون تاریخ ختم')}
                  </small>
                </div>
                <div className="table-actions">
                  {item.state === 'ready' && (
                    <button
                      className="icon-button"
                      disabled={busy}
                      onClick={() => setEditingExpiry({ id: item.id, date: item.expires_on || '' })}
                      aria-label={t('Edit expiry', 'ویرایش تاریخ ختم')}
                    >
                      <CalendarDays size={17} />
                    </button>
                  )}
                  {item.state === 'ready' && (
                    <button
                      className="icon-button"
                      disabled={busy}
                      onClick={() => download(item)}
                      aria-label={`${t('Download', 'دانلود')} ${item.file_name}`}
                    >
                      <Download size={17} />
                    </button>
                  )}
                  <button
                    className="icon-button danger"
                    disabled={busy}
                    onClick={() => setRemoving(item)}
                    aria-label={`${t('Remove', 'حذف')} ${item.file_name}`}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title={t('No documents yet', 'هنوز سندی موجود نیست')} />
        )}
        {editingExpiry && (
          <form onSubmit={saveExpiry} className="confirm-panel">
            <FormField
              label={t('Document expiry', 'تاریخ ختم سند')}
              type="date"
              value={editingExpiry.date}
              onChange={(event) =>
                setEditingExpiry((current) => ({ ...current, date: event.target.value }))
              }
              disabled={busy}
            />
            <div className="form-actions">
              <button
                type="button"
                className="registry-secondary"
                disabled={busy}
                onClick={() => setEditingExpiry(null)}
              >
                {t('Cancel', 'انصراف')}
              </button>
              <button className="registry-primary" disabled={busy}>
                {t('Save expiry', 'ثبت تاریخ ختم')}
              </button>
            </div>
          </form>
        )}
        {removing && (
          <div className="confirm-panel">
            <strong>{t('Remove this document?', 'این سند حذف شود؟')}</strong>
            <p>{removing.file_name}</p>
            <div className="page-heading-actions">
              <button
                className="registry-secondary"
                disabled={busy}
                onClick={() => setRemoving(null)}
              >
                {t('Keep document', 'حفظ سند')}
              </button>
              <button className="danger-button" disabled={busy} onClick={() => remove(removing)}>
                {t('Remove document', 'حذف سند')}
              </button>
            </div>
          </div>
        )}
        {!record.archived_at && (
          <form onSubmit={upload}>
            <DocumentPicker
              kind={kind}
              language={language}
              jobs={jobs}
              onChange={setJobs}
              onError={setError}
              disabled={busy || (uploadStarted && jobs.length > 0)}
              expiryDefaults={{ permit: record.permit_expiry, licence: record.license_expiry }}
            />
            <div className="form-actions">
              {!!jobs.length && (
                <button
                  className="registry-secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setJobs([])
                    setUploadStarted(false)
                  }}
                >
                  {t('Clear selection', 'پاک‌کردن انتخاب')}
                </button>
              )}
              <button className="registry-primary" disabled={busy || !jobs.length}>
                <Upload size={17} />
                {busy
                  ? t('Uploading…', 'در حال آپلود…')
                  : t('Upload / retry remaining', 'آپلود / کوشش مجدد')}
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  )
}
