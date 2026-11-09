import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDownLeft, Plus, Trash2 } from 'lucide-react'
import { allRows, cents, currencies, kabulToday } from '../lib/cashbook'
import { supabase } from '../lib/supabase'
import { rpc, explain } from '../lib/operations'
import { bookingBalances, traderBalance } from '../lib/traderAccounts'
import { printRecord } from '../lib/recordExports'
import { IconButton, Modal } from './RecordTools'
import SolarHijriDateInput from './SolarHijriDateInput'
import { formatSolarHijri } from '../lib/solarHijri'

export default function TraderAccount({ trader, language }) {
  const t = (en, fa) => language === 'fa' ? fa : en
  const [data, setData] = useState(null)
  const [branches, setBranches] = useState([])
  const [currency, setCurrency] = useState('AFN')
  const [mode, setMode] = useState('')
  const [form, setForm] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [voiding, setVoiding] = useState(null)
  const request = useRef(null)
  const load = useCallback(async () => {
    setData(await rpc('trader_account_statement', { p_trader: trader.id }))
  }, [trader.id])
  useEffect(() => {
    void Promise.resolve().then(() => Promise.all([load(), allRows(supabase, 'branches').then(setBranches)]))
      .catch(error => setError(explain(error, language)))
  }, [load, language])

  const money = amount => `${(amount / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })} ${currency}`
  const totals = data && traderBalance(data.charges, data.payments, currency)
  const bookings = data ? bookingBalances(data, currency).filter(row =>
    !row.currency || row.currency === currency || row.charged || row.paid) : []
  const history = data ? [
    ...data.charges.filter(row => row.currency === currency).map(row => ({ ...row, date: row.charge_date, type: 'charge' })),
    ...data.payments.filter(row => row.currency === currency).map(row => ({ ...row, type: 'payment' })),
  ].sort((a, b) => b.date.localeCompare(a.date)) : []
  const summary = totals ? [
    [t('Total charges', 'مجموع بدهی'), money(totals.charged)],
    [t('Paid (net)', 'پرداخت خالص'), money(totals.received)],
    [t('Trader owes', 'باقی‌مانده تاجر'), money(totals.owed)],
    [t('Trader credit', 'طلب تاجر'), money(totals.credit)],
  ] : []
  const bookingHeaders = [t('Date','تاریخ'),t('Booking','بوکینگ'),t('Route','مسیر'),t('Charge','بدهی'),t('Paid','پرداخت'),t('Remaining','باقی‌مانده')]
  const historyHeaders = [t('Date','تاریخ'),t('Description','شرح'),t('Charge','بدهی'),t('Paid','پرداخت')]
  const bookingCells = row => [
    formatSolarHijri(row.date), `#${row.number}`, `${row.origin} → ${row.destination}`,
    money(row.charged), money(row.paid), money(row.remaining),
  ]
  const historyCells = row => [
    formatSolarHijri(row.date),
    row.description + (row.voided_at ? ` · ${t('Cancelled','لغوشده')}` : ''),
    row.type === 'charge' ? money(cents(row.amount)) : '—',
    row.type === 'payment' ? money((row.direction === 'in' ? 1 : -1) * cents(row.amount)) : '—',
  ]

  function start(next) {
    setMode(next)
    setError('')
    request.current = null
    setForm({
      date: kabulToday(), amount: '', booking_id: '', scope: trader.branch_id || 'admin',
      description: next === 'payment' ? `${t('Payment from','پرداخت از')} ${trader.full_name}` : '',
    })
  }

  async function save(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    const payload = {
      branch_id: form.scope === 'admin' ? null : form.scope, currency, trader_id: trader.id,
      booking_id: form.booking_id || null, amount: form.amount, date: form.date, description: form.description.trim(),
    }
    if (mode === 'payment') payload.direction = 'in'
    const key = JSON.stringify({ mode, payload })
    if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() }
    try {
      await rpc(mode === 'charge' ? 'add_trader_charge' : 'cashbook_simple_post', {
        p_request: request.current.id, p_data: payload,
      })
      setMode('')
      await load()
    } catch (error) { setError(explain(error, language)) }
    finally { setBusy(false) }
  }

  async function cancelCharge() {
    setBusy(true)
    try {
      await rpc('void_trader_charge', { p_id: voiding.id })
      setVoiding(null)
      await load()
    } catch (error) { setError(explain(error, language)) }
    finally { setBusy(false) }
  }

  function printStatement() {
    if (!printRecord({
      language,
      title: `${t('Trader statement','صورت حساب تاجر')} · ${trader.full_name}`,
      subtitle: `Pedram Transportation · ${currency} · ${formatSolarHijri(kabulToday())}`,
      sections: [
        { rows: summary },
        { title: t('Bookings','بوکینگ‌ها'), headers: bookingHeaders, rows: bookings.map(bookingCells) },
        { title: t('Account history','تاریخچه حساب'), headers: historyHeaders, rows: history.map(historyCells) },
      ],
    })) setError(t('Allow pop-ups to print this statement.','برای چاپ صورت حساب، پنجرهٔ جدید را اجازه دهید.'))
  }

  return <section className="trader-account">
    <div className="trader-account-toolbar">
      <label><span>{t('Currency','واحد پول')}</span><select disabled={busy || !!mode} value={currency} onChange={event => setCurrency(event.target.value)}>
        {currencies.map(value => <option key={value}>{value}</option>)}
      </select></label>
      {data && <button type="button" className="registry-secondary" onClick={printStatement}>{t('Print statement','چاپ صورت حساب')}</button>}
      {!trader.archived_at && <>
        <button type="button" className="registry-secondary" disabled={!data || busy || !!mode} onClick={() => start('charge')}><Plus size={17}/>{t('Add charge','ثبت بدهی')}</button>
        <button type="button" className="registry-primary" disabled={!data || busy || !!mode} onClick={() => start('payment')}><ArrowDownLeft size={18}/>{t('Receive payment','دریافت پول')}</button>
      </>}
    </div>
    {error && <p className="registry-notice error" role="alert">{error}</p>}
    {!data && !error && <p role="status">{t('Loading account…','حساب در حال بارگیری است…')}</p>}
    {data && <>
      <dl className="trader-account-totals">{summary.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      {mode && <form className="registry-form trader-account-form" onSubmit={save}>
        <fieldset className="booking-fields wide" disabled={busy}>
          <label><span>{t('Account','حساب')} *</span><select required value={form.scope} onChange={event => setForm({ ...form, scope: event.target.value, booking_id: '' })}>
            {!trader.branch_id && <option value="admin">{t('Admin account','حساب مرکزی')}</option>}
            {branches.filter(branch => !branch.archived_at && (!trader.branch_id || branch.id === trader.branch_id)).map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select></label>
          {mode === 'payment' && <label><span>{t('Booking (optional)','بوکینگ (اختیاری)')}</span><select value={form.booking_id} onChange={event => {
            const booking = bookings.find(row => row.id === event.target.value)
            setForm({ ...form, booking_id: event.target.value, description: booking ? `${t('Payment for booking','پرداخت بوکینگ')} #${booking.number}` : `${t('Payment from','پرداخت از')} ${trader.full_name}` })
          }}>
            <option value="">{t('General account entry','معامله عمومی حساب')}</option>
            {bookings.filter(row => !row.archived && !row.deleted && (!row.currency || row.currency === currency) && (row.branch_id || 'admin') === form.scope)
              .map(row => <option value={row.id} key={row.id}>#{row.number} · {row.origin} → {row.destination}</option>)}
          </select></label>}
          <label><span>{t('Date','تاریخ')} *</span><SolarHijriDateInput required max={mode === 'payment' ? kabulToday() : undefined} language={language} value={form.date} onChange={date => setForm({ ...form, date })} ariaLabel={t('Date','تاریخ')}/></label>
          <label><span>{t('Description','شرح')} *</span><input required value={form.description} onChange={event => setForm({ ...form, description: event.target.value })}/></label>
          <label><span>{t('Amount','مبلغ')} ({currency}) *</span><input required type="number" min="0.01" max="999999999999.99" step="0.01" value={form.amount} onChange={event => setForm({ ...form, amount: event.target.value })}/></label>
        </fieldset>
        <div className="registry-form-actions"><button type="button" disabled={busy} onClick={() => setMode('')}>{t('Cancel','انصراف')}</button><button className="registry-primary" disabled={busy}>{t('Save','ثبت')}</button></div>
      </form>}
      <h3>{t('Bookings','بوکینگ‌ها')}</h3>
      <div className="simple-cashbook-list"><table>
        <thead><tr>{bookingHeaders.map(header => <th key={header}>{header}</th>)}</tr></thead>
        <tbody>{bookings.map(row => <tr key={row.id}>{bookingCells(row).map((cell, index) => <td key={index}>{cell}</td>)}</tr>)}
          {!bookings.length && <tr><td colSpan={bookingHeaders.length}>{t('No bookings for this currency.','برای این واحد پول بوکینگ نیست.')}</td></tr>}
        </tbody>
      </table></div>
      <h3>{t('Account history','تاریخچه حساب')}</h3>
      <div className="simple-cashbook-list"><table>
        <thead><tr>{historyHeaders.map(header => <th key={header}>{header}</th>)}<th>{t('Action','عمل')}</th></tr></thead>
        <tbody>{history.map(row => <tr key={`${row.type}-${row.id}`} className={row.voided_at ? 'trader-voided' : ''}>
          {historyCells(row).map((cell, index) => <td key={index}>{cell}</td>)}
          <td>{row.type === 'charge' && !row.booking_id && !row.voided_at && !trader.archived_at &&
            <IconButton icon={Trash2} label={t('Cancel mistaken charge','لغو بدهی اشتباه')} disabled={busy} onClick={() => { setError(''); setVoiding(row) }}/>}</td>
        </tr>)}
        {!history.length && <tr><td colSpan={historyHeaders.length + 1}>{t('No account entries yet.','هنوز معامله‌ای در حساب ثبت نشده است.')}</td></tr>}</tbody>
      </table></div>
    </>}
    {voiding && <Modal title={t('Cancel charge','لغو بدهی')} busy={busy} onClose={() => setVoiding(null)}>
      <div className="record-modal-body">
        <p>{t('Cancel this charge? It stays in the history.','این بدهی لغو شود؟ در تاریخچه باقی می‌ماند.')}</p>
        {error && <p role="alert">{error}</p>}
        <button className="registry-primary" disabled={busy} onClick={cancelCharge}>{t('Cancel charge','لغو بدهی')}</button>
      </div>
    </Modal>}
  </section>
}
