import { useEffect, useState } from 'react'
import { Printer } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { currencies, cents } from '../lib/cashbook'
import { formatSolarHijri } from '../lib/solarHijri'
import { personStatement, reportMoney, transactionNotes } from '../lib/financialReports'
import { printRecord } from '../lib/recordExports'
import { Modal } from './RecordTools'
import CompactTable from './CompactTable'
import SolarHijriDateInput from './SolarHijriDateInput'

export default function PersonTransactions({ person, kind, language, onClose }) {
  const t = (en, fa) => language === 'fa' ? fa : en
  const name = kind === 'employee' ? `${person.first_name} ${person.last_name}` : person.full_name
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [printError, setPrintError] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [currency, setCurrency] = useState('')
  useEffect(() => {
    let active = true
    const endpoint = kind === 'employee' ? 'employee_cashbook_transactions' : 'driver_cashbook_transactions'
    const parameters = kind === 'employee' ? { p_employee: person.id } : { p_driver: person.id }
    void supabase.rpc(endpoint, parameters).then(({ data, error: loadError }) => {
      if (!active) return
      if (loadError) setError(loadError.message)
      else setTransactions(data || [])
      setLoading(false)
    }).catch(loadError => { if (active) { setError(loadError.message); setLoading(false) } })
    return () => { active = false }
  }, [person.id, kind])
  const valid = !start || !end || start <= end
  const report = personStatement({ language, name, kind, transactions, start, end, currency })
  const visible = transactions.filter(row => (!start || row.date >= start) && (!end || row.date <= end) && (!currency || row.currency === currency))
  function print() {
    setPrintError('')
    if (!printRecord(report)) setPrintError(t('Allow pop-ups to print this statement.', 'برای چاپ صورت حساب، پنجرهٔ جدید را اجازه دهید.'))
  }
  return <Modal title={`${name} · ${t('Transactions', 'معاملات')}`} onClose={onClose} className={kind === 'employee' ? 'employee-statement-modal' : ''}>
    <div className={kind==='employee'?'record-modal-body employee-statement':'record-modal-body'}>
      {loading ? <p role="status">{t('Loading…', 'در حال بارگیری…')}</p> : error ? <p className="registry-notice error" role="alert">{error}</p> : <>
        <div className="financial-statement-controls">
          <label><span>{t('From date', 'از تاریخ')}</span><SolarHijriDateInput language={language} value={start} max={end || undefined} onChange={setStart} ariaLabel={t('From date', 'از تاریخ')} /></label>
          <label><span>{t('To date', 'تا تاریخ')}</span><SolarHijriDateInput language={language} value={end} min={start || undefined} onChange={setEnd} ariaLabel={t('To date', 'تا تاریخ')} /></label>
          <label><span>{t('Currency', 'واحد پول')}</span><select value={currency} onChange={event => setCurrency(event.target.value)}><option value="">{t('All currencies', 'همه واحدهای پول')}</option>{currencies.map(unit => <option key={unit}>{unit}</option>)}</select></label>
          <button className="registry-secondary" disabled={!valid} onClick={print}><Printer size={17} />{t('Print / Save PDF', 'چاپ / ذخیره PDF')}</button>
        </div>
        {printError && <p className="registry-notice error" role="alert">{printError}</p>}
        {!valid ? <p role="alert">{t('Choose a valid start and end date.', 'تاریخ آغاز و پایان درست انتخاب کنید.')}</p> : <>
          {!!report.sections[0].rows.length && <CompactTable className="financial-statement-totals" label={report.sections[0].title} columns={[
            { label: t('Currency', 'واحد پول'), width: '23%' },
            { label: t('Money In', 'آمد') },
            { label: t('Money Out', 'رفت') },
          ]}>{report.sections[0].rows.map(([unit, incoming, outgoing]) => <tr key={unit}>
            <th scope="row">{unit}</th><td><bdi>{incoming}</bdi></td><td><bdi>{outgoing}</bdi></td>
          </tr>)}</CompactTable>}
          {visible.length ? <CompactTable label={t('Transactions', 'معاملات')} columns={[
            { label: t('Date / receipt', 'تاریخ / رسید'), width: '24%' },
            { label: t('Account / description', 'حساب / شرح') },
            { label: t('Amount', 'مبلغ'), width: '29%' },
          ]}>{visible.map(item => <tr key={item.id}>
            <th scope="row"><bdi>{formatSolarHijri(item.date)}</bdi>
              {item.receipt_number > 0 && <small><bdi>#{item.receipt_number}</bdi></small>}
            </th>
            <td><strong>{item.branch}</strong><small>{item.description}</small>
              {transactionNotes(item, language) && <small>{transactionNotes(item, language)}</small>}
            </td>
            <td><strong className={item.direction === 'out' ? 'simple-money-out' : 'simple-money-in'}>
              <bdi>{item.direction === 'out' ? '−' : '+'}{reportMoney(cents(item.amount), item.currency)}</bdi>
            </strong></td>
          </tr>)}</CompactTable> : <p>{t('No transactions for this period.', 'در این بازه معامله‌ای ثبت نشده است.')}</p>}
        </>}
      </>}
    </div>
  </Modal>
}
