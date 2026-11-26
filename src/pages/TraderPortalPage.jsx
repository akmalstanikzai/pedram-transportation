import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, ClipboardList, ContactRound, Printer, ReceiptText, RefreshCw, WalletCards } from 'lucide-react'
import { rpc, explain } from '../lib/operations'
import { currencies, cents } from '../lib/cashbook'
import { bookingBalances, traderBalance } from '../lib/traderAccounts'
import { managedBookingStatement, managedChargeLabel } from '../lib/managedBookings'
import { formatSolarHijri } from '../lib/solarHijri'
import { printRecord } from '../lib/recordExports'
import { managedStatementSections, traderPortalStatement } from '../lib/financialReports'
import CompactTable from '../components/CompactTable'
import ManagedBookingStatement from '../components/ManagedBookingStatement'
import { IconButton, Modal } from '../components/RecordTools'

export default function TraderPortalPage({language}){
 const t=(en,fa)=>language==='fa'?fa:en
 const [printError,setPrintError]=useState('')
 const [view,setView]=useState('activity')
 const [selectedBooking,setSelectedBooking]=useState(null)
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
 const statuses={confirmed:t('Confirmed','تأییدشده'),in_transit:t('On road','در راه'),completed:t('Completed','تکمیل‌شده'),cancelled:t('Cancelled','لغوشده')}
 const statementBooking=data?.bookings.find(row=>row.id===selectedBooking)
 const statement=statementBooking ? managedBookingStatement(data,selectedBooking) : null
 const statementTitle=statementBooking && `${t('Booking statement','صورت حساب بار نامه')} #${statementBooking.number}`
 function printStatement() {
   if (!data || loading || error) return
   setPrintError('')
   if (!printRecord(traderPortalStatement({data,currency,language}))) setPrintError(t('Allow pop-ups to print this statement.','برای چاپ صورت حساب، پنجرهٔ جدید را اجازه دهید.'))
 }
 return <div className="trader-portal role-workspace" aria-busy={loading}>
   <header className="role-workspace-header">
     <div className="role-workspace-identity">
       <span className="role-workspace-icon"><WalletCards size={23} aria-hidden="true" /></span>
       <div><h1>{t('My account','حساب من')}</h1>{data&&<p><bdi>{data.trader.name}</bdi></p>}</div>
     </div>
     <IconButton icon={RefreshCw} label={t('Refresh','تازه‌سازی')} onClick={load} disabled={loading} />
   </header>
   {(error||printError)&&<p className="registry-notice error" role="alert">{error||printError}</p>}
   {loading&&!data?<p role="status">{t('Loading account…','حساب در حال بارگیری است…')}</p>:data&&<>
     <div className="trader-portal-currency">
       <label>{t('Currency','واحد پول')}<select value={currency} onChange={e=>setCurrency(e.target.value)}>{currencies.map(value=><option key={value}>{value}</option>)}</select></label>
       <button type="button" className="registry-secondary" disabled={loading||!!error} onClick={printStatement}><Printer size={17} aria-hidden="true" />{t('Print / Save PDF','چاپ / ذخیره PDF')}</button>
     </div>
     <dl className="trader-portal-balances">
       <div data-balance="charge"><dt>{t('Total charges','مجموع بدهی')}</dt><dd><bdi dir="ltr">{money(totals.charged)}</bdi></dd></div>
       <div data-balance="paid"><dt>{t('Paid (net)','پرداخت خالص')}</dt><dd><bdi dir="ltr">{money(totals.received)}</bdi></dd></div>
       <div data-balance="owed"><dt>{t('Amount you owe','باقی‌مانده شما')}</dt><dd><bdi dir="ltr">{money(totals.owed)}</bdi></dd></div>
       <div data-balance="credit"><dt>{t('Your credit','طلب شما')}</dt><dd><bdi dir="ltr">{money(totals.credit)}</bdi></dd></div>
     </dl>
     <nav className="role-view-switch" aria-label={t('My account','حساب من')}>
       <button type="button" aria-pressed={view==='activity'} onClick={()=>setView('activity')}><ReceiptText size={17} aria-hidden="true" />{t('Account activity','معاملات حساب')}</button>
       <button type="button" aria-pressed={view==='bookings'} onClick={()=>setView('bookings')}><ClipboardList size={17} aria-hidden="true" />{t('My bookings','بار نامه‌های من')}</button>
     </nav>
     {view==='activity' ? <section className="trader-portal-section" aria-label={t('Account activity','معاملات حساب')}>
       <CompactTable label={t('Account activity','معاملات حساب')} columns={[
         {label:t('Date','تاریخ'),width:'23%'}, {label:t('Details','تفصیلات')}, {label:t('Amount','مبلغ'),width:'30%'},
       ]}>
         {history.map(row=><tr key={`${row.type}-${row.id}`}>
           <th scope="row"><bdi dir="ltr">{formatSolarHijri(row.date)}</bdi></th>
           <td>{row.managed_charge_key ? managedChargeLabel(row,language) : row.description}{row.voided_at&&<small>{t('Cancelled','لغوشده')}</small>}</td>
           <td data-transaction={row.type}>
             <strong><bdi dir="ltr">{money((row.type==='refund'?-1:1)*cents(row.amount))}</bdi></strong>
             <small>{row.type==='charge'?t('Charge','بدهی'):row.type==='refund'?t('Refund','بازپرداخت'):t('Payment','پرداخت')}</small>
           </td>
         </tr>)}
         {!history.length&&<tr><td colSpan={3}>{t('No account activity yet.','هنوز معامله‌ای ثبت نشده است.')}</td></tr>}
       </CompactTable>
     </section> : <section className="trader-portal-section" data-bookings aria-label={t('My bookings','بار نامه‌های من')}>
       <CompactTable label={t('My bookings','بار نامه‌های من')} columns={[
         {label:t('Booking / date','بار نامه / تاریخ'),width:'24%'}, {label:t('Route / goods','مسیر / بار')},
         {label:t('Charges / paid','بدهی / پرداخت'),width:'27%'},
       ]}>
         {bookings.map(row=><tr key={row.id}>
           <th scope="row"><bdi dir="ltr">#{row.number}</bdi><small><bdi dir="ltr">{formatSolarHijri(row.date)}</bdi></small><small>{statuses[row.status] || row.status}</small></th>
           <td><strong className="trader-portal-route"><bdi>{row.origin}</bdi><ArrowRight size={12} aria-hidden="true" /><bdi>{row.destination}</bdi></strong><small>{row.goods}{row.quantity&&` · ${row.quantity}`}</small>
             {row.managed_transport&&<button type="button" className="registry-secondary trader-booking-statement-button"
               onClick={()=>{setPrintError('');setSelectedBooking(row.id)}}>{t('View statement','مشاهده صورت حساب')}</button>}
             {row.commission!=null&&<details className="booking-contact-details"><summary>{t('Charges','بدهی‌ها')}</summary>
               <small>{t('Commission','کمیسیون')} · <bdi>{bookingMoney(row.commission,row.currency)}</bdi></small>
               {row.freight!=null&&<small>{t('Freight','کرایه بار')} · <bdi>{bookingMoney(row.freight,row.currency)}</bdi></small>}
               {row.vehicle_cost!=null&&<small>{t('Vehicle / driver','واسطه و راننده')} · <bdi>{bookingMoney(row.vehicle_cost,row.currency)}</bdi></small>}
               {(row.other_expenses||[]).map((expense,index)=><small key={index}>{expense.description} · <bdi>{bookingMoney(expense.amount,row.currency)}</bdi></small>)}
             </details>}
           </td>
           <td>{row.managed_transport&&!row.charged&&!row.paid ? '—' : <>
             <bdi>{money(row.charged)}</bdi><small>{t('Paid','پرداخت')} · <bdi>{money(row.paid)}</bdi></small>
             <small>{t('Remaining','باقی‌مانده')} · <strong><bdi>{money(row.remaining)}</bdi></strong></small>
           </>}</td>
         </tr>)}
         {!bookings.length&&<tr><td colSpan={3}>{t('No bookings in this currency.','در این واحد پول بار نامه ثبت نشده است.')}</td></tr>}
       </CompactTable>
     </section>}
     {(data.trader.phone || data.trader.address) && <footer className="trader-portal-profile">
       <ContactRound size={16} aria-hidden="true" />
       <span>{t('Account contact','تماس حساب')}</span>
       {data.trader.phone && <bdi dir="ltr">{data.trader.phone}</bdi>}
       {data.trader.address && <bdi>{data.trader.address}</bdi>}
     </footer>}
     {statement&&<Modal title={statementTitle} onClose={()=>setSelectedBooking(null)} className="managed-statement-dialog">
       <div className="record-modal-body">
         <button type="button" className="registry-secondary" onClick={()=>{
           setPrintError('')
           const sections=managedStatementSections(statement,language)
           if(!printRecord({language,title:statementTitle,subtitle:`${statementBooking.origin} → ${statementBooking.destination}`,sections}))
             setPrintError(t('Allow pop-ups to print this statement.','برای چاپ صورت حساب، پنجرهٔ جدید را اجازه دهید.'))
         }}><Printer size={17} aria-hidden="true"/>{t('Print / Save PDF','چاپ / ذخیره PDF')}</button>
         {printError&&<p role="alert">{printError}</p>}
         <ManagedBookingStatement data={statement} language={language}/>
       </div>
     </Modal>}
   </>}
 </div>
}
