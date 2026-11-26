import { managedStatementSections } from '../lib/financialReports'
import CompactTable from './CompactTable'
import './ManagedBookingStatement.css'

export default function ManagedBookingStatement({ data, language, onPayExpense }) {
  const t = (en,fa) => language === 'fa' ? fa : en
  return <div className="managed-booking-statement">
    {managedStatementSections(data,language).map(section=>{
      const actions = section.key==='charges' && !!onPayExpense
      if (section.key==='balances' && !data.balances) return null
      const columns = section.headers.map((label,i)=>({label,width:actions ? undefined : section.widths[i]+'%'}))
      if (actions) columns.push({label:t('Payment','تادیه')})
      return <section key={section.key} className={'managed-statement-'+section.key}>
        <h3>{section.title}</h3>
        <CompactTable label={section.title} columns={columns}>
          {section.rows.map((row,i)=><tr key={section.key==='charges' ? data.charges[i].id : section.key==='payments' ? data.payments[i].id : row[0]}>
            <th scope="row">{row[0]}</th>
            {row.slice(1).map((value,j)=><td key={j}>{section.numeric.includes(j+1)?<bdi>{value}</bdi>:value}</td>)}
            {actions && <td>{data.charges[i].paid_on
              ? <bdi>#{data.charges[i].receipt_number}</bdi>
              : data.charges[i].key==='commission' ? '—' : <button type="button" className="registry-secondary" onClick={()=>onPayExpense(data.charges[i])}>{t('Mark as paid','ثبت تادیه')}</button>}</td>}
          </tr>)}
          {!section.rows.length&&<tr><td colSpan={columns.length}>{t('No records yet.','هنوز ریکارد ثبت نشده است.')}</td></tr>}
        </CompactTable>
      </section>
    })}
  </div>
}
