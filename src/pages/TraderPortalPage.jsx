import { useCallback, useEffect, useState } from 'react'
import { ClipboardList, Printer, RefreshCw, WalletCards } from 'lucide-react'
import { rpc, explain } from '../lib/operations'
import { currencies, cents } from '../lib/cashbook'
import { bookingBalances, traderBalance } from '../lib/traderAccounts'
import { formatSolarHijri } from '../lib/solarHijri'
import { printRecord } from '../lib/recordExports'
import { traderPortalStatement } from '../lib/financialReports'
import CompactTable from '../components/CompactTable'

export default function TraderPortalPage({language}){
 const t=(en,fa)=>language==='fa'?fa:en
 const [printError,setPrintError]=useState('')
 const [data,setData]=useState(null),[currency,setCurrency]=useState('AFN'),[loading,setLoading]=useState(true),[error,setError]=useState('')
 const load=useCallback(async()=>{setLoading(true);setError('');try{setData(await rpc('trader_portal_statement',{}))}catch(e){setError(explain(e,language))}finally{setLoading(false)}},[language])
 useEffect(()=>{void Promise.resolve().then(load)},[load])
 const totals=data?traderBalance(data.charges,data.payments,currency):{charged:0,received:0,owed:0,credit:0}
 const money=value=>`${(value/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})} ${currency}`
 const bookingMoney=(value,unit)=>`${Number(value||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})} ${unit||'AFN'}`
 const history=data?[...data.charges.filter(row=>row.currency===currency).map(row=>({...row,date:row.date,type:'charge'})),...data.payments.filter(row=>row.currency===currency).map(row=>({...row,type:row.direction==='in'?'payment':'refund'}))].sort((a,b)=>b.date.localeCompare(a.date)):[]
 const bookings = data ? bookingBalances(data, currency)
   .filter(row => !row.currency || row.currency === currency || row.charged || row.paid)
   .sort((a,b) => b.date.localeCompare(a.date) || b.number-a.number) : []
 function printStatement() {
   if (!data || loading || error) return
   setPrintError('')
   if (!printRecord(traderPortalStatement({data,currency,language}))) setPrintError(t('Allow pop-ups to print this statement.','برای چاپ صورت حساب، پنجرهٔ جدید را اجازه دهید.'))
 }
 return <div className="trader-portal">
   <div className="booking-page-header">
     <div><h1>{t('My account','حساب من')}</h1>{data&&<p>{data.trader.name} · {data.trader.phone}{data.trader.address&&` · ${data.trader.address}`}</p>}</div>
     <button className="registry-secondary" onClick={load} disabled={loading} aria-label={t('Refresh','تازه‌سازی')}><RefreshCw size={18}/></button>
   </div>
   {(error||printError)&&<p className="registry-notice error" role="alert">{error||printError}</p>}
   {loading&&!data?<p role="status">{t('Loading account…','حساب در حال بارگیری است…')}</p>:data&&<>
     <div className="trader-portal-currency">
       <button className="registry-secondary" disabled={loading||!!error} onClick={printStatement}><Printer size={17}/>{t('Print / Save PDF','چاپ / ذخیره PDF')}</button>
       <label>{t('Currency','واحد پول')}<select value={currency} onChange={e=>setCurrency(e.target.value)}>{currencies.map(value=><option key={value}>{value}</option>)}</select></label>
     </div>
     <div className="cashbook-summary">
       <div><span>{t('Total charges','مجموع بدهی')}</span><strong>{money(totals.charged)}</strong></div>
       <div><span>{t('Paid (net)','پرداخت خالص')}</span><strong>{money(totals.received)}</strong></div>
       <div><span>{t('Amount you owe','باقی‌مانده شما')}</span><strong>{money(totals.owed)}</strong></div>
       <div className="cashbook-summary-balance"><span>{t('Your credit','طلب شما')}</span><strong>{money(totals.credit)}</strong></div>
     </div>
     <section className="trader-portal-section">
       <h2><WalletCards size={21}/>{t('Account activity','معاملات حساب')}</h2>
       <CompactTable label={t('Account activity','معاملات حساب')} columns={[
         {label:t('Date','تاریخ'),width:'23%'}, {label:t('Description','شرح')},
         {label:t('Charge','بدهی'),width:'20%'}, {label:t('Payment','پرداخت'),width:'20%'},
       ]}>
         {history.map(row=><tr key={`${row.type}-${row.id}`}>
           <th scope="row"><bdi>{formatSolarHijri(row.date)}</bdi></th>
           <td>{row.description}{row.voided_at&&<small>{t('Cancelled','لغوشده')}</small>}</td>
           <td>{row.type==='charge'?<bdi>{money(cents(row.amount))}</bdi>:'—'}</td>
           <td>{row.type==='charge'?'—':<bdi>{money((row.type==='refund'?-1:1)*cents(row.amount))}</bdi>}</td>
         </tr>)}
         {!history.length&&<tr><td colSpan={4}>{t('No account activity yet.','هنوز معامله‌ای ثبت نشده است.')}</td></tr>}
       </CompactTable>
     </section>
     <section className="trader-portal-section">
       <h2><ClipboardList size={21}/>{t('My bookings','بار نامه‌های من')}</h2>
       <CompactTable label={t('My bookings','بار نامه‌های من')} columns={[
         {label:t('Booking / date','بار نامه / تاریخ'),width:'24%'}, {label:t('Route / goods','مسیر / بار')},
         {label:t('Charges / paid','بدهی / پرداخت'),width:'27%'},
       ]}>
         {bookings.map(row=><tr key={row.id}>
           <th scope="row"><bdi>#{row.number}</bdi><small><bdi>{formatSolarHijri(row.date)}</bdi></small><small>{row.status}</small></th>
           <td><strong>{row.origin} → {row.destination}</strong><small>{row.goods}{row.quantity&&` · ${row.quantity}`}</small>
             {row.commission!=null&&<details className="booking-contact-details"><summary>{t('Charges','بدهی‌ها')}</summary>
               <small>{t('Commission','کمیسیون')} · <bdi>{bookingMoney(row.commission,row.currency)}</bdi></small>
               {row.freight!=null&&<small>{t('Freight','کرایه بار')} · <bdi>{bookingMoney(row.freight,row.currency)}</bdi></small>}
               {row.vehicle_cost!=null&&<small>{t('Vehicle / driver','واسطه و راننده')} · <bdi>{bookingMoney(row.vehicle_cost,row.currency)}</bdi></small>}
               {(row.other_expenses||[]).map((expense,index)=><small key={index}>{expense.description} · <bdi>{bookingMoney(expense.amount,row.currency)}</bdi></small>)}
             </details>}
           </td>
           <td><bdi>{money(row.charged)}</bdi><small>{t('Paid','پرداخت')} · <bdi>{money(row.paid)}</bdi></small>
             <small>{t('Remaining','باقی‌مانده')} · <strong><bdi>{money(row.remaining)}</bdi></strong></small></td>
         </tr>)}
         {!bookings.length&&<tr><td colSpan={3}>{t('No bookings yet.','هنوز بوکینگ ثبت نشده است.')}</td></tr>}
       </CompactTable>
     </section>
   </>}
 </div>
}
