import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, RefreshCw, Search, Stamp, WalletCards } from 'lucide-react'
import CustomsAgentAccount from '../components/CustomsAgentAccount'
import CompactTable from '../components/CompactTable'
import CustomsAgentFields from '../components/CustomsAgentFields'
import { IconButton, Modal, RecordTools } from '../components/RecordTools'
import { getTranslation } from '../lib/i18n'
import { explain } from '../lib/operations'
import { customsAgentFields, customsAgentFileTypes, customsAgentForm, latestCustomsAgentFiles, persistCustomsAgent } from '../lib/customsAgentForm'
import { loadCustomsAgents, saveCustomsAgent, uploadCustomsAgentFile, customsAgentFileUrl } from '../lib/customsAgents'

function AgentDetails({ row, language, onView }) {
  const t = (en, fa) => language === 'fa' ? fa : en
  const files = latestCustomsAgentFiles(row.customs_agent_files)
  return <div className="record-modal-body">
    {[customsAgentFields.slice(0, 3), customsAgentFields.slice(3)].map(group => <dl className="customs-information-grid" key={group[0][0]}>
      {group.map(([key, en, fa]) => <div key={key}><dt>{t(en, fa)}</dt>
        <dd>{key === 'phone' ? <bdi dir="ltr">{row[key]}</bdi> : row[key] || '—'}</dd></div>)}
    </dl>)}
    <div className="customs-saved-documents">
      {customsAgentFileTypes.map(([type, en, fa]) => {
        const file = files.find(item => item.document_type === type)
        return <div key={type}>
          <strong>{t(en, fa)}</strong>
          {file
            ? <button type="button" className="employee-existing-file" onClick={() => onView(file)}>{file.file_name}</button>
            : <small>{t('No file uploaded', 'فایل آپلود نشده است')}</small>}
        </div>
      })}
    </div>
  </div>
}

