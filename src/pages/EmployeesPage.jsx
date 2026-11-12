import { useCallback, useEffect, useState } from 'react'
import { Archive, Plus, Search, UsersRound, WalletCards } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatSolarHijri } from '../lib/solarHijri'
import { ConfirmArchive, IconButton, Modal, RecordTools } from '../components/RecordTools'

const fields = [
  ['first_name', 'Name', 'نام'],
  ['last_name', 'Last name', 'تخلص'],
  ['phone', 'Phone number', 'شماره تماس'],
  ['province', 'Province', 'ولایت'],
  ['district', 'District', 'ولسوالی'],
  ['village', 'Village', 'قریه'],
  ['salary', 'Salary (AFN)', 'معاش (افغانی)'],
]
const emptyForm = { first_name: '', last_name: '', phone: '', province: '', district: '', village: '', salary: '' }

export default function EmployeesPage({ language, profile }) {
  const t = (en, fa) => language === 'fa' ? fa : en
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [archived, setArchived] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [editing, setEditing] = useState(null)
  const [open, setOpen] = useState(false)
  const [deletion, setDeletion] = useState(null)
  const [statement, setStatement] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [statementLoading, setStatementLoading] = useState(false)
  const [statementError, setStatementError] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase.from('employees').select('*').order('created_at', { ascending: false })
    setLoading(false)
    if (loadError) setError(loadError.message)
    else { setRows(data || []); setError('') }
  }, [])
  useEffect(() => { if (profile?.role === 'president') void Promise.resolve().then(load) }, [load, profile?.role])
  if (profile?.role !== 'president' || profile.account_enabled === false) return null

  function start(row = null) {
    setEditing(row)
    setForm(row ? Object.fromEntries(fields.map(([key]) => [key, String(row[key] ?? '')])) : emptyForm)
    setError('')
    setOpen(true)
  }
  async function save(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const payload = Object.fromEntries(fields.map(([key]) => [key, key === 'salary' ? Number(form[key]) : form[key].trim()]))
    const result = editing
      ? await supabase.from('employees').update(payload).eq('id', editing.id).eq('updated_at', editing.updated_at).select('id')
      : await supabase.from('employees').insert(payload).select('id')
    setBusy(false)
    if (result.error) return setError(result.error.message)
    if (editing && !result.data?.length) return setError(t('This employee changed. Close and reopen the form to try again.', 'معلومات این کارمند تغییر کرده است. فورم را بسته و دوباره باز کنید.'))
    setOpen(false)
    await load()
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
  async function showTransactions(row) {
    setStatement(row)
    setTransactions([])
    setStatementError('')
    setStatementLoading(true)
    const { data, error: loadError } = await supabase.rpc('employee_cashbook_transactions', { p_employee: row.id })
    setStatementLoading(false)
    if (loadError) setStatementError(loadError.message)
    else setTransactions(data || [])
  }
  const visible = rows.filter(row => Boolean(row.archived_at) === archived && `${row.first_name} ${row.last_name} ${row.phone} ${row.province} ${row.district} ${row.village}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  return <div className="registry-page employees-page">
    <div className="booking-page-header"><h1>{t('Employees', 'کارمندان')}</h1><button className="registry-primary" onClick={() => start()}><Plus size={18} />{t('Add employee', 'افزودن کارمند')}</button></div>
    <div className="registry-toolbar"><label className="registry-search"><Search size={18} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder={t('Search employees', 'جستجوی کارمندان')} aria-label={t('Search employees', 'جستجوی کارمندان')} /></label><button className="registry-secondary" aria-pressed={archived} onClick={() => setArchived(!archived)}><Archive size={18} />{t('Archive', 'بایگانی')}</button></div>
    {error && !open && !deletion && <p className="registry-notice error" role="alert">{error}</p>}
    {loading ? <div className="empty-state"><span className="spinner dark" /></div> : visible.length ? <div className="record-list">{visible.map(row => <article className="record-row" key={row.id}><UsersRound size={22} /><div className="record-row-main"><strong>{row.first_name} {row.last_name}</strong><small>{row.phone} · {row.province}, {row.district}, {row.village}</small></div><strong className="employee-salary">{Number(row.salary).toLocaleString(language === 'fa' ? 'fa-AF' : 'en-US')} AFN</strong><IconButton icon={WalletCards} label={t('Transactions', 'معاملات')} onClick={() => showTransactions(row)} disabled={busy} /><RecordTools language={language} archived={row.archived_at} disabled={busy} onEdit={() => start(row)} onArchive={() => { setError(''); setDeletion(row) }} /></article>)}</div> : <div className="empty-state"><UsersRound size={28} /><h2>{archived ? t('No archived employees', 'کارمند بایگانی شده وجود ندارد') : t('No employees found', 'کارمندی یافت نشد')}</h2></div>}
    {open && <Modal title={editing ? t('Edit employee', 'ویرایش کارمند') : t('Add employee', 'افزودن کارمند')} busy={busy} onClose={() => setOpen(false)}><form className="registry-form" onSubmit={save}><fieldset disabled={busy} className="booking-fields wide">{fields.map(([key, en, fa]) => <label key={key}><span>{t(en, fa)} *</span><input required type={key === 'salary' ? 'number' : key === 'phone' ? 'tel' : 'text'} min={key === 'salary' ? '0' : undefined} step={key === 'salary' ? '0.01' : undefined} value={form[key]} onChange={event => setForm(current => ({ ...current, [key]: event.target.value }))} /></label>)}</fieldset>{error && <p className="wide registry-notice error" role="alert">{error}</p>}<div className="registry-form-actions"><button type="button" disabled={busy} onClick={() => setOpen(false)}>{t('Cancel', 'انصراف')}</button><button className="registry-primary" disabled={busy}>{busy ? <span className="spinner" /> : t('Save', 'ثبت')}</button></div></form></Modal>}
    {statement && <Modal title={`${statement.first_name} ${statement.last_name} · ${t('Transactions', 'معاملات')}`} onClose={() => setStatement(null)}><div className="record-modal-body">{statementLoading ? <p role="status">{t('Loading…', 'در حال بارگیری…')}</p> : statementError ? <p className="registry-notice error" role="alert">{statementError}</p> : transactions.length ? <div className="employee-transactions">{transactions.map(item => <article key={item.id}><div><strong>#{item.receipt_number} · {formatSolarHijri(item.date)}</strong><span>{item.branch} · {item.currency}</span></div><p>{item.description}</p><strong className={item.direction === 'out' ? 'simple-money-out' : 'simple-money-in'}>{item.direction === 'out' ? '−' : '+'}{Number(item.amount).toLocaleString(language === 'fa' ? 'fa-AF' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {item.currency}</strong>{item.reversed_by && <small>{t('Reversed by', 'اصلاح‌شده با')} #{item.reversed_by}</small>}{item.reversal && <small>{t('Reversal', 'معامله معکوس')}</small>}</article>)}</div> : <p>{t('No transactions for this employee yet.', 'هنوز معامله‌ای برای این کارمند ثبت نشده است.')}</p>}</div></Modal>}
    {deletion && <ConfirmArchive language={language} busy={busy} error={error} restore={Boolean(deletion.archived_at)} onClose={() => setDeletion(null)} onConfirm={toggleArchive} />}
  </div>
}
