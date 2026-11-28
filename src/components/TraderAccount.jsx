import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDownLeft, Ellipsis, Plus, Printer, Trash2 } from 'lucide-react'
import { allRows, cents, currencies, kabulToday } from '../lib/cashbook'
import { supabase } from '../lib/supabase'
import { rpc, explain } from '../lib/operations'
import { bookingBalances, traderBalance } from '../lib/traderAccounts'
import { managedChargeLabel } from '../lib/managedBookings'
import { printRecord } from '../lib/recordExports'
import { IconButton, Modal } from './RecordTools'
import CompactTable from './CompactTable'
import SolarHijriDateInput from './SolarHijriDateInput'
import { formatSolarHijri } from '../lib/solarHijri'

export default function TraderAccount({ trader, language, account, initialCurrency }) {
  const t = (en, fa) => language === 'fa' ? fa : en
  const [data, setData] = useState(null)
  const [branches, setBranches] = useState([])
  const [currency, setCurrency] = useState(()=>currencies.includes(initialCurrency) ? initialCurrency : 'AFN')
  const [mode, setMode] = useState('')
  const [form, setForm] = useState({})
  const [moreActions, setMoreActions] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [voiding, setVoiding] = useState(null)
  const request = useRef(null)
  const formElement = useRef(null)
  const load = useCallback(async () => {
    const args = { p_trader: trader.id }
    setData(await (account ? rpc('company_trader_statement', {...args,p_branch:account==='admin' ? null : account})
      : rpc('trader_account_statement',args)))
  }, [trader.id,account])
  useEffect(() => {
    void Promise.resolve().then(() => Promise.all([load(), allRows(supabase, 'branches').then(setBranches)]))
      .catch(error => setError(explain(error, language)))
  }, [load, language])
  useEffect(() => {
    if (mode) formElement.current?.scrollIntoView({block:'nearest'})
  }, [mode])

  const money = amount => `${(amount / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })} ${currency}`
  const totals = data && traderBalance(data.charges, data.payments, currency)
  const bookings = data ? bookingBalances(data, currency).filter(row =>
    row.charged || row.paid || (!row.managed_transport && (!row.currency || row.currency===currency))) : []
  const accountOptions = branches.filter(branch => !branch.archived_at && (!trader.branch_id || branch.id === trader.branch_id)
    && (!account || branch.id===account))
  const adminAvailable = !trader.branch_id && (!account || account==='admin')
  const canReceiveFor = row => row.remaining > 0 && !row.driver_commission && !row.archived && !row.deleted
    && (row.managed_transport || !row.currency || row.currency===currency)
    && ((row.branch_id || 'admin')==='admin' ? adminAvailable : accountOptions.some(branch=>branch.id===row.branch_id))
  const payableBookings = bookings.filter(canReceiveFor)
  const selectedBooking = payableBookings.find(row=>row.id===form.booking_id)
  const history = data ? [
    ...data.charges.filter(row => row.currency === currency).map(row => ({ ...row, date: row.charge_date, type: 'charge' })),
    ...data.payments.filter(row => row.currency === currency).map(row => ({ ...row, type: 'payment' })),
  ].sort((a, b) => b.date.localeCompare(a.date)) : []
  const balanceTone = totals?.owed ? 'due' : totals?.credit ? 'credit' : 'settled'
  const balanceLabel = balanceTone==='due' ? t('Trader owes','باقی‌مانده تاجر')
    : balanceTone==='credit' ? t('Trader overpayment','اضافه‌پرداخت تاجر') : t('Settled','تصفیه شد')
  const balanceAmount = totals ? money(totals.owed || totals.credit) : ''
  const summary = totals ? [
    [t('Total charges', 'مجموع بدهی'), money(totals.charged)],
    [t('Net received', 'دریافتی خالص'), money(totals.received)],
  ] : []
  const bookingHeaders = [t('Date','تاریخ'),t('Booking','بوکینگ'),t('Route','مسیر'),t('Charge','بدهی'),t('Paid','پرداخت'),t('Remaining','باقی‌مانده')]
  const historyHeaders = [t('Date','تاریخ'),t('Description','شرح'),t('Charge','بدهی'),t('Paid','پرداخت')]
  const bookingCells = row => [
    formatSolarHijri(row.date), `#${row.number}`, `${row.origin} → ${row.destination}`,
    money(row.charged), money(row.paid), money(row.remaining),
  ]
  const historyCells = row => [
    formatSolarHijri(row.date),
    managedChargeLabel(row,language) + (row.voided_at ? ` · ${t('Cancelled','لغوشده')}` : ''),
    row.type === 'charge' ? money(cents(row.amount)) : '—',
    row.type === 'payment' ? money((row.direction === 'in' ? 1 : -1) * cents(row.amount)) : '—',
  ]

  function paymentFields(booking) {
    return {
      booking_id: booking?.id || '',
      amount: booking ? (booking.remaining/100).toFixed(2) : '',
      description: booking ? `${t('Payment for booking','پرداخت بار نامه')} #${booking.number}`
        : `${t('Payment from','پرداخت از')} ${trader.full_name}`,
    }
  }

  function start(next, booking) {
    setMode(next)
    setMoreActions(false)
    setError('')
    request.current = null
    setForm({
      date: kabulToday(), scope: booking ? booking.branch_id || 'admin' : account || trader.branch_id || 'admin',
      ...(next==='payment' ? paymentFields(booking) : {amount:'',booking_id:'',description:''}),
    })
  }

  async function save(event) {
    event.preventDefault()
    if (busy) return
    if (form.booking_id && (!selectedBooking || cents(form.amount)>selectedBooking.remaining)) {
      setError(t('Choose an unpaid booking and enter an amount within its balance.','بار نامهٔ پرداخت‌نشده و مبلغی در حد باقی‌مانده را انتخاب کنید.'))
      return
    }
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
      if (mode==='payment') window.dispatchEvent(new Event('pedram:cashbook-changed'))
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
        { rows: [[balanceLabel,balanceAmount],...summary] },
        { title: t('Bookings','بوکینگ‌ها'), headers: bookingHeaders, rows: bookings.map(bookingCells) },
        { title: t('Account history','تاریخچه حساب'), headers: historyHeaders, rows: history.map(historyCells) },
      ],
    })) setError(t('Allow pop-ups to print this statement.','برای چاپ صورت حساب، پنجرهٔ جدید را اجازه دهید.'))
  }

  return <section className="trader-account">
    <div className="trader-account-toolbar" data-active={!trader.archived_at}>
      {!trader.archived_at && <button type="button" className="registry-primary trader-receive"
        disabled={!data || busy || !!mode} onClick={() => start('payment')}><ArrowDownLeft size={17} aria-hidden="true"/>{t('Receive payment','دریافت پول')}</button>}
      <label><span>{t('Currency','واحد پول')}</span><select disabled={busy || !!mode} value={currency} onChange={event => setCurrency(event.target.value)}>
        {currencies.map(value => <option key={value}>{value}</option>)}
      </select></label>
      {data && <button type="button" className="registry-secondary" onClick={printStatement}><Printer size={15} aria-hidden="true"/>{t('Print statement','چاپ صورت حساب')}</button>}
      {!trader.archived_at && <button type="button" className="registry-secondary" aria-expanded={moreActions}
        aria-controls={moreActions ? 'trader-more-actions' : undefined} disabled={!data || busy || !!mode} onClick={()=>setMoreActions(value=>!value)}>
        <Ellipsis size={16} aria-hidden="true"/>{t('More actions','عملیات بیشتر')}
      </button>}
      {moreActions && !trader.archived_at && <div id="trader-more-actions" className="trader-more-actions">
        <button type="button" className="registry-secondary" onClick={() => start('charge')}><Plus size={17} aria-hidden="true"/>{t('Add extra charge','ثبت بدهی اضافی')}</button>
      </div>}
    </div>
    {error && <p className="registry-notice error" role="alert">{error}</p>}
    {!data && !error && <p role="status">{t('Loading account…','حساب در حال بارگیری است…')}</p>}
    {data && <>
      <section className="trader-account-block trader-balance-block" data-tone={balanceTone}>
        <h3 className="trader-balance-status"><span>{balanceLabel}</span><bdi dir="ltr">{balanceAmount}</bdi></h3>
        <details className="trader-balance-details">
          <summary>{t('Balance details','تفصیلات حساب')}</summary>
          <dl className="trader-account-totals">{summary.map(([label, value]) => <div key={label}><dt>{label}</dt><dd><bdi dir="ltr">{value}</bdi></dd></div>)}</dl>
        </details>
      </section>
      {mode && <form ref={formElement} className="registry-form trader-account-form" onSubmit={save} aria-labelledby="trader-payment-title">
        <h3 id="trader-payment-title">{mode==='payment' ? t('Receive payment','دریافت پول') : t('Add extra charge','ثبت بدهی اضافی')}
          {selectedBooking && <bdi dir="ltr"> · #{selectedBooking.number}</bdi>}
        </h3>
        <fieldset className="booking-fields wide" disabled={busy}>
          <label><span>{t('Account','حساب')} *</span><select required value={form.scope} onChange={event => setForm({
            ...form, scope:event.target.value, ...(form.booking_id ? paymentFields() : {}),
          })}>
            {adminAvailable && <option value="admin">{t('Admin account','حساب مرکزی')}</option>}
            {accountOptions.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select></label>
          {mode === 'payment' && <label><span>{t('Booking (optional)','بوکینگ (اختیاری)')}</span><select value={form.booking_id} onChange={event => {
            const booking = payableBookings.find(row => row.id === event.target.value)
            setForm({ ...form, ...paymentFields(booking) })
          }}>
            <option value="">{t('General account entry','معامله عمومی حساب')}</option>
            {payableBookings.filter(row => (row.branch_id || 'admin') === form.scope)
              .map(row => <option value={row.id} key={row.id}>#{row.number} · {row.origin} → {row.destination}</option>)}
          </select></label>}
          <label><span>{t('Date','تاریخ')} *</span><SolarHijriDateInput required max={mode === 'payment' ? kabulToday() : undefined} language={language} value={form.date} onChange={date => setForm({ ...form, date })} ariaLabel={t('Date','تاریخ')}/></label>
          <label><span>{t('Description','شرح')} *</span><input required value={form.description} onChange={event => setForm({ ...form, description: event.target.value })}/></label>
          <label><span>{t('Amount','مبلغ')} ({currency}) *</span><input required inputMode="decimal" type="number" min="0.01"
            max={selectedBooking ? (selectedBooking.remaining/100).toFixed(2) : '999999999999.99'} step="0.01" value={form.amount}
            onChange={event => setForm({ ...form, amount: event.target.value })}/></label>
        </fieldset>
        <div className="registry-form-actions"><button type="button" disabled={busy} onClick={() => setMode('')}>{t('Cancel','انصراف')}</button>
          <button className="registry-primary" disabled={busy}>{mode==='payment' ? t('Save payment','ثبت دریافت پول') : t('Save extra charge','ثبت بدهی اضافی')}</button></div>
      </form>}
      <section className="trader-account-block trader-bookings-block">
      <h3>{t('Bookings','بار نامه‌ها')}</h3>
      <CompactTable label={t('Bookings','بوکینگ‌ها')} columns={[
        { label: t('Booking / route','بوکینگ / مسیر') },
        { label: t('Charge / paid','بدهی / پرداخت'), width: '29%' },
        { label: t('Remaining','باقی‌مانده'), width: '26%' },
      ]}>
        {bookings.map(row => {
          const [date, number, route, charge, paid, remaining] = bookingCells(row)
          return <tr key={row.id}>
            <th scope="row"><strong><bdi>{number}</bdi></strong> · <bdi>{date}</bdi><small>{route}</small></th>
            <td><bdi dir="ltr">{charge}</bdi><small>{t('Received','دریافتی')} · <bdi dir="ltr">{paid}</bdi></small></td>
            <td><strong><bdi dir="ltr">{remaining}</bdi></strong>
              {!trader.archived_at && canReceiveFor(row) && <button type="button" className="registry-secondary trader-booking-receive"
                disabled={busy || !!mode} onClick={()=>start('payment',row)}>
                <ArrowDownLeft size={14} aria-hidden="true"/>{t('Receive payment','دریافت پول')}
              </button>}
            </td>
          </tr>
        })}
        {!bookings.length && <tr><td colSpan={3}>{t('No bookings for this currency.','برای این واحد پول بوکینگ نیست.')}</td></tr>}
      </CompactTable>
      </section>
      <section className="trader-account-block trader-history-block">
      <h3>{t('Account history','تاریخچه حساب')}</h3>
      <CompactTable label={t('Account history','تاریخچه حساب')} columns={[
        { label: t('Date / description','تاریخ / شرح') },
        { label: t('Charge','بدهی'), width: '24%' },
        { label: t('Paid','پرداخت'), width: '24%' },
      ]}>
        {history.map(row => {
          const [date, description, charge, paid] = historyCells(row)
          return <tr key={`${row.type}-${row.id}`} className={row.voided_at ? 'trader-voided' : ''}>
            <th scope="row"><bdi>{date}</bdi><small>{description}</small>
              {row.type === 'charge' && !row.booking_id && !row.voided_at && !trader.archived_at &&
                <IconButton icon={Trash2} label={t('Cancel mistaken charge','لغو بدهی اشتباه')} disabled={busy} onClick={() => { setError(''); setVoiding(row) }}/>}
            </th>
            <td><bdi>{charge}</bdi></td><td><bdi>{paid}</bdi></td>
          </tr>
        })}
        {!history.length && <tr><td colSpan={3}>{t('No account entries yet.','هنوز معامله‌ای در حساب ثبت نشده است.')}</td></tr>}
      </CompactTable>
      </section>
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
