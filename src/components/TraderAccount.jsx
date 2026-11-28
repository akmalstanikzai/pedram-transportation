import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDownLeft, Ellipsis, Plus, Printer, Trash2 } from 'lucide-react'
import { allRows, cents, currencies, kabulToday } from '../lib/cashbook'
import { supabase } from '../lib/supabase'
import { rpc, explain } from '../lib/operations'
import { bookingBalances, extraChargeBalances, traderBalance } from '../lib/traderAccounts'
import { managedChargeLabel } from '../lib/managedBookings'
import { printRecord } from '../lib/recordExports'
import { IconButton, Modal } from './RecordTools'
import CompactTable from './CompactTable'
import SolarHijriDateInput from './SolarHijriDateInput'
import { formatSolarHijri } from '../lib/solarHijri'
import TraderExtraCharges from './TraderExtraCharges'

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
  const extras = data ? extraChargeBalances(data,currency).sort((a,b)=>b.charge_date.localeCompare(a.charge_date)) : []
  const selectedExtra = extras.find(row=>row.id===form.extra_charge_id)
  const canReceiveExtra = row => row.branch_id ? accountOptions.some(branch=>branch.id===row.branch_id) : adminAvailable
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
    [managedChargeLabel(row,language),row.receipt_number && `${t('Receipt','رسید')} #${row.receipt_number}`,
      row.voided_at && t('Cancelled','لغوشده')].filter(Boolean).join(' · '),
    row.type === 'charge' ? money(cents(row.amount)) : '—',
    row.type === 'payment' ? money((row.direction === 'in' ? 1 : -1) * cents(row.amount)) : '—',
  ]

  function paymentFields(booking) {
    return {
      booking_id: booking?.id || '',
      amount: booking ? (booking.remaining/100).toFixed(2) : '',
    }
  }

  function start(next, row) {
    setMode(next)
    setMoreActions(false)
    setError('')
    request.current = null
    setForm({
      date:kabulToday(),scope:account || trader.branch_id || 'admin',
      ...(next==='payment' ? paymentFields(row)
        : next==='extra-payment' ? {extra_charge_id:row.id,amount:(row.remaining/100).toFixed(2)}
        : {amount:'',description:'',received_now:''}),
    })
  }

  async function save(event) {
    event.preventDefault()
    if (busy) return
    if (mode==='payment' && (!selectedBooking || cents(form.amount)>selectedBooking.remaining)) {
      setError(t('Choose an unpaid booking and enter an amount within its balance.','بار نامهٔ پرداخت‌نشده و مبلغی در حد باقی‌مانده را انتخاب کنید.'))
      return
    }
    if (mode==='extra-payment' && (!selectedExtra || cents(form.amount)>selectedExtra.remaining)) {
      setError(explain(new Error('TRADER_EXTRA_EXCEEDS_BALANCE'),language))
      return
    }
    setBusy(true)
    setError('')
    const [operation,payload] = mode==='payment' ? ['receive_trader_booking_payment',{
      p_trader:trader.id,p_booking:form.booking_id,p_currency:currency,p_amount:form.amount,p_date:form.date,
    }] : mode==='extra-payment' ? ['receive_trader_extra_payment',{
      p_charge:form.extra_charge_id,p_amount:form.amount,p_date:form.date,
    }] : ['record_trader_extra_charge',{
      p_data:{branch_id:form.scope==='admin' ? null : form.scope,currency,trader_id:trader.id,
        amount:form.amount,date:form.date,description:form.description.trim()},
      p_received_now:form.received_now || 0,
    }]
    const key = JSON.stringify({ mode, payload })
    if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() }
    try {
      await rpc(operation,{p_request:request.current.id,...payload})
      setMode('')
      if (mode!=='charge' || cents(form.received_now)>0) window.dispatchEvent(new Event('pedram:cashbook-changed'))
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
        ...(extras.length ? [{title:t('Extra charges','بدهی‌های اضافی'),
          headers:[t('Description','شرح'),t('Charge','بدهی'),t('Received','دریافتی'),t('Remaining','باقی‌مانده')],
          rows:extras.map(row=>[row.description,money(row.charged),money(row.paid),money(row.remaining)])}] : []),
        { title: t('Account history','تاریخچه حساب'), headers: historyHeaders, rows: history.map(historyCells) },
      ],
    })) setError(t('Allow pop-ups to print this statement.','برای چاپ صورت حساب، پنجرهٔ جدید را اجازه دهید.'))
  }

  return <section className="trader-account">
    <div className="trader-account-toolbar" data-active={!trader.archived_at}>
      {!trader.archived_at && <button type="button" className="registry-primary trader-receive"
        disabled={!payableBookings.length || busy || !!mode} onClick={() => start('payment')}><ArrowDownLeft size={17} aria-hidden="true"/>{t('Receive booking payment','دریافت پول بار نامه')}</button>}
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
        <h3 id="trader-payment-title">{mode==='payment' ? t('Receive booking payment','دریافت پول بار نامه') : mode==='extra-payment'
          ? t('Receive extra charge payment','دریافت بدهی اضافی') : t('Add extra charge','ثبت بدهی اضافی')}
          {selectedBooking && <bdi dir="ltr"> · #{selectedBooking.number}</bdi>}
        </h3>
        <fieldset className="booking-fields wide" disabled={busy}>
          {mode==='charge' && <label><span>{t('Account','حساب')} *</span><select required value={form.scope}
            onChange={event=>setForm({...form,scope:event.target.value})}>
            {adminAvailable && <option value="admin">{t('Admin account','حساب مرکزی')}</option>}
            {accountOptions.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select></label>}
          {mode==='payment' && <label className="wide"><span>{t('Booking','بار نامه')} *</span><select required value={form.booking_id} onChange={event => {
            const booking = payableBookings.find(row => row.id === event.target.value)
            setForm({ ...form, ...paymentFields(booking) })
          }}>
            <option value="">{t('Choose an unpaid booking','بار نامهٔ پرداخت‌نشده را انتخاب کنید')}</option>
            {payableBookings.map(row=><option value={row.id} key={row.id}>#{row.number} · {row.origin} → {row.destination} · {money(row.remaining)}</option>)}
          </select></label>}
          {selectedExtra && <p className="wide booking-help">{selectedExtra.description} · {t('Remaining','باقی‌مانده')} <bdi>{money(selectedExtra.remaining)}</bdi></p>}
          <label><span>{t('Date','تاریخ')} *</span><SolarHijriDateInput required min={selectedExtra?.charge_date}
            max={mode!=='charge' || cents(form.received_now)>0 ? kabulToday() : undefined} language={language} value={form.date}
            onChange={date=>setForm({...form,date})} ariaLabel={t('Date','تاریخ')}/></label>
          <label><span>{mode==='charge' ? t('Charge amount','مبلغ بدهی') : t('Amount received','مبلغ دریافتی')} ({currency}) *</span>
            <input required inputMode="decimal" type="number" min="0.01"
            max={selectedBooking || selectedExtra ? ((selectedBooking || selectedExtra).remaining/100).toFixed(2) : '999999999999.99'} step="0.01" value={form.amount}
            onChange={event => setForm({ ...form, amount: event.target.value })}/></label>
          {mode==='charge' && <>
            <label><span>{t('Received now (optional)','دریافت فعلی (اختیاری)')} ({currency})</span>
              <input type="number" inputMode="decimal" min="0" max={form.amount || undefined} step="0.01" value={form.received_now}
                onChange={event=>setForm({...form,received_now:event.target.value})}/></label>
            <label className="wide"><span>{t('Description','شرح')} *</span>
              <input required value={form.description} onChange={event=>setForm({...form,description:event.target.value})}/></label>
          </>}
        </fieldset>
        <div className="registry-form-actions"><button type="button" disabled={busy} onClick={() => setMode('')}>{t('Cancel','انصراف')}</button>
          <button className="registry-primary" disabled={busy || (mode==='payment' && !selectedBooking)}>
            {mode==='charge' ? t('Save extra charge','ثبت بدهی اضافی') : t('Save payment','ثبت دریافت پول')}
          </button></div>
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
      {!!extras.length && <section className="trader-account-block trader-extras-block">
        <h3>{t('Extra charges','بدهی‌های اضافی')}</h3>
        <TraderExtraCharges rows={extras} language={language} money={money} disabled={busy || !!mode}
          onReceive={trader.archived_at ? undefined : row=>start('extra-payment',row)} canReceive={canReceiveExtra}/>
      </section>}
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
              {row.type === 'charge' && !row.booking_id && !row.voided_at && !trader.archived_at && !extras.find(item=>item.id===row.id)?.paid &&
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
