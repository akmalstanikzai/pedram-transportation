import { useCallback, useEffect, useRef, useState } from 'react'
import { Archive, Plus, ReceiptText, Search, UsersRound, WalletCards } from 'lucide-react'
import { supabase } from '../lib/supabase'
import EmployeeRegistrationFields from '../components/EmployeeRegistrationFields'
import CompactTable from '../components/CompactTable'
import Icon from '../components/Icon'
import './EmployeesPage.css'
import { uploadEmployeeFile } from '../lib/employeeFiles'
import { persistEmployee, employeeFields as fields, validateEmployeeFiles } from '../lib/employeeSave'
import { explain } from '../lib/operations'
import EmployeePayroll from '../components/EmployeePayroll'
import PersonTransactions from '../components/PersonTransactions'
import { ConfirmArchive, Modal, RecordTools } from '../components/RecordTools'

const emptyForm = Object.fromEntries(fields.map(([key]) => [key, '']))

async function archiveEmployee(row, archived) {
  const {data,error} = await supabase.from('employees')
    .update({ archived_at:archived ? new Date().toISOString() : null })
    .eq('id',row.id).eq('updated_at',row.updated_at).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('STALE_RECORD')
}

export default function EmployeesPage({ language, profile, onBack }) {
  const t = (en, fa) => language === 'fa' ? fa : en
  const transactionsLabel = t('Transactions', 'معاملات')
  const [payroll, setPayroll] = useState(false)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [archived, setArchived] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [editing, setEditing] = useState(null)
  const [open, setOpen] = useState(false)
  const [files, setFiles] = useState({})
  const [saved, setSaved] = useState(false)
  const progress = useRef({})
  const [deletion, setDeletion] = useState(null)
  const [statement, setStatement] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase.from('employees').select('*, employee_files(*)').order('created_at', { ascending: false })
    setLoading(false)
    if (loadError) setError(loadError.message)
    else { setRows(data || []); setError('') }
  }, [])
  useEffect(() => { if (profile?.role === 'president') void Promise.resolve().then(load) }, [load, profile?.role])
  if (profile?.role !== 'president' || profile.account_enabled === false) return null

  function start(row = null) {
    progress.current = {}
    setFiles({})
    setSaved(false)
    setEditing(row)
    setForm(row ? Object.fromEntries(fields.map(([key]) => [key, String(row[key] ?? '')])) : emptyForm)
    setError('')
    setOpen(true)
  }
  async function save(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    const payload = Object.fromEntries(fields.map(([key]) => [key, key === 'salary' ? Number(form[key]) : form[key].trim()]))
    try {
      await persistEmployee(progress.current, {
        payload, files, validateFiles: validateEmployeeFiles, uploadFile: uploadEmployeeFile,
        saveRecord: async (id, values) => {
          const result = editing
            ? await supabase.from('employees').update(values).eq('id', editing.id).eq('updated_at', editing.updated_at).select('*')
            : await supabase.from('employees').upsert({id,...values}, {onConflict:'id',ignoreDuplicates:true}).select('*')
          if (result.error) throw result.error
          if (editing && !result.data?.length) throw new Error('STALE_RECORD')
          if (result.data?.[0]) return result.data[0]
          const prior = await supabase.from('employees').select('*').eq('id', id).single()
          if (prior.error) throw prior.error
          return prior.data
        },
        onSaved: row => { setSaved(true); setForm(Object.fromEntries(fields.map(([key]) => [key,String(row[key] ?? '')]))) },
      })
      setOpen(false)
      await load()
    } catch (failure) { setError(explain(failure, language)) }
    finally { setBusy(false) }
  }
  function closeForm() {
    setOpen(false)
    if (progress.current.saved) void load()
  }
  async function viewFile(file) {
    setError('')
    const popup = window.open('', '_blank')
    if (!popup) { setError(t('Allow pop-ups to view the file.', 'برای دیدن فایل، پنجرهٔ جدید را اجازه دهید.')); return }
    popup.opener = null
    try {
      const {data,error:signError} = await supabase.storage.from('employee-files').createSignedUrl(file.storage_path, 120)
      if (signError) throw signError
      popup.location.replace(data.signedUrl)
    } catch (failure) { popup.close(); setError(explain(failure, language)) }
  }
  async function toggleArchive() {
    setBusy(true)
    setError('')
    try {
      await archiveEmployee(deletion,!deletion.archived_at)
      setDeletion(null)
      await load()
    } catch (error) { setError(explain(error,language)) }
    finally { setBusy(false) }
  }
  const visible = rows.filter(row => Boolean(row.archived_at) === archived && `${row.first_name} ${row.last_name} ${row.occupation || ''} ${row.phone} ${row.province} ${row.district} ${row.village}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  return <div className="registry-page employees-page">
    <header className="employees-heading">
      {onBack && <button type="button" className="module-back" onClick={onBack}><Icon name="back" size={16}/>{t('Back','بازگشت')}</button>}
      <h1>{t('Employees','کارمندان')}</h1>
    </header>
    <nav className="employee-view-switch" aria-label={t('Employee views','بخش‌های کارمندان')}>
      <button type="button" aria-pressed={!payroll} onClick={()=>setPayroll(false)}><UsersRound size={16}/>{t('Employee list','فهرست کارمندان')}</button>
      <button type="button" aria-pressed={payroll} onClick={()=>setPayroll(true)}><WalletCards size={16}/>{t('Monthly payroll','معاش ماهانه')}</button>
    </nav>
    {payroll ? <EmployeePayroll language={language}/> : <>
    <div className="registry-toolbar employee-tools">
      <label className="registry-search"><Search size={16}/><input type="search" value={query} onChange={event=>setQuery(event.target.value)}
        placeholder={t('Search employees','جستجوی کارمندان')} aria-label={t('Search employees','جستجوی کارمندان')}/></label>
      <button type="button" className="registry-secondary employee-archive" aria-pressed={archived} aria-label={t('Archive','بایگانی')} title={t('Archive','بایگانی')} onClick={()=>setArchived(!archived)}><Archive size={16}/><span>{t('Archive','بایگانی')}</span></button>
      <button type="button" className="registry-primary" onClick={()=>start()}><Plus size={16}/>{t('Add employee','افزودن کارمند')}</button>
    </div>
    {error && !open && !deletion && <p className="registry-notice error" role="alert">{error}</p>}
    {loading ? <div className="empty-state"><span className="spinner dark" /></div> : visible.length ? <CompactTable key={String(archived)} className="employee-directory" bulk={{
      language, rows:visible, disabled:busy, refresh:load, name:row=>[row.first_name,row.last_name].filter(Boolean).join(' '),
      actions:[{label:archived?t('Restore selected','بازیابی انتخاب‌شده‌ها'):t('Archive selected','بایگانی انتخاب‌شده‌ها'),run:row=>archiveEmployee(row,!archived)}],
    }} label={t('Employees', 'کارمندان')} columns={[
      { label: t('Employee / contact', 'کارمند / تماس') },
      { label: t('Occupation / salary', 'وظیفه / معاش') },
      { label: t('Actions', 'عملیات'), width: '39%' },
    ]}>{visible.map(row => <tr key={row.id}>
      <th scope="row"><strong>{row.first_name} {row.last_name}</strong><small><bdi dir="ltr">{row.phone}</bdi></small>
        <small>{[row.province, row.district, row.village].filter(Boolean).join(' · ')}</small>
      </th>
      <td>{row.occupation && <strong>{row.occupation}</strong>}
        <small><bdi>{Number(row.salary).toLocaleString(language === 'fa' ? 'fa-AF' : 'en-US')} AFN</bdi></small>
      </td>
      <td><div className="compact-table-actions">
        <button type="button" className="record-icon-button employee-transactions-button" title={transactionsLabel}
          aria-label={transactionsLabel} onClick={() => setStatement(row)} disabled={busy}>
          <ReceiptText size={17} aria-hidden="true" />
          <span className="employee-transactions-label" aria-hidden="true">{transactionsLabel}</span>
        </button>
        <RecordTools language={language} archived={row.archived_at} disabled={busy} onEdit={() => start(row)} onArchive={() => { setError(''); setDeletion(row) }} />
      </div></td>
    </tr>)}</CompactTable> : <div className="empty-state"><UsersRound size={28} /><h2>{archived ? t('No archived employees', 'کارمند بایگانی شده وجود ندارد') : t('No employees found', 'کارمندی یافت نشد')}</h2></div>}
    {open && <Modal title={editing ? t('Edit employee', 'ویرایش کارمند') : t('Add employee', 'افزودن کارمند')} busy={busy} onClose={closeForm} className="registration-form-card"><form className="registration-form employee-registration-form" onSubmit={save}><fieldset disabled={busy || saved} className="registration-fieldset"><EmployeeRegistrationFields language={language} form={form} onChange={setForm} files={files} onFilesChange={setFiles} existing={editing?.employee_files || []} onView={viewFile}/></fieldset>{saved && error && <p className="wide booking-help">{t('Employee information is saved. Retry to finish the remaining uploads.','معلومات کارمند ثبت شد. برای تکمیل آپلودهای باقی‌مانده دوباره کوشش کنید.')}</p>}{error && <p className="wide registry-notice error" role="alert">{error}</p>}<div className="registry-form-actions registration-actions"><button type="button" disabled={busy} onClick={closeForm}>{t('Cancel', 'انصراف')}</button><button className="registry-primary" disabled={busy}>{busy ? <span className="spinner" /> : saved ? t('Finish uploads', 'تکمیل آپلودها') : t('Save', 'ثبت')}</button></div></form></Modal>}
    {statement && <PersonTransactions key={statement.id} person={statement} kind="employee" language={language} onClose={() => setStatement(null)} />}
    {deletion && <ConfirmArchive language={language} busy={busy} error={error} restore={Boolean(deletion.archived_at)} onClose={() => setDeletion(null)} onConfirm={toggleArchive} />}
    </>}
  </div>
}
