import { useCallback, useEffect, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, RefreshCw, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { allRows, cents, currencies, kabulToday, simpleLedger } from '../lib/cashbook'

export default function CashbookPage({ language, profile, initialScope, initialCurrency, highlightEntry }) {
  const t=(en,fa)=>language==='fa'?fa:en
  const president=profile?.role==='president'
  const [data,setData]=useState({branches:[],accounts:[],entries:[]})
  const [loading,setLoading]=useState(true)
  const [loaded,setLoaded]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [scope,setScope]=useState(president?(initialScope || 'all'):profile?.branch_id || '')
  const [currency,setCurrency]=useState(currencies.includes(initialCurrency)?initialCurrency:'AFN')
  const [direction,setDirection]=useState('')
  const [form,setForm]=useState({scope:'',amount:'',description:'',date:''})
  const [request,setRequest]=useState('')
  const [busy,setBusy]=useState(false)
  const [uncertain,setUncertain]=useState(false)
  const load=useCallback(async()=>{
    if(!supabase)throw new Error('Database unavailable')
    const [branches,accounts,entries]=await Promise.all(['branches','cashbook_accounts','cashbook_entries'].map(table=>allRows(supabase,table)))
    setData({branches,accounts,entries});setLoaded(true)
  },[])
  useEffect(()=>{
    let active=true
    void Promise.resolve().then(load).catch(()=>{if(active)setError(language==='fa'?'روزنامچه بارگیری نشد. اتصال و تنظیمات دیتابیس را بررسی کنید.':'Could not load the cashbook. Check the connection and database setup.')}).finally(()=>{if(active)setLoading(false)})
    return()=>{active=false}
  },[load,language])
  useEffect(()=>{
    if(!loaded||!highlightEntry)return undefined
    const frame=requestAnimationFrame(()=>document.getElementById(`cashbook-entry-${highlightEntry}`)?.scrollIntoView({block:'center'}))
    return()=>cancelAnimationFrame(frame)
  },[loaded,highlightEntry])
  const money=value=>`${(value/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})} ${currency}`
  const name=id=>id?data.branches.find(b=>b.id===id)?.name||'—':t('Admin account','حساب مرکزی')
  const ledger=simpleLedger(data.accounts,data.entries,scope,currency)
  const accountOptions=<>{president&&<option value="admin">{t('Admin account','حساب مرکزی')}</option>}{data.branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</>
  function start(flow){
    setDirection(flow);setRequest(crypto.randomUUID());setUncertain(false);setError('');setNotice('')
    setForm({scope:scope==='all'?'admin':scope,amount:'',description:'',date:kabulToday()})
  }
  async function refresh(){
    setLoading(true);setError('')
    try{await load()}catch{setError(t('Could not load records. Try again.','معلومات بارگیری نشد. دوباره کوشش کنید.'))}finally{setLoading(false)}
  }
  async function save(e){
    e.preventDefault();if(busy)return
    setBusy(true);setError('')
    try{
      const {error:failure}=await supabase.rpc('cashbook_simple_post',{p_request:request,p_data:{branch_id:form.scope==='admin'?null:form.scope,currency,direction,amount:form.amount,date:form.date,description:form.description.trim()}})
      if(failure){
        const messages={ACCESS_DENIED:t('You cannot record money for this account.','شما اجازه ثبت پول در این حساب را ندارید.'),INVALID_AMOUNT:t('Enter a positive amount with up to two decimal places.','یک مبلغ مثبت با حداکثر دو رقم اعشار وارد کنید.'),INVALID_DATE:t('Choose today or an earlier date.','تاریخ امروز یا گذشته را انتخاب کنید.'),DESCRIPTION_REQUIRED:t('Enter a name or description.','نام یا شرح معامله را وارد کنید.')}
        const key=Object.keys(messages).find(k=>failure.message.includes(k))
        if(key){setUncertain(false);throw new Error(messages[key])}
        setUncertain(true);throw new Error(t('Save was not confirmed. Retry with the same details or close and refresh before entering again.','ثبت تأیید نشد. با همین معلومات دوباره کوشش کنید یا قبل از ثبت مجدد، فهرست را تازه‌سازی کنید.'))
      }
      setDirection('');setNotice(t('Saved.','ثبت شد.'))
      try{await load()}catch{setNotice(t('Saved. Refresh the list to see the updated balance.','ثبت شد. برای دیدن موجودی جدید، فهرست را تازه‌سازی کنید.'))}
    }catch(err){setError(err.message)}finally{setBusy(false)}
  }
  return <div className="simple-cashbook">
    <div className="booking-page-header"><h1>{t('Cashbook','روزنامچه')}</h1><button className="registry-secondary" aria-label={t('Refresh','تازه‌سازی')} title={t('Refresh','تازه‌سازی')} disabled={loading||busy} onClick={refresh}><RefreshCw size={17}/></button></div>
    <div className="simple-cashbook-toolbar">
      {president?<label><span>{t('Account','حساب')}</span><select value={scope} disabled={busy||!!direction} onChange={e=>setScope(e.target.value)}><option value="all">{t('All accounts','تمام حساب‌ها')}</option>{accountOptions}</select></label>:<strong>{name(profile?.branch_id)}</strong>}
      <label><span>{t('Currency','واحد پول')}</span><select value={currency} disabled={busy||!!direction} onChange={e=>setCurrency(e.target.value)}>{currencies.map(c=><option key={c}>{c}</option>)}</select></label>
      <div className="simple-cashbook-buttons"><button className="cashbook-in" disabled={loading||!loaded||busy||!!direction||(!president&&!profile?.branch_id)} onClick={()=>start('in')}><ArrowDownLeft size={20}/>{t('Money In','آمد')}</button><button className="cashbook-out" disabled={loading||!loaded||busy||!!direction||(!president&&!profile?.branch_id)} onClick={()=>start('out')}><ArrowUpRight size={20}/>{t('Money Out','رفت')}</button></div>
    </div>
    {notice&&<p className="registry-notice success" role="status">{notice}</p>}
    {error&&<p className="registry-notice error" role="alert">{error}</p>}
    {direction&&<form className="simple-cashbook-form" onSubmit={save}><div className="simple-cashbook-form-heading"><h2>{direction==='in'?t('Money In','آمد'):t('Money Out','رفت')}</h2><button type="button" aria-label={t('Close','بستن')} disabled={busy} onClick={()=>{setDirection('');setError('')}}><X size={18}/></button></div><fieldset disabled={busy||uncertain}>
      {president&&<label><span>{t('Account','حساب')} *</span><select required value={form.scope} onChange={e=>setForm({...form,scope:e.target.value})}>{accountOptions}</select></label>}
      <label><span>{t('Date','تاریخ')} *</span><input required type="date" max={kabulToday()} value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></label>
      <label className="simple-cashbook-description"><span>{t('Name / description','نام / شرح معامله')} *</span><input required autoFocus value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
      <label><span>{t('Amount','مبلغ')} ({currency}) *</span><input required type="number" min="0.01" max="999999999999.99" step="0.01" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/></label>
    </fieldset><div className="registry-form-actions"><button type="button" disabled={busy} onClick={()=>{setDirection('');setError('')}}>{t('Cancel','انصراف')}</button><button className="registry-primary" disabled={busy}>{busy?t('Saving…','در حال ثبت…'):uncertain?t('Retry','کوشش مجدد'):t('Save','ثبت')}</button></div></form>}
    {loading?<p role="status">{t('Loading…','در حال بارگیری…')}</p>:loaded&&<>
      <div className="cashbook-ledger-spread">{['in','out'].map(flow=>{
        const incoming=flow==='in'
        const rows=ledger.rows.filter(e=>e.direction===flow)
        const title=incoming?t('Money In','آمد'):t('Money Out','رفت')
        const Icon=incoming?ArrowDownLeft:ArrowUpRight
        return <section key={flow} className={`cashbook-ledger-side ${incoming?'ledger-in':'ledger-out'}`} dir={language==='fa'?'rtl':'ltr'} aria-label={title}>
          <h2><Icon size={21}/>{title}</h2>
          <div className="simple-cashbook-list"><table><thead><tr><th scope="col">{t('Date','تاریخ')}</th><th scope="col">{t('Description','شرح معامله')}</th><th scope="col">{t('Amount','مبلغ')}</th></tr></thead><tbody>
            {rows.map(e=><tr key={e.id} id={`cashbook-entry-${e.id}`} className={highlightEntry===e.id?'search-highlight':undefined}><td>{e.entry_date}</td><td>{e.opening?t('Earlier balance','موجودی قبلی'):e.description}{president&&<small className="cashbook-ledger-account">{name(e.branch_id)}</small>}</td><td className={incoming?'simple-money-in':'simple-money-out'}>{money(cents(e.amount))}</td></tr>)}
            {!rows.length&&<tr><td colSpan={3} className="simple-cashbook-empty">{incoming?t('No money received yet.','هنوز دریافتی ثبت نشده است.'):t('No money paid yet.','هنوز پرداختی ثبت نشده است.')}</td></tr>}
          </tbody><tfoot><tr><th scope="row" colSpan={2}>{incoming?t('Total received','مجموع آمد'):t('Total paid','مجموع رفت')}</th><td className={incoming?'simple-money-in':'simple-money-out'}>{money(incoming?ledger.incoming:ledger.outgoing)}</td></tr></tfoot></table></div>
        </section>
      })}</div>
      <div className="simple-cashbook-balance"><span>{t('Balance','موجودی')}</span><strong>{money(ledger.balance)}</strong></div>
    </>}
  </div>
}
