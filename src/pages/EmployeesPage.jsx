import { useCallback, useEffect, useRef, useState } from 'react'
import { Archive, Plus, Search, UsersRound, WalletCards } from 'lucide-react'
import { supabase } from '../lib/supabase'
import EmployeeRegistrationFields from '../components/EmployeeRegistrationFields'
import { uploadEmployeeFile } from '../lib/employeeFiles'
import { persistEmployee, employeeFields as fields, validateEmployeeFiles } from '../lib/employeeSave'
import { explain } from '../lib/operations'
import EmployeePayroll from '../components/EmployeePayroll'
import PersonTransactions from '../components/PersonTransactions'
import { ConfirmArchive, IconButton, Modal, RecordTools } from '../components/RecordTools'

const emptyForm = Object.fromEntries(fields.map(([key]) => [key, '']))

export default function EmployeesPage({ language, profile }) {
  const t = (en, fa) => language === 'fa' ? fa : en
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
    const { data, error: updateError } = await supabase.from('employees')
      .update({ archived_at: deletion.archived_at ? null : new Date().toISOString() })
      .eq('id', deletion.id).eq('updated_at', deletion.updated_at).select('id')
    setBusy(false)
    if (updateError) return setError(updateError.message)
    if (!data?.length) return setError(t('This employee changed. Close and reopen to try again.', 'معلومات این کارمند تغییر کرده است. دوباره باز کنید.'))
    setDeletion(null)
    await load()
  }
  const visible = rows.filter(row => Boolean(row.archived_at) === archived && `${row.first_name} ${row.last_name} ${row.phone} ${row.province} ${row.district} ${row.village}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  return <div className="registry-page employees-page">
    <div className="booking-page-header"><h1>{payroll ? t('Monthly payroll', 'معاش ماهانه') : t('Employees', 'کارمندان')}</h1><div className="payroll-actions"><button className="registry-secondary" onClick={() => setPayroll(!payroll)}>{payroll ? t('Employees', 'کارمندان') : t('Monthly payroll', 'معاش ماهانه')}</button>{!payroll && <button className="registry-primary" onClick={() => start()}><Plus size={18} />{t('Add employee', 'افزودن کارمند')}</button>}</div></div>
    {payroll ? <EmployeePayroll language={language}/> : <>
    <div className="registry-toolbar"><label className="registry-search"><Search size={18} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder={t('Search employees', 'جستجوی کارمندان')} aria-label={t('Search employees', 'جستجوی کارمندان')} /></label><button className="registry-secondary" aria-pressed={archived} onClick={() => setArchived(!archived)}><Archive size={18} />{t('Archive', 'بایگانی')}</button></div>
    {error && !open && !deletion && <p className="registry-notice error" role="alert">{error}</p>}
    {loading ? <div className="empty-state"><span className="spinner dark" /></div> : visible.length ? <div className="record-list">{visible.map(row => <article className="record-row" key={row.id}><UsersRound size={22} /><div className="record-row-main"><strong>{row.first_name} {row.last_name}</strong><small>{row.phone} · {row.province}, {row.district}, {row.village}</small></div><strong className="employee-salary">{Number(row.salary).toLocaleString(language === 'fa' ? 'fa-AF' : 'en-US')} AFN</strong><IconButton icon={WalletCards} label={t('Transactions', 'معاملات')} onClick={() => setStatement(row)} disabled={busy} /><RecordTools language={language} archived={row.archived_at} disabled={busy} onEdit={() => start(row)} onArchive={() => { setError(''); setDeletion(row) }} /></article>)}</div> : <div className="empty-state"><UsersRound size={28} /><h2>{archived ? t('No archived employees', 'کارمند بایگانی شده وجود ندارد') : t('No employees found', 'کارمندی یافت نشد')}</h2></div>}
    {open && <Modal title={editing ? t('Edit employee', 'ویرایش کارمند') : t('Add employee', 'افزودن کارمند')} busy={busy} onClose={closeForm}><form className="registry-form employee-registration-form" onSubmit={save}><fieldset disabled={busy || saved} className="booking-fields wide"><EmployeeRegistrationFields language={language} form={form} onChange={setForm} files={files} onFilesChange={setFiles} existing={editing?.employee_files || []} onView={viewFile}/></fieldset>{saved && error && <p className="wide booking-help">{t('Employee information is saved. Retry to finish the remaining uploads.','معلومات کارمند ثبت شد. برای تکمیل آپلودهای باقی‌مانده دوباره کوشش کنید.')}</p>}{error && <p className="wide registry-notice error" role="alert">{error}</p>}<div className="registry-form-actions"><button type="button" disabled={busy} onClick={closeForm}>{t('Cancel', 'انصراف')}</button><button className="registry-primary" disabled={busy}>{busy ? <span className="spinner" /> : saved ? t('Finish uploads', 'تکمیل آپلودها') : t('Save', 'ثبت')}</button></div></form></Modal>}
    {statement && <PersonTransactions key={statement.id} person={statement} kind="employee" language={language} onClose={() => setStatement(null)} />}
    {deletion && <ConfirmArchive language={language} busy={busy} error={error} restore={Boolean(deletion.archived_at)} onClose={() => setDeletion(null)} onConfirm={toggleArchive} />}
    </>}
  </div>
}
