import { currencies } from '../lib/cashbook'
import { managedBookingTotals, managedChargeLabel } from '../lib/managedBookings'
import { reportMoney } from '../lib/financialReports'

export default function ManagedBookingCharges({ charges, setCharges, language }) {
  const t=(en,fa)=>language==='fa'?fa:en
  const update=(key,fields)=>setCharges(current=>current.map(row=>row.key===key ? {...row,...fields} : row))
  const totals=managedBookingTotals(charges)
  return <div className="wide managed-charge-form">
    <div className="managed-charge-row managed-charge-heading" aria-hidden="true">
      <span>{t('Charge','نوع مصرف')}</span><span>{t('Amount','مبلغ')}</span><span>{t('Currency','واحد')}</span>
    </div>
    {charges.map(row=>{
      const other=row.key.startsWith('other:')
      const label=other ? t('Other expense','مصرف دیگر') : managedChargeLabel(row,language)
      const locked=!!row.paid_on
      return <div key={row.key} className="managed-charge-line">
        {other && <label>
          <span>{t('Expense description','تفصیلات مصرف')}</span>
          <input required maxLength={200} disabled={locked} value={row.description??''}
            onChange={event=>update(row.key,{description:event.target.value})}/>
        </label>}
        <div className="managed-charge-row">
          <span>{label}</span>
          <input aria-label={`${label} · ${t('Amount','مبلغ')}`} type="number" inputMode="decimal" dir="ltr"
            required={other||row.has_receipt} disabled={locked} min="0.01" max="999999999999.99" step="0.01" value={row.amount}
            onChange={event=>update(row.key,{amount:event.target.value})}/>
          <select aria-label={`${label} · ${t('Currency','واحد پول')}`} dir="ltr" disabled={locked} value={row.currency}
            onChange={event=>update(row.key,{currency:event.target.value})}>
            {currencies.map(currency=><option key={currency}>{currency}</option>)}
          </select>
        </div>
        {other&&!row.has_receipt&&<button className="registry-secondary" type="button"
          onClick={()=>setCharges(current=>current.filter(line=>line.key!==row.key))}>{t('Remove expense','حذف مصرف')}</button>}
      </div>
    })}
    <button className="registry-secondary managed-add-expense" type="button" disabled={charges.length>=40}
      onClick={()=>setCharges(current=>[...current,{key:`other:${crypto.randomUUID()}`,amount:'',currency:'AFN',description:''}])}>
      {t('Add other expense','افزودن مصرف دیگر')}
    </button>
    {totals.length>0&&<div className="managed-form-totals">
      <strong>{t('Total owed by trader','مجموع بدهی تاجر')}</strong>
      {totals.map(({currency,charged})=><bdi key={currency}>{reportMoney(Math.round(charged*100),currency)}</bdi>)}
    </div>}
  </div>
}
