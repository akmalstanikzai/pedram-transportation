import { useCallback, useEffect, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { allRows, cents, currencies, kabulToday, simpleLedger } from '../lib/cashbook'
import SolarHijriDateInput from '../components/SolarHijriDateInput'
import { formatSolarHijri } from '../lib/solarHijri'

export default function CashbookPage({ language, profile }) {
  const t=(en,fa)=>language==='fa'?fa:en
  const president=profile?.role==='president'
  const [data,setData]=useState({branches:[],accounts:[],entries:[]})
  const [traders,setTraders]=useState([])
  const [loading,setLoading]=useState(true)
  const [loaded,setLoaded]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [scope,setScope]=useState(president?'all':profile?.branch_id || '')
  const [currency,setCurrency]=useState('AFN')
  const [form,setForm]=useState({scope:president?'admin':profile?.branch_id||'',amount:'',description:'',date:kabulToday(),trader_id:''})
  const [request,setRequest]=useState(()=>crypto.randomUUID())
  const [retryDirection,setRetryDirection]=useState('')
  const [busy,setBusy]=useState(false)
  const [uncertain,setUncertain]=useState(false)
  const load=useCallback(async()=>{
    if(!supabase)throw new Error('Database unavailable')
    const [branches,accounts,entries]=await Promise.all(['branches','cashbook_accounts','cashbook_entries'].map(table=>allRows(supabase,table)))
    setData({branches,accounts,entries});setLoaded(true)
    setTraders(await allRows(supabase,'traders'))
  },[])
  useEffect(()=>{
    let active=true
    void Promise.resolve().then(load).catch(()=>{if(active)setError(language==='fa'?'روزنامچه بارگیری نشد. اتصال و تنظیمات دیتابیس را بررسی کنید.':'Could not load the cashbook. Check the connection and database setup.')}).finally(()=>{if(active)setLoading(false)})
    return()=>{active=false}
  },[load,language])
  const money=value=>`${(value/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})} ${currency}`
  const name=id=>id?data.branches.find(b=>b.id===id)?.name||'—':t('Admin account','حساب مرکزی')
  const ledger=simpleLedger(data.accounts,data.entries,scope,currency)
  const accountOptions=<>{president&&<option value="admin">{t('Admin account','حساب مرکزی')}</option>}{data.branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</>
  async function refresh(){
    setLoading(true);setError('')
    try{await load();setUncertain(false);setRetryDirection('');setRequest(crypto.randomUUID())}catch{setError(t('Could not load records. Try again.','معلومات بارگیری نشد. دوباره کوشش کنید.'))}finally{setLoading(false)}
  }
  async function save(e){
    e.preventDefault();if(busy)return
    const direction=e.nativeEvent.submitter?.value
    if(!['in','out'].includes(direction)||uncertain&&direction!==retryDirection)return
    setBusy(true);setError('')
    try{
      const {error:failure}=await supabase.rpc('cashbook_simple_post',{p_request:request,p_data:{branch_id:form.scope==='admin'?null:form.scope,currency,direction,amount:form.amount,date:form.date,description:form.description.trim(),trader_id:form.trader_id||null}})
      if(failure){
        const messages={ACCESS_DENIED:t('You cannot record money for this account.','شما اجازه ثبت پول در این حساب را ندارید.'),INVALID_AMOUNT:t('Enter a positive amount with up to two decimal places.','یک مبلغ مثبت با حداکثر دو رقم اعشار وارد کنید.'),INVALID_DATE:t('Choose today or an earlier date.','تاریخ امروز یا گذشته را انتخاب کنید.'),DESCRIPTION_REQUIRED:t('Enter a name or description.','نام یا شرح معامله را وارد کنید.')}
        const key=Object.keys(messages).find(k=>failure.message.includes(k))
        if(key){setUncertain(false);throw new Error(messages[key])}
        setUncertain(true);setRetryDirection(direction);throw new Error(t('Save was not confirmed. Retry the same direction with the same details, or refresh before entering again.','ثبت تأیید نشد. با همان جهت و معلومات دوباره کوشش کنید یا پیش از ثبت مجدد، فهرست را تازه‌سازی کنید.'))
      }
      setRequest(crypto.randomUUID());setRetryDirection('');setUncertain(false)
      setForm(previous=>({...previous,amount:'',description:'',trader_id:''}))
      setNotice(t('Saved.','ثبت شد.'))
      try{await load()}catch{setNotice(t('Saved. Refresh the list to see the updated balance.','ثبت شد. برای دیدن موجودی جدید، فهرست را تازه‌سازی کنید.'))}
    }catch(err){setError(err.message)}finally{setBusy(false)}
  }
  return <div className="simple-cashbook">
    <div className="booking-page-header"><h1>{t('Cashbook','روزنامچه')}</h1><button className="registry-secondary" aria-label={t('Refresh','تازه‌سازی')} title={t('Refresh','تازه‌سازی')} disabled={loading||busy} onClick={refresh}><RefreshCw size={17}/></button></div>
    <div className="simple-cashbook-toolbar">
      {president?<label><span>{t('Show records for','نمایش معاملات حساب')}</span><select value={scope} disabled={busy||uncertain} onChange={e=>{setScope(e.target.value);setForm(previous=>({...previous,scope:e.target.value==='all'?'admin':e.target.value,trader_id:''}))}}><option value="all">{t('All accounts','تمام حساب‌ها')}</option>{accountOptions}</select></label>:<strong>{name(profile?.branch_id)}</strong>}
      <label><span>{t('Currency','واحد پول')}</span><select value={currency} disabled={busy||uncertain} onChange={e=>setCurrency(e.target.value)}>{currencies.map(c=><option key={c}>{c}</option>)}</select></label>
    </div>
    {notice&&<p className="registry-notice success" role="status">{notice}</p>}
    {error&&<p className="registry-notice error" role="alert">{error}</p>}
    <form className="simple-cashbook-form" onSubmit={save}><div className="simple-cashbook-form-heading"><h2>{t('Add a record','ثبت معامله')}</h2><p>{t('Enter the details, then choose Money In or Money Out.','معلومات را وارد کنید، سپس آمد یا رفت را انتخاب کنید.')}</p></div><fieldset disabled={busy||uncertain}>
      {president&&<label className="cashbook-account-field"><span>{t('Record in account','ثبت در حساب')} *</span><select required value={form.scope} onChange={e=>setForm({...form,scope:e.target.value,trader_id:''})}>{accountOptions}</select></label>}
      <label className="cashbook-description-field"><span>{t('Name / description','نام / شرح معامله')} *</span><input required placeholder={t('Who or what is this for?','نام شخص یا دلیل معامله')} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
      <label className="cashbook-amount-field"><span>{t('Amount','مبلغ')} ({currency}) *</span><input required type="number" inputMode="decimal" min="0.01" max="999999999999.99" step="0.01" placeholder="0.00" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/></label>
      <label className="cashbook-date-field"><span>{t('Date','تاریخ')} *</span><SolarHijriDateInput required max={kabulToday()} language={language} value={form.date} onChange={date=>setForm({...form,date})} ariaLabel={t('Date','تاریخ')}/></label>
      {traders.length>0&&<details className="simple-cashbook-description"><summary>{t('Link to a trader (optional)','وصل به حساب تاجر (اختیاری)')}</summary><label><span>{t('Trader','تاجر')}</span><select value={form.trader_id||''} onChange={e=>setForm({...form,trader_id:e.target.value})}><option value="">—</option>{traders.filter(r=>!r.archived_at&&(!r.branch_id||r.branch_id===form.scope)).map(r=><option key={r.id} value={r.id}>{r.full_name} · {r.phone}</option>)}</select></label></details>}
    </fieldset><div className="simple-cashbook-buttons"><button type="submit" value="out" className="cashbook-out" disabled={loading||!loaded||busy||uncertain&&retryDirection!=='out'||(!president&&!profile?.branch_id)}><ArrowUpRight size={20}/>{busy&&retryDirection==='out'?t('Saving…','در حال ثبت…'):uncertain&&retryDirection==='out'?t('Retry Money Out','کوشش مجدد رفت'):t('Save Money Out','ثبت پول رفت')}</button><button type="submit" value="in" className="cashbook-in" disabled={loading||!loaded||busy||uncertain&&retryDirection!=='in'||(!president&&!profile?.branch_id)}><ArrowDownLeft size={20}/>{busy&&retryDirection==='in'?t('Saving…','در حال ثبت…'):uncertain&&retryDirection==='in'?t('Retry Money In','کوشش مجدد آمد'):t('Save Money In','ثبت پول آمد')}</button></div></form>
    {loading?<p role="status">{t('Loading…','در حال بارگیری…')}</p>:loaded&&<>
      <section className="cashbook-ledger" aria-label={t('Cashbook records','معاملات روزنامچه')}><h2>{t('Records','معاملات')}</h2><div className="simple-cashbook-list"><table><thead><tr><th scope="col">{t('Date','تاریخ')}</th><th scope="col">{t('Description','شرح معامله')}</th><th scope="col">{t('Money In','آمد')}</th><th scope="col">{t('Money Out','رفت')}</th></tr></thead><tbody>
        {ledger.rows.map(e=><tr key={e.id} className={e.direction==='in'?'cashbook-row-in':'cashbook-row-out'}><td>{formatSolarHijri(e.entry_date)}</td><td>{e.opening?t('Earlier balance','موجودی قبلی'):e.description}{president&&<small className="cashbook-ledger-account">{name(e.branch_id)}</small>}</td><td className={e.direction==='in'?'simple-money-in':'cashbook-empty-amount'}>{e.direction==='in'?money(cents(e.amount)):'—'}</td><td className={e.direction==='out'?'simple-money-out':'cashbook-empty-amount'}>{e.direction==='out'?money(cents(e.amount)):'—'}</td></tr>)}
        {!ledger.rows.length&&<tr><td colSpan={4} className="simple-cashbook-empty">{t('No records yet.','هنوز معامله‌ای ثبت نشده است.')}</td></tr>}
      </tbody><tfoot><tr><th scope="row" colSpan={2}>{t('Totals','مجموع')}</th><td className="simple-money-in">{money(ledger.incoming)}</td><td className="simple-money-out">{money(ledger.outgoing)}</td></tr><tr className="cashbook-balance-row"><th scope="row" colSpan={2}>{t('Balance','موجودی')}</th><td colSpan={2}>{money(ledger.balance)}</td></tr></tfoot></table></div></section>
    </>}
  </div>
}
