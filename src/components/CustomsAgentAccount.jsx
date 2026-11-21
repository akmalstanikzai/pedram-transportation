import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, Printer, RefreshCw, WalletCards } from 'lucide-react'
import { allRows, cents, currencies, kabulToday } from '../lib/cashbook'
import { customsAgentReport, customsPaymentAccount, customsPaymentStatus, customsStatementView } from '../lib/customsAgentStatement'
import { cashbookReceipt, reportMoney } from '../lib/financialReports'
import { explain, rpc } from '../lib/operations'
import { printRecord } from '../lib/recordExports'
import { formatSolarHijri } from '../lib/solarHijri'
import { supabase } from '../lib/supabase'
import SolarHijriDateInput from './SolarHijriDateInput'
import CompactTable from './CompactTable'
import { IconButton } from './RecordTools'
import './CustomsAgentAccount.css'

export default function CustomsAgentAccount({ agent, language, initialAccount = '', onPayment, onBusyChange }) {
  const t = (en, fa) => language === 'fa' ? fa : en
  const [data, setData] = useState(null)
  const [lookups, setLookups] = useState(null)
  const [currencyFilter, setCurrencyFilter] = useState('')
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState('')
  const saving = useRef(false)
  const [pending, setPending] = useState(null)

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

  const view = data && customsStatementView(data, currencyFilter)
  const updateForm = (key, value) => setForm(current => ({ ...current, [key]: value }))
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
    {form ? <form className={`customs-account-form ${form.fee ? 'customs-payment-section' : 'customs-fees-section'}`} onSubmit={save}>
      <header className="customs-section-header">
        <h3>{form.fee ? t('Pay commission agent', 'پرداخت کمیشن کار') : t('Record agreed fee', 'ثبت حق‌الزحمه')}</h3>
      </header>
      {form.fee && <div className="customs-fee-context">
        <strong>{form.fee.description}</strong>
        <span>{t('Remaining', 'باقی‌مانده')} <bdi>{showMoney(form.fee.remaining, form.currency)}</bdi></span>
      </div>}
      <fieldset className="customs-form-fields" disabled={busy || retry}>
        {form.fee && <label className="customs-form-field"><span>{t('Paying Cashbook account', 'حساب پرداخت‌کننده روزنامچه')}</span>
          <select required value={form.branch} onChange={e => updateForm('branch', e.target.value)}>
            <option value="">{t('Choose the paying account', 'حساب پرداخت‌کننده را انتخاب کنید')}</option>
            <option value="admin">{t('Admin account', 'حساب مرکزی')}</option>
            {lookups.branches.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>
        </label>}
        <div className="customs-form-amount-row">
          <div className="customs-form-field"><span>{t('Date', 'تاریخ')}</span>
            <SolarHijriDateInput required max={kabulToday()} min={form.fee?.date} language={language}
              value={form.date} onChange={value => updateForm('date', value)} ariaLabel={t('Date', 'تاریخ')} />
          </div>
          <label className="customs-form-field"><span>{t('Amount', 'مبلغ')}</span><input required type="number" dir="ltr" inputMode="decimal" min="0.01" step="0.01"
            max={form.fee?.remaining ?? '999999999999.99'} value={form.amount} onChange={e => updateForm('amount', e.target.value)} /></label>
          <label className="customs-form-field"><span>{t('Currency', 'واحد پول')}</span><select dir="ltr" value={form.currency} disabled={!!form.fee}
            onChange={e => updateForm('currency', e.target.value)}>
            {currencies.map(unit => <option key={unit}>{unit}</option>)}
          </select></label>
        </div>
        <div className="customs-form-description-row">
          <label className="customs-form-field"><span>{t('Booking', 'بار نامه')}</span>
            {form.fee?.booking_number != null
              ? <input readOnly dir="ltr" value={`#${form.fee.booking_number}`} />
              : <select value={form.booking} onChange={e => updateForm('booking', e.target.value)}>
                <option value="">{t('No booking', 'بدون بار نامه')}</option>
                {lookups.bookings.map(row => <option key={row.id} value={row.id}>#{row.booking_number} · {row.origin} → {row.destination}</option>)}
              </select>}
          </label>
          <label className="customs-form-field"><span>{t('Description', 'تفصیلات')}</span><input required maxLength={500}
            value={form.description} onChange={e => updateForm('description', e.target.value)} /></label>
        </div>
      </fieldset>
      {retry && !busy && <p className="customs-retry booking-help">{t('Save was not confirmed. Retry these same details, or check the history before entering it again.',
        'ثبت تأیید نشد. با همین معلومات دوباره کوشش کنید یا پیش از ثبت دوباره، سابقه را بررسی کنید.')}</p>}
      <div className="customs-form-actions"><button type="button" className="registry-secondary" disabled={busy} onClick={() => { setForm(null); void load() }}>{t('Cancel', 'انصراف')}</button>
        <button type="submit" className="registry-primary customs-section-button" disabled={busy}>{busy ? t('Saving…', 'در حال ثبت…') : retry ? t('Retry save', 'تلاش دوباره')
          : form.fee ? t('Save Money Out', 'ثبت پول رفت') : t('Save agreed fee', 'ثبت حق‌الزحمه')}</button></div>
    </form> : <>
      <div className="customs-account-toolbar">
        <select aria-label={t('Currency', 'واحد پول')} value={currencyFilter} disabled={loading || !view} onChange={e => setCurrencyFilter(e.target.value)}>
          <option value="">{t('All currencies', 'همه واحدهای پول')}</option>
          {currencies.map(unit => <option key={unit}>{unit}</option>)}
        </select>
        <IconButton icon={Printer} label={t('Print / Save PDF', 'چاپ / ذخیره PDF')} disabled={loading || !view}
          onClick={() => print(customsAgentReport(agent.name, language, view))} />
        <IconButton icon={RefreshCw} label={t('Refresh', 'تازه‌سازی')} disabled={loading} onClick={load} />
      </div>
      {loading && <p role="status">{t('Loading account…', 'در حال بارگیری حساب…')}</p>}
      {!loading && view && <>
        <section className="customs-account-section customs-balance-section">
          <header className="customs-section-header">
            <h3>{t('Current balances', 'مانده فعلی')}</h3><small>{t('Totals by currency', 'مجموع به تفکیک واحد پول')}</small>
          </header>
          {view.totals.length ? <CompactTable label={t('Current balances', 'مانده فعلی')} columns={[
            { label: t('Currency', 'واحد پول'), width: '18%' },
            { label: t('Total fees', 'مجموع حق‌الزحمه') },
            { label: t('Net paid', 'پرداخت خالص') },
            { label: t('Remaining', 'باقی‌مانده') },
          ]}>{view.totals.map(row => <tr key={row.unit}>
            <th scope="row"><bdi>{row.unit}</bdi></th>
            <td><bdi>{reportMoney(row.agreed, row.unit)}</bdi></td>
            <td><bdi>{reportMoney(row.paid, row.unit)}</bdi></td>
            <td className="customs-remaining"><strong><bdi>{reportMoney(row.remaining, row.unit)}</bdi></strong></td>
          </tr>)}</CompactTable> : <p>{t('No balances to show.', 'مانده‌ای برای نمایش نیست.')}</p>}
        </section>
        <section className="customs-account-section customs-fees-section">
          <header className="customs-section-header">
            <h3>{t('Agreed fees', 'حق‌الزحمه‌ها')}</h3>
            <button type="button" className="customs-add-fee" disabled={!lookups} onClick={() => begin()}>
              <Plus size={15} aria-hidden="true" />{t('Record agreed fee', 'ثبت حق‌الزحمه')}
            </button>
          </header>
          {view.fees.length ? <CompactTable label={t('Agreed fees', 'حق‌الزحمه‌ها')} columns={[
            { label: t('Fee / date', 'حق‌الزحمه / تاریخ') },
            { label: t('Agreed / paid', 'توافق / پرداخت'), width: '29%' },
            { label: t('Remaining', 'باقی‌مانده'), width: '29%' },
          ]}>{view.fees.map(fee => <tr key={fee.id}>
            <th scope="row"><strong>{fee.description}</strong>
              <small><bdi>{formatSolarHijri(fee.date)}{fee.booking_number != null && ` · #${fee.booking_number}`}</bdi></small>
            </th>
            <td><bdi>{showMoney(fee.amount, fee.currency)}</bdi>
              <small>{t('Paid', 'پرداخت‌شده')} · <bdi>{showMoney(fee.paid, fee.currency)}</bdi></small>
            </td>
            <td className="customs-remaining"><strong><bdi>{showMoney(fee.remaining, fee.currency)}</bdi></strong>
              {Number(fee.remaining) > 0 && <button type="button" className="customs-pay-button"
                aria-label={t('Pay this fee', 'پرداخت این حق‌الزحمه')} onClick={() => begin(fee)}>
                <WalletCards size={14} aria-hidden="true" />{t('Pay', 'پرداخت')}
              </button>}
            </td>
          </tr>)}</CompactTable> : <p>{t('No agreed fees to show.', 'حق‌الزحمه‌ای برای نمایش نیست.')}</p>}
        </section>
        <section className="customs-account-section customs-payment-section">
          <header className="customs-section-header"><h3>{t('Payment history', 'سابقه پرداخت‌ها')}</h3></header>
          {view.payments.length ? <CompactTable label={t('Payment history', 'سابقه پرداخت‌ها')} columns={[
            { label: t('Receipt / date', 'رسید / تاریخ'), width: '23%' },
            { label: t('Account / description', 'حساب / تفصیلات') },
            { label: t('Amount', 'مبلغ'), width: '29%' },
          ]}>{view.payments.map(row => <tr key={row.id}>
            <th scope="row"><bdi>#{row.receipt_number}</bdi><small><bdi>{formatSolarHijri(row.date)}</bdi></small></th>
            <td><strong>{customsPaymentAccount(row, t)}</strong><small>{row.description}</small>
              {customsPaymentStatus(row, t) && <small className="customs-payment-status">{customsPaymentStatus(row, t)}</small>}
            </td>
            <td><strong className={row.reversal ? 'customs-reversed-amount' : undefined}><bdi>{showMoney(row.reversal ? -row.amount : row.amount, row.currency)}</bdi></strong>
              <div className="customs-receipt-action"><IconButton icon={Printer} label={t('Print receipt', 'چاپ رسید')} onClick={() => printPayment(row)} /></div>
            </td>
          </tr>)}</CompactTable> : <p>{t('No payments to show.', 'پرداختی برای نمایش نیست.')}</p>}
        </section>
      </>}
    </>}
  </div>
}
