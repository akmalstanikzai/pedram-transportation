import { useCallback, useEffect, useRef, useState } from 'react'
import { Building2, Pencil, Plus } from 'lucide-react'
import { invoke, rows, rpc } from '../lib/api'
import { clean, errorCode, normalizeLogin } from '../lib/operations'
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
  name: '',
  province: '',
  city: '',
  address: '',
  phone: '',
  manager_user_id: '',
  manager_name: '',
  manager_phone: '',
  father_name: '',
  national_id: '',
  manager_address: '',
  manager_enabled: true,
  login: '',
  password: '',
  confirm: '',
  archived: false,
}
export default function BranchesPage({ language, profile, action, recordId }) {
  const t = (en, fa) => (language === 'fa' ? fa : en)
  const president = profile.role === 'president'
  const [data, setData] = useState({ branches: [], managers: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)
  const [editor, setEditor] = useState(() =>
    action === 'new' && president ? { record: null, request: crypto.randomUUID() } : null,
  )
  const [archived, setArchived] = useState(action === 'archived')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const load = useCallback(async () => {
    const [branches, managers] = await Promise.all([
      rows(
        'branches',
        '*, manager:profiles!branches_manager_user_id_fkey(id,full_name,phone,username,father_name,national_id,address,account_enabled)',
      ),
      president
        ? rows(
            'profiles',
            'id,full_name,phone,branch_id,account_enabled,username,father_name,national_id,address',
            (q) => q.eq('role', 'branch_manager'),
          )
        : [],
    ])
    return { branches: branches.sort((a, b) => a.name.localeCompare(b.name)), managers }
  }, [president])
  useEffect(() => {
    let active = true
    void load()
      .then((result) => {
        if (active) {
          setData(result)
          if (action === 'view' && recordId) {
            const record = result.branches.find((item) => item.id === recordId)
            if (!record) setError(new Error('ACCESS_DENIED'))
            else {
              setArchived(Boolean(record.archived_at))
              setEditor({ record, request: crypto.randomUUID() })
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
  const filtered = data.branches.filter(
    (branch) =>
      Boolean(branch.archived_at) === archived &&
      `${branch.name} ${branch.city} ${branch.province} ${branch.manager?.full_name || ''}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  )
  const visiblePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / 15)))
  return (
    <>
      <PageHeading
        title={t('Branches', 'شعبات')}
        description={t(
          'Your locations, local contacts and the people responsible.',
          'دفاتر، تماس‌های محلی و مسئولان شعبات.',
        )}
      >
        <RefreshButton loading={loading} onClick={refresh} language={language} />
        {president && (
          <button
            className="registry-primary"
            disabled={loading}
            onClick={() => {
              setSaved(false)
              setEditor({ record: null, request: crypto.randomUUID() })
            }}
          >
            <Plus size={17} />
            {t('Add branch', 'افزودن شعبه')}
          </button>
        )}
      </PageHeading>
      <div className="mini-stats">
        <div>
          <span>{t('Active branches', 'شعبات فعال')}</span>
          <strong>{data.branches.filter((b) => !b.archived_at).length}</strong>
        </div>
        <div>
          <span>{t('Assigned managers', 'مدیران تعیین‌شده')}</span>
          <strong>{data.branches.filter((b) => !b.archived_at && b.manager_user_id).length}</strong>
        </div>
        <div>
          <span>{t('Archived branches', 'شعبات بایگانی')}</span>
          <strong>{data.branches.filter((b) => b.archived_at).length}</strong>
        </div>
      </div>
      <Notice
        error={error}
        message={
          saved ? t('Branch and manager details saved.', 'معلومات شعبه و مدیر ثبت شد.') : null
        }
        language={language}
      />
      <section className="surface-card">
        <div className="table-toolbar">
          <div className="segmented-control">
            <button
              className={!archived ? 'active' : ''}
              onClick={() => {
                setArchived(false)
                setPage(1)
              }}
            >
              {t('Active branches', 'شعبات فعال')}
            </button>
            <button
              className={archived ? 'active' : ''}
              onClick={() => {
                setArchived(true)
                setPage(1)
              }}
            >
              {t('Archived', 'بایگانی')}
            </button>
          </div>
          <SearchBox
            label={t('Search branches…', 'جستجوی شعبات…')}
            value={query}
            onChange={(value) => {
              setQuery(value)
              setPage(1)
            }}
          />
        </div>
        {loading ? (
          <Loading language={language} />
        ) : !filtered.length ? (
          <EmptyState
            title={t('No branches found', 'شعبه‌ای یافت نشد')}
            description={t(
              'Your branch records will appear here.',
              'سوابق شعبات شما اینجا نمایش داده می‌شوند.',
            )}
          />
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('Branch', 'شعبه')}</th>
                  <th>{t('Location', 'موقعیت')}</th>
                  <th>{t('Manager', 'مدیر')}</th>
                  <th>{t('Contact', 'تماس')}</th>
                  <th>{t('Account', 'حساب')}</th>
                  <th>{t('Actions', 'عملیات')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice((visiblePage - 1) * 15, visiblePage * 15).map((branch) => (
                  <tr key={branch.id}>
                    <td>
                      <div className="record-identity">
                        <span className="table-record-icon">
                          <Building2 size={20} />
                        </span>
                        <strong>{branch.name}</strong>
                      </div>
                    </td>
                    <td>
                      <strong>{branch.city}</strong>
                      <small>{branch.province}</small>
                    </td>
                    <td>
                      <strong>{branch.manager?.full_name || '—'}</strong>
                      <small>{branch.manager?.username || '—'}</small>
                    </td>
                    <td>{branch.phone || branch.manager?.phone || '—'}</td>
                    <td>
                      <span
                        className={`status-badge ${branch.archived_at || branch.manager?.account_enabled === false ? 'inactive' : 'available'}`}
                      >
                        {branch.archived_at
                          ? t('Archived', 'بایگانی')
                          : branch.manager?.account_enabled === false
                            ? t('Disabled', 'غیرفعال')
                            : t('Active', 'فعال')}
                      </span>
                    </td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => setEditor({ record: branch, request: crypto.randomUUID() })}
                      >
                        <Pencil size={15} />
                        {president ? t('View / edit', 'مشاهده / ویرایش') : t('Details', 'مشخصات')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          page={visiblePage}
          setPage={setPage}
          count={filtered.length}
          language={language}
        />
      </section>
      {editor && (
        <BranchEditor
          key={editor.request}
          record={editor.record}
          request={editor.request}
          managers={data.managers}
          language={language}
          readOnly={!president}
          onClose={() => setEditor(null)}
          onSaved={committed}
        />
      )}
    </>
  )
}
function BranchEditor({ record, request, managers, language, readOnly, onClose, onSaved }) {
  const t = (en, fa) => (language === 'fa' ? fa : en)
  const [form, setForm] = useState(() => ({
    ...blank,
    ...record,
    manager_user_id: record?.manager_user_id || '',
    manager_name: record?.manager?.full_name || '',
    manager_phone: record?.manager?.phone || '',
    father_name: record?.manager?.father_name || '',
    national_id: record?.manager?.national_id || '',
    manager_address: record?.manager?.address || '',
    manager_enabled: record?.manager?.account_enabled !== false,
    archived: Boolean(record?.archived_at),
  }))
  const [newManager, setNewManager] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [uncertain, setUncertain] = useState(false)
  const guard = useRef(false)
  const submission = useRef(null)
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
    if (guard.current || readOnly) return
    guard.current = true
    setBusy(true)
    setError(null)
    try {
      if (!record || newManager) {
        normalizeLogin(form.login)
        if (form.password !== form.confirm || form.password.length < 8)
          throw new Error('PASSWORD_MISMATCH')
      }
      const {
        password: _password,
        confirm: _confirm,
        login,
        manager: _manager,
        ...details
      } = clean(form)
      if (!record || newManager) {
        submission.current ||= {
          request_id: request,
          ...(record ? { branch_id: record.id, expected_updated_at: record.updated_at } : {}),
          branch: {
            name: details.name,
            province: details.province,
            city: details.city,
            address: details.address,
            phone: details.phone,
            archived: details.archived,
          },
          manager: {
            full_name: details.manager_name,
            phone: details.manager_phone,
            father_name: details.father_name,
            national_id: details.national_id,
            address: details.manager_address,
          },
          credentials: { login, password: form.password },
        }
        await invoke('create-branch-with-manager', submission.current)
      } else {
        submission.current ||= {
          p_id: record.id,
          p_request: request,
          p_data: details,
          p_expected: record.updated_at,
          p_manager: null,
        }
        await rpc('save_branch_record', submission.current)
      }
      await onSaved()
    } catch (failure) {
      setError(failure)
      const unknown = ['UNKNOWN_ERROR', 'NETWORK_ERROR', 'PROVISIONING_REVIEW_REQUIRED'].includes(
        errorCode(failure),
      )
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
          ? `${t('Branch details', 'مشخصات شعبه')} · ${record.name}`
          : t('Add branch & manager', 'افزودن شعبه و مدیر')
      }
      language={language}
      onClose={onClose}
      busy={busy}
      wide
    >
      <form className="workspace-form" onSubmit={save}>
        <fieldset disabled={busy || uncertain || readOnly}>
          <FormSection title={t('Branch information', 'معلومات شعبه')}>
            {input('name', t('Branch name', 'نام شعبه'), { required: true, maxLength: 160 })}
            {input('province', t('Province', 'ولایت'), { required: true })}
            {input('city', t('City / district', 'شهر / ولسوالی'), { required: true })}
            {input('phone', t('Branch phone', 'شماره شعبه'), { type: 'tel' })}
            {input('address', t('Full address', 'آدرس کامل'), { wide: true })}
          </FormSection>
          <FormSection title={t('Branch manager', 'مدیر شعبه')}>
            {record && (
              <label className="check-field span-full">
                <input
                  type="checkbox"
                  checked={newManager}
                  onChange={(event) => {
                    setNewManager(event.target.checked)
                    setForm((current) => ({
                      ...current,
                      manager_name: event.target.checked ? '' : record.manager?.full_name || '',
                      manager_phone: event.target.checked ? '' : record.manager?.phone || '',
                      login: '',
                      password: '',
                      confirm: '',
                    }))
                  }}
                />
                {t('Create a replacement manager account', 'ایجاد حساب مدیر جدید')}
              </label>
            )}
            {record && !newManager && (
              <FormField label={t('Assigned manager', 'مدیر تعیین‌شده')} wide>
                <select
                  value={form.manager_user_id}
                  onChange={(event) => {
                    const selected = managers.find((m) => m.id === event.target.value)
                    setForm((current) => ({
                      ...current,
                      manager_user_id: event.target.value,
                      manager_name: selected?.full_name || '',
                      manager_phone: selected?.phone || '',
                      manager_enabled: selected?.account_enabled !== false,
                      father_name: selected?.father_name || '',
                      national_id: selected?.national_id || '',
                      manager_address: selected?.address || '',
                    }))
                  }}
                >
                  <option value="">{t('No assigned manager', 'بدون مدیر')}</option>
                  {managers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.full_name || m.username}
                    </option>
                  ))}
                </select>
              </FormField>
            )}
            {input('manager_name', t('Full name', 'نام کامل'), { required: !record || newManager })}
            {input('manager_phone', t('Manager phone', 'شماره مدیر'), {
              required: !record || newManager,
              type: 'tel',
            })}
            {input('father_name', t('Father name', 'نام پدر'))}
            {input('national_id', t('National ID', 'نمبر تذکره'))}
            {input('manager_address', t('Home address', 'آدرس خانه'), { wide: true })}
            {record && (
              <label className="check-field span-full">
                <input
                  type="checkbox"
                  checked={form.manager_enabled}
                  onChange={(event) => update('manager_enabled', event.target.checked)}
                />
                {t('Manager account enabled', 'حساب مدیر فعال باشد')}
              </label>
            )}
          </FormSection>
          {(!record || newManager) && (
            <FormSection title={t('Login credentials', 'معلومات ورود')}>
              {input('login', t('Email or username', 'ایمیل یا نام کاربری'), {
                required: true,
                autoComplete: 'off',
                wide: true,
              })}
              {input('password', t('Password', 'رمز عبور'), {
                required: true,
                type: 'password',
                minLength: 8,
                autoComplete: 'new-password',
              })}
              {input('confirm', t('Confirm password', 'تکرار رمز عبور'), {
                required: true,
                type: 'password',
                minLength: 8,
                autoComplete: 'new-password',
              })}
              <p className="form-help span-full">
                {t(
                  'Usernames use 3–64 English letters, digits, dots, hyphens or underscores. The login is not silently changed.',
                  'نام کاربری از 3 تا 64 حرف انگلیسی، عدد، نقطه، خط تیره یا زیرخط تشکیل شود.',
                )}
              </p>
            </FormSection>
          )}
          {record && (
            <FormSection title={t('Branch lifecycle', 'مدیریت وضعیت شعبه')}>
              <label className="check-field span-full">
                <input
                  type="checkbox"
                  checked={form.archived}
                  onChange={(event) => update('archived', event.target.checked)}
                />
                {t('Archive this branch', 'بایگانی این شعبه')}
              </label>
              <p className="form-help span-full">
                {t(
                  'Archiving retains historical records and disables the manager. Active bookings must be resolved first.',
                  'بایگانی سوابق را حفظ و حساب مدیر را غیرفعال می‌کند. بوکینگ‌های فعال باید ابتدا تعیین تکلیف شوند.',
                )}
              </p>
            </FormSection>
          )}
        </fieldset>
        <Notice error={error} language={language} />
        {uncertain && (
          <p className="form-help">
            {t(
              'Retry the same request safely, or close and refresh before changing details.',
              'همان درخواست را دوباره ارسال کنید یا پیش از تغییر معلومات، فهرست را تازه کنید.',
            )}
          </p>
        )}
        {!readOnly && (
          <FormActions
            busy={busy}
            onClose={onClose}
            language={language}
            label={
              uncertain
                ? t('Retry save', 'کوشش مجدد')
                : record
                  ? undefined
                  : t('Create branch & account', 'ایجاد شعبه و حساب')
            }
          />
        )}
      </form>
    </Modal>
  )
}
