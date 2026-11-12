import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatSolarHijri } from '../lib/solarHijri'
import { Modal } from './RecordTools'

export default function DriverTransactions({ driver, language, onClose }) {
  const t = (en, fa) => language === 'fa' ? fa : en
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    void supabase.rpc('driver_cashbook_transactions', { p_driver: driver.id }).then(({ data, error: loadError }) => {
      if (!active) return
      if (loadError) setError(loadError.message)
      else setTransactions(data || [])
      setLoading(false)
    })
    return () => { active = false }
  }, [driver.id])
  return <Modal title={`${driver.full_name} · ${t('Transactions', 'معاملات')}`} onClose={onClose}>
    <div className="record-modal-body">
      {loading ? <p role="status">{t('Loading…', 'در حال بارگیری…')}</p>
        : error ? <p className="registry-notice error" role="alert">{error}</p>
          : transactions.length ? <div className="employee-transactions">{transactions.map(item => <article key={item.id}>
            <div><strong>#{item.receipt_number} · {formatSolarHijri(item.date)}</strong><span>{item.branch} · {item.currency}</span></div>
            <p>{item.description}</p>
            <strong className={item.direction === 'out' ? 'simple-money-out' : 'simple-money-in'}>{item.direction === 'out' ? '−' : '+'}{Number(item.amount).toLocaleString(language === 'fa' ? 'fa-AF' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {item.currency}</strong>
            {item.loan_due_date && <small className="loan-deadline">{t('Loan deadline', 'مهلت قرض')}: {formatSolarHijri(item.loan_due_date)} · {item.reversed_by ? t('Reversed', 'معکوس‌شده') : Number(item.loan_remaining) <= 0 ? t('Paid', 'پرداخت‌شده') : `${t('Remaining', 'باقی‌مانده')}: ${Number(item.loan_remaining).toLocaleString()} ${item.currency}`}</small>}
            {item.loan_repayment_entry_id && <small>{t('Loan repayment', 'بازپرداخت قرض')}</small>}
            {item.reversed_by && <small>{t('Reversed by', 'اصلاح‌شده با')} #{item.reversed_by}</small>}
            {item.reversal && <small>{t('Reversal', 'معامله معکوس')}</small>}
          </article>)}</div> : <p>{t('No transactions for this driver yet.', 'هنوز معامله‌ای برای این راننده ثبت نشده است.')}</p>}
    </div>
  </Modal>
}
