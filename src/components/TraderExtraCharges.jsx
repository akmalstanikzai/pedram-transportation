import { ArrowDownLeft } from 'lucide-react'
import { formatSolarHijri } from '../lib/solarHijri'
import CompactTable from './CompactTable'

export default function TraderExtraCharges({rows,language,money,onReceive,canReceive,disabled}) {
  const t = (en,fa)=>language==='fa' ? fa : en
  const title = t('Extra charges','بدهی‌های اضافی')
  return <CompactTable label={title} columns={[
    {label:t('Extra charge','بدهی اضافی')},
    {label:t('Charged / received','بدهی / دریافتی'),width:'29%'},
    {label:t('Remaining','باقی‌مانده'),width:'26%'},
  ]}>
    {rows.map(row=><tr key={row.id}>
      <th scope="row"><strong>{row.description}</strong><small><bdi dir="ltr">{formatSolarHijri(row.charge_date||row.date)}</bdi></small></th>
      <td><bdi dir="ltr">{money(row.charged)}</bdi><small>{t('Received','دریافتی')} · <bdi dir="ltr">{money(row.paid)}</bdi></small></td>
      <td><strong><bdi dir="ltr">{money(row.remaining)}</bdi></strong>
        {onReceive && row.remaining>0 && canReceive(row) && <button type="button" className="registry-secondary trader-booking-receive"
          disabled={disabled} onClick={()=>onReceive(row)}>
          <ArrowDownLeft size={14} aria-hidden="true"/>{t('Receive','دریافت')}
        </button>}
      </td>
    </tr>)}
    {!rows.length && <tr><td colSpan={3}>{t('No extra charges for this currency.','برای این واحد پول بدهی اضافی ثبت نشده است.')}</td></tr>}
  </CompactTable>
}
