import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, Printer, RefreshCw } from 'lucide-react'
import { allRows, cents, currencies, kabulToday } from '../lib/cashbook'
import { customsAgentReport, customsPaymentAccount, customsPaymentStatus, customsStatementView } from '../lib/customsAgentStatement'
import { cashbookReceipt, reportMoney } from '../lib/financialReports'
import { explain, rpc } from '../lib/operations'
import { printRecord } from '../lib/recordExports'
import { formatSolarHijri } from '../lib/solarHijri'
import { supabase } from '../lib/supabase'
import SolarHijriDateInput from './SolarHijriDateInput'

export default function CustomsAgentAccount({ agent, language, initialAccount = '', onPayment, onBusyChange }) {
  const t = (en, fa) => language === 'fa' ? fa : en
  const [data, setData] = useState(null)
  const [lookups, setLookups] = useState(null)
  const [filters, setFilters] = useState({ start: '', end: '', currency: '' })
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState('')
  const saving = useRef(false)
  const [pending, setPending] = useState(null)
  const validRange = !filters.start || !filters.end || filters.start <= filters.end

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [statement, branches, bookings] = await Promise.all([
        rpc('customs_agent_statement', { p_agent: agent.id }),
        allRows(supabase, 'branches', 'id,name,archived_at', 'id'),
        allRows(supabase, 'bookings', 'id,booking_number,origin,destination,deleted_at', 'id'),
      ])
      setData(statement)
      setLookups({ branches: branches.filter(row => !row.archived_at), bookings: bookings.filter(row => !row.deleted_at)
        .sort((a, b) => b.booking_number - a.booking_number) })
    } catch (failure) {
      setError(failure)
    } finally {
      setLoading(false)
    }
  }, [agent.id])
  useEffect(() => { void Promise.resolve().then(load) }, [load])

  const view = data && customsStatementView(data, filters)
  const updateForm = (key, value) => setForm(current => ({ ...current, [key]: value }))
  const updateFilter = (key, value) => setFilters(current => ({ ...current, [key]: value }))
  const showMoney = (amount, currency) => reportMoney(cents(amount), currency)

  function begin(fee = null) {
    setPending(null)
    setError(null)
    setNotice('')
    const branch = initialAccount === 'admin' || lookups.branches.some(row => row.id === initialAccount) ? initialAccount : ''
    setForm({ fee, date: kabulToday(), branch, currency: fee?.currency || 'AFN',
      booking: '', amount: fee ? String(fee.remaining) : '', description: '' })
  }

  async function save(event) {
    event.preventDefault()
    if (saving.current || !form) return
    let request = pending
    if (!request) {
      const amount = form.amount.trim()
      if (!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(amount) || Number(amount) <= 0 || Number(amount) > 999999999999.99) {
        setError(new Error('INVALID_AMOUNT'))
        return
      }
      if (!form.description.trim()) {
        setError(new Error('DESCRIPTION_REQUIRED'))
        return
      }
      request = {
        p_request: crypto.randomUUID(), p_date: form.date, p_currency: form.currency,
        p_amount: amount, p_description: form.description.trim(), p_booking: form.booking || null,
        ...(form.fee ? { p_fee: form.fee.id, p_branch: form.branch === 'admin' ? null : form.branch } : { p_agent: agent.id }),
      }
      setPending(request)
    }
    saving.current = true
    setBusy(true)
    onBusyChange?.(true)
    setError(null)
    try {
      await rpc(form.fee ? 'pay_customs_agent_fee' : 'add_customs_agent_fee', request)
    } catch (failure) {
      // A database rejection permits editing. A lost response must retry the same request.
      if (failure.code === 'P0001' && failure.message !== 'REQUEST_CONFLICT') setPending(null)
      setError(failure)
      return
    } finally {
      saving.current = false
      setBusy(false)
      onBusyChange?.(false)
    }
    setPending(null)
    setForm(null)
    setNotice(form.fee ? t('Payment recorded in Cashbook.', 'پرداخت در روزنامچه ثبت شد.') : t('Fee recorded.', 'حق‌الزحمه ثبت شد.'))
    if (form.fee) {
      window.dispatchEvent(new Event('pedram:cashbook-changed'))
      onPayment?.()
    }
    await load()
  }

  function print(report) {
    if (!printRecord(report)) setError(new Error('CUSTOMS_PRINT_POPUP'))
  }

  function printPayment(row) {
    const description = [row.description, customsPaymentStatus(row, t)].filter(Boolean).join(' · ')
    const report = cashbookReceipt({
      row: { ...row, entry_date: row.date, description, reversal: false, reversed_by: null },
      language,
      account: customsPaymentAccount(row, t),
    })
    if (report) print({ ...report, subtitle: `${report.subtitle} · #${row.receipt_number}` })
  }

  const message = error?.message === 'CUSTOMS_PRINT_POPUP'
    ? t('Allow pop-ups to print this statement.', 'برای چاپ صورت حساب، پنجره جدید را اجازه دهید.')
    : error && explain(error, language)
  const retry = !!pending
  return <div className="record-modal-body customs-account">
    {notice && <p className="registry-notice success" role="status">{notice}</p>}
    {message && <p className="registry-notice error" role="alert">{message}</p>}
    {form ? <form className="registry-form customs-account-form" onSubmit={save}>
      <h3 className="wide">{form.fee ? t('Pay commission agent', 'پرداخت کمیشن کار') : t('Record agreed fee', 'ثبت حق‌الزحمه')}</h3>
      {form.fee && <p className="wide booking-help">{form.fee.description} · {t('Remaining', 'باقی‌مانده')} <bdi>{showMoney(form.fee.remaining, form.currency)}</bdi></p>}
      <fieldset className="booking-fields wide" disabled={busy || retry}>
        {form.fee && <label className="wide"><span>{t('Paying Cashbook account', 'حساب پرداخت‌کننده روزنامچه')}</span>
          <select required value={form.branch} onChange={e => updateForm('branch', e.target.value)}>
            <option value="">{t('Choose the paying account', 'حساب پرداخت‌کننده را انتخاب کنید')}</option>
            <option value="admin">{t('Admin account', 'حساب مرکزی')}</option>
            {lookups.branches.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>
        </label>}
        <label><span>{t('Date', 'تاریخ')}</span><SolarHijriDateInput required max={kabulToday()} min={form.fee?.date} language={language}
          value={form.date} onChange={value => updateForm('date', value)} ariaLabel={t('Date', 'تاریخ')} /></label>
        <label><span>{t('Currency', 'واحد پول')}</span><select value={form.currency} disabled={!!form.fee}
          onChange={e => updateForm('currency', e.target.value)}>
          {currencies.map(unit => <option key={unit}>{unit}</option>)}
        </select></label>
        <label><span>{t('Amount', 'مبلغ')}</span><input required type="number" inputMode="decimal" min="0.01" step="0.01"
          max={form.fee?.remaining ?? '999999999999.99'} value={form.amount} onChange={e => updateForm('amount', e.target.value)} /></label>
        <label><span>{t('Booking', 'بار نامه')}</span>
          {form.fee?.booking_number != null
            ? <input readOnly value={`#${form.fee.booking_number}`} />
            : <select value={form.booking} onChange={e => updateForm('booking', e.target.value)}>
              <option value="">{t('No booking selected', 'بار نامه انتخاب نشده است')}</option>
              {lookups.bookings.map(row => <option key={row.id} value={row.id}>#{row.booking_number} · {row.origin} → {row.destination}</option>)}
            </select>}
        </label>
        <label className="wide"><span>{t('Description', 'شرح')}</span><input required maxLength={500}
          value={form.description} onChange={e => updateForm('description', e.target.value)} /></label>
      </fieldset>
      {retry && !busy && <p className="wide booking-help">{t('Save was not confirmed. Retry these same details, or check the history before entering it again.',
        'ثبت تأیید نشد. با همین معلومات دوباره کوشش کنید یا پیش از ثبت دوباره، سابقه را بررسی کنید.')}</p>}
      <div className="registry-form-actions"><button type="button" disabled={busy} onClick={() => { setForm(null); void load() }}>{t('Cancel', 'انصراف')}</button>
        <button className="registry-primary" disabled={busy}>{busy ? t('Saving…', 'در حال ثبت…') : retry ? t('Retry save', 'تلاش دوباره')
          : form.fee ? t('Save Money Out', 'ثبت پول رفت') : t('Save agreed fee', 'ثبت حق‌الزحمه')}</button></div>
    </form> : <>
      <div className="customs-account-actions">
        <button type="button" className="registry-primary" disabled={loading || !lookups} onClick={() => begin()}>
          <Plus size={17} />{t('Record agreed fee', 'ثبت حق‌الزحمه')}
        </button>
        <button type="button" className="registry-secondary" disabled={loading} onClick={load}><RefreshCw size={17} />{t('Refresh', 'تازه‌سازی')}</button>
      </div>
      {loading && <p role="status">{t('Loading account…', 'در حال بارگیری حساب…')}</p>}
      {!loading && view && <>
        <h3>{t('Current balances', 'مانده فعلی')}</h3>
        {view.totals.length ? <div className="financial-statement-totals">{view.totals.map(row => <div key={row.unit}>
          <strong>{row.unit}</strong>
          <span>{t('Agreed fees', 'حق‌الزحمه توافق‌شده')} <bdi>{reportMoney(row.agreed, row.unit)}</bdi></span>
          <span>{t('Net paid', 'پرداخت خالص')} <bdi>{reportMoney(row.paid, row.unit)}</bdi></span>
          <span>{t('Remaining', 'باقی‌مانده')} <bdi>{reportMoney(row.remaining, row.unit)}</bdi></span>
        </div>)}</div> : <p>{t('No fees recorded in this currency.', 'در این واحد پول حق‌الزحمه‌ای ثبت نشده است.')}</p>}
        <div className="financial-statement-controls">
          <label><span>{t('From date', 'از تاریخ')}</span><SolarHijriDateInput language={language} value={filters.start} max={filters.end || undefined}
            onChange={value => updateFilter('start', value)} ariaLabel={t('From date', 'از تاریخ')} /></label>
          <label><span>{t('Through date', 'تا تاریخ')}</span><SolarHijriDateInput language={language} value={filters.end} min={filters.start || undefined}
            onChange={value => updateFilter('end', value)} ariaLabel={t('Through date', 'تا تاریخ')} /></label>
          <label><span>{t('Currency', 'واحد پول')}</span><select value={filters.currency} onChange={e => updateFilter('currency', e.target.value)}>
            <option value="">{t('All currencies', 'همه واحدهای پول')}</option>{currencies.map(unit => <option key={unit}>{unit}</option>)}</select></label>
          <button className="registry-secondary" disabled={!validRange} onClick={() => print(customsAgentReport(agent.name, language, view, filters.start, filters.end))}>
            <Printer size={17} />{t('Print / Save PDF', 'چاپ / ذخیره PDF')}
          </button>
        </div>
        {!validRange ? <p role="alert">{t('Choose a valid start and end date.', 'تاریخ آغاز و پایان درست انتخاب کنید.')}</p> : <>
          <h3>{t('Agreed fees', 'حق‌الزحمه‌ها')}</h3>
          <div className="employee-transactions">{view.fees.map(fee => <article key={fee.id}>
            <div><strong>{fee.description}</strong><span>{formatSolarHijri(fee.date)}{fee.booking_number != null && ` · #${fee.booking_number}`}</span></div>
            <dl className="customs-information-grid">
              <div><dt>{t('Agreed fee', 'حق‌الزحمه')}</dt><dd><bdi>{showMoney(fee.amount, fee.currency)}</bdi></dd></div>
              <div><dt>{t('Paid', 'پرداخت‌شده')}</dt><dd><bdi>{showMoney(fee.paid, fee.currency)}</bdi></dd></div>
              <div><dt>{t('Remaining', 'باقی‌مانده')}</dt><dd><bdi>{showMoney(fee.remaining, fee.currency)}</bdi></dd></div>
            </dl>
            {Number(fee.remaining) > 0 && <button type="button" className="registry-secondary" onClick={() => begin(fee)}>
              {t('Pay this fee', 'پرداخت این حق‌الزحمه')}</button>}
          </article>)}</div>
          {!view.fees.length && <p>{t('No fees in this period.', 'در این دوره حق‌الزحمه‌ای ثبت نشده است.')}</p>}
          <h3>{t('Payment history', 'سابقه پرداخت‌ها')}</h3>
          {view.payments.length > 0 && <div className="financial-statement-totals">{view.totals.map(row => <div key={row.unit}>
            <span>{t('Net paid in this period', 'پرداخت خالص در این دوره')} <bdi>{reportMoney(row.periodPaid, row.unit)}</bdi></span>
          </div>)}</div>}
          <div className="employee-transactions">{view.payments.map(row => <article key={row.id}>
            <div><strong>#{row.receipt_number} · {formatSolarHijri(row.date)}</strong><span>{customsPaymentAccount(row, t)}</span></div>
            <p>{row.description}</p>
            <strong><bdi>{showMoney(row.reversal ? -row.amount : row.amount, row.currency)}</bdi></strong>
            {customsPaymentStatus(row, t) && <small>{customsPaymentStatus(row, t)}</small>}
            <button type="button" className="registry-secondary" onClick={() => printPayment(row)}>
              <Printer size={16} />{t('Print receipt', 'چاپ رسید')}
            </button>
          </article>)}</div>
          {!view.payments.length && <p>{t('No payments in this period.', 'در این دوره پرداختی ثبت نشده است.')}</p>}
        </>}
      </>}
    </>}
  </div>
}