export default function CustomsPage({ language, profile }) {
  const text = getTranslation(language)
  const t = (en, fa) => language === 'fa' ? fa : en
  const allowed = profile?.role === 'president' && profile.account_enabled !== false
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [form, setForm] = useState(() => customsAgentForm())
  const [files, setFiles] = useState({})
  const [editing, setEditing] = useState(null)
  const [open, setOpen] = useState(false)
  const [details, setDetails] = useState(null)
  const [account, setAccount] = useState(null)
  const [accountBusy, setAccountBusy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)
  const progress = useRef({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await loadCustomsAgents())
      setError(null)
    } catch (failure) {
      setError(failure)
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { if (allowed) void Promise.resolve().then(load) }, [allowed, load])
  if (!allowed) return null

  function start(row = null) {
    progress.current = {}
    setEditing(row)
    setForm(customsAgentForm(row))
    setFiles({})
    setSaved(false)
    setError(null)
    setOpen(true)
  }

  function closeForm() {
    setOpen(false)
    setError(null)
    if (progress.current.saved) void load()
  }

  async function save(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await persistCustomsAgent(progress.current, {
        form, files,
        saveRecord: (id, payload) => saveCustomsAgent(editing?.id || id, payload, editing?.updated_at),
        uploadFile: uploadCustomsAgentFile,
        onSaved: () => setSaved(true),
      })
      setOpen(false)
      await load()
    } catch (failure) {
      setError(failure)
    } finally {
      setBusy(false)
    }
  }

  async function viewFile(file) {
    setError(null)
    const popup = window.open('', '_blank')
    if (!popup) {
      setError(new Error('POPUP_BLOCKED'))
      return
    }
    popup.opener = null
    try {
      popup.location.replace(await customsAgentFileUrl(file))
    } catch (failure) {
      popup.close()
      setError(failure)
    }
  }

  const search = query.trim().toLocaleLowerCase()
  const filtered = rows.filter(row => customsAgentFields.some(([key]) => row[key].toLocaleLowerCase().includes(search)))
  let message = error ? explain(error, language) : ''
  if (['42P01', 'PGRST202', 'PGRST205'].includes(error?.code)) {
    message = t('The Customs register has not been set up yet.', 'دفتر گمرک هنوز تنظیم نشده است.')
  }
  if (error?.message === 'POPUP_BLOCKED') {
    message = t('Allow pop-ups to open the document.', 'برای دیدن سند، اجازه باز شدن پنجره جدید را بدهید.')
  }

  return <section className="registry-page customs-page" aria-labelledby="customs-title">
    <div className="booking-page-header customs-page-heading">
      <div className="customs-title">
        <span className="module-card-icon cyan"><Stamp size={30} strokeWidth={1.8} aria-hidden="true" /></span>
        <div><h1 id="customs-title">{text.customs}</h1><p>{t('Commission agents', 'کمیشن کاران')}</p></div>
      </div>
      <button type="button" className="registry-primary" disabled={loading || busy} onClick={() => start()}>
        <Plus size={18} />{t('Add commission agent', 'افزودن کمیشن کار')}
      </button>
    </div>
    <div className="registry-toolbar customs-toolbar">
      <label className="registry-search"><Search size={18} />
        <input aria-label={t('Search commission agents', 'جستجوی کمیشن کاران')} placeholder={t('Search name, mobile or location', 'جستجوی نام، موبایل یا محل')}
          value={query} onChange={event => setQuery(event.target.value)} />
      </label>
      <button type="button" className="registry-secondary" disabled={loading || busy} onClick={load}>
        <RefreshCw size={17} />{t('Refresh', 'تازه‌سازی')}
      </button>
    </div>
    {message && !open && !details && <p className="registry-notice error" role="alert">{message}</p>}
    {loading && <div className="empty-state" role="status"><span className="spinner dark" /><p>{t('Loading commission agents…', 'در حال بارگیری کمیشن کاران…')}</p></div>}
    {!loading && filtered.length > 0 && <CompactTable label={t('Commission agents', 'کمیشن کاران')} columns={[
      { label: t('Name / mobile', 'نام / موبایل') },
      { label: t('Location', 'موقعیت') },
      { label: t('Actions', 'عملیات'), width: '29%' },
    ]}>
      {filtered.map(row => <tr key={row.id}>
        <th scope="row"><strong>{row.name}</strong>
          {row.father_name && <small>{t('Father', 'پدر')} · {row.father_name}</small>}
          <small><bdi dir="ltr">{row.phone}</bdi></small>
        </th>
        <td>{[row.province, row.district, row.village].filter(Boolean).join(' · ') || '—'}</td>
        <td><div className="compact-table-actions">
          <IconButton icon={WalletCards} label={t('Fees & payments', 'حق‌الزحمه و پرداخت‌ها')} onClick={() => setAccount(row)} />
          <RecordTools language={language} onView={() => { setError(null); setDetails(row) }} onEdit={() => start(row)} />
        </div></td>
      </tr>)}
    </CompactTable>}
    {!loading && !message && !filtered.length && <div className="empty-state customs-empty-state">
      <Stamp size={28} aria-hidden="true" />
      <h2>{search ? t('No matching commission agents', 'کمیشن کار مطابق یافت نشد') : t('No commission agents yet', 'هنوز کمیشن کار ثبت نشده است')}</h2>
    </div>}
    {open && <Modal title={editing ? t('Edit commission agent', 'ویرایش کمیشن کار') : t('Add commission agent', 'افزودن کمیشن کار')}
      busy={busy} onClose={closeForm} className="customs-agent-modal">
      <form className="registry-form customs-agent-form" onSubmit={save}>
        <fieldset className="customs-agent-fields" disabled={busy || saved}>
          <CustomsAgentFields language={language} form={form} onChange={setForm} files={files} onFilesChange={setFiles}
            existing={editing?.customs_agent_files} onView={viewFile} />
        </fieldset>
        {saved && message && <p className="booking-help">{t('Information is saved. Retry to finish the remaining uploads.', 'معلومات ثبت شد. برای تکمیل آپلود اسناد باقی‌مانده دوباره کوشش کنید.')}</p>}
        {message && <p className="registry-notice error" role="alert">{message}</p>}
        <div className="registry-form-actions">
          <button type="button" disabled={busy} onClick={closeForm}>{t('Cancel', 'انصراف')}</button>
          <button className="registry-primary" disabled={busy}>
            {busy ? t('Saving…', 'در حال ثبت…') : saved ? t('Finish uploads', 'تکمیل آپلودها') : t('Save', 'ثبت')}
          </button>
        </div>
      </form>
    </Modal>}
    {details && <Modal title={t('Commission agent details', 'معلومات کمیشن کار')} onClose={() => { setError(null); setDetails(null) }}>
      <AgentDetails row={details} language={language} onView={viewFile} />
      {message && <p className="registry-notice error" role="alert">{message}</p>}
      <div className="record-modal-body customs-profile-account">
        <button type="button" className="registry-secondary" onClick={() => { setAccount(details); setDetails(null); setError(null) }}>
          <WalletCards size={17} />{t('Fees & payments', 'حق‌الزحمه و پرداخت‌ها')}
        </button>
      </div>
    </Modal>}
    {account && <Modal title={`${account.name} · ${t('Fees & payments', 'حق‌الزحمه و پرداخت‌ها')}`}
      busy={accountBusy} onClose={() => setAccount(null)}>
      <CustomsAgentAccount key={account.id} agent={account} language={language} onBusyChange={setAccountBusy} />
    </Modal>}
  </section>
}
