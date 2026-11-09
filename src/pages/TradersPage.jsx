import { useCallback, useEffect, useRef, useState } from 'react'
import { Archive, KeyRound, Plus, Search, Users, WalletCards } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { allRows } from '../lib/cashbook'
import { rpc, explain } from '../lib/operations'
import { ConfirmArchive, IconButton, Modal, RecordTools } from '../components/RecordTools'
import TraderAccount from '../components/TraderAccount'
import TraderLogin from '../components/TraderLogin'
const fields=[['first_name','First name','نام',true],['last_name','Surname','تخلص',false],['phone','Mobile','موبایل',true],['address','Address','آدرس',true]]
export default function TradersPage({language,profile}){
 return profile?.role==='president' && profile.account_enabled !== false
   ? <TraderDirectory language={language} profile={profile}/>
   : null
}

function TraderDirectory({language,profile}){
 const t=(en,fa)=>language==='fa'?fa:en
 const [rows,setRows]=useState([]),[query,setQuery]=useState(''),[archived,setArchived]=useState(false),[form,setForm]=useState({}),[edit,setEdit]=useState(null),[open,setOpen]=useState(false),[detail,setDetail]=useState(null),[loginTrader,setLoginTrader]=useState(null),[deletion,setDeletion]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const request=useRef(null)
 const load=useCallback(async()=>{const updated=await allRows(supabase,'traders');setRows(updated);return updated},[])
 useEffect(()=>{void Promise.resolve().then(load).catch(e=>setError(explain(e,language)))},[load,language])
 function start(row){setEdit(row);setForm(row?{...row,first_name:row.first_name||row.full_name}:{branch_id:null});setOpen(true);setError('');request.current=null}
 async function write(row,payload){const key=JSON.stringify({id:row?.id,payload});if(request.current?.key!==key)request.current={key,id:crypto.randomUUID()};return rpc('save_trader_record',{p_id:row?.id||null,p_request:request.current.id,p_data:payload,p_expected:row?.updated_at||null})}
 async function save(e){e.preventDefault();setBusy(true);setError('');try{await write(edit,{...form,archived:false});setOpen(false);await load()}catch(e){setError(explain(e,language))}finally{setBusy(false)}}
 return <div className="registry-page"><div className="booking-page-header"><h1>{t('Traders','تاجران')}</h1><button className="registry-primary" onClick={()=>start(null)}><Plus size={18}/>{t('Trader','تاجر')}</button></div><div className="registry-toolbar"><label className="registry-search"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} aria-label={t('Search traders','جستجوی تاجران')} placeholder={t('Search name or mobile','جستجوی نام یا موبایل')}/></label><button className="registry-secondary" aria-pressed={archived} onClick={()=>setArchived(!archived)}><Archive size={18}/>{t('Archive','بایگانی')}</button></div>{error&&!open&&!deletion&&<p className="registry-notice error" role="alert">{error}</p>}
 <div className="record-list">{rows.filter(r=>!!r.archived_at===archived&&`${r.full_name} ${r.phone}`.toLowerCase().includes(query.toLowerCase())).map(row=><article className="record-row" key={row.id}><Users size={22}/><div className="record-row-main"><strong>{row.full_name}</strong><small>{row.phone} · {row.address}</small></div><IconButton icon={WalletCards} label={t('Account and details','حساب و مشخصات')} onClick={()=>setDetail(row)} disabled={busy}/>{profile?.role==='president'&&!row.archived_at&&<IconButton icon={KeyRound} label={t('Trader login','حساب ورود تاجر')} onClick={()=>setLoginTrader(row)} disabled={busy}/>}<RecordTools language={language} archived={row.archived_at} disabled={busy} onEdit={()=>start(row)} onArchive={()=>{setError('');request.current=null;setDeletion(row)}}/></article>)}</div>
 {open&&<Modal title={edit?t('Edit trader','ویرایش تاجر'):t('Register trader','ثبت تاجر')} busy={busy} onClose={()=>setOpen(false)}><form className="registry-form" onSubmit={save}><fieldset disabled={busy} className="booking-fields wide">{fields.map(([key,en,fa,required])=><label key={key}><span>{t(en,fa)}{required?' *':''}</span><input type={key==='phone'?'tel':'text'} required={required} value={form[key]||''} onChange={e=>setForm({...form,[key]:e.target.value})}/></label>)}</fieldset><p className="wide booking-help">{t('Changes update the trader profile. Previous booking details remain as originally recorded.','تغییرات در مشخصات تاجر ثبت می‌شود. معلومات بوکینگ‌های قبلی به شکل اصلی باقی می‌ماند.')}</p>{error&&<p className="wide registry-notice error" role="alert">{error}</p>}<div className="registry-form-actions"><button type="button" disabled={busy} onClick={()=>setOpen(false)}>{t('Cancel','انصراف')}</button><button className="registry-primary" disabled={busy}>{t('Save','ثبت')}</button></div></form></Modal>}
 {detail&&<Modal title={detail.full_name} onClose={()=>setDetail(null)}><div className="record-modal-body"><dl className="record-details">{fields.map(([key,en,fa])=><div key={key}><dt>{t(en,fa)}</dt><dd>{detail[key]||'—'}</dd></div>)}</dl><TraderAccount trader={detail} language={language} profile={profile}/></div></Modal>}
 {loginTrader&&<Modal title={t('Trader login','حساب ورود تاجر')} onClose={()=>setLoginTrader(null)}><TraderLogin trader={loginTrader} language={language} onChanged={async()=>{const updated=await load();setLoginTrader(updated.find(row=>row.id===loginTrader.id)||null)}}/></Modal>}
 {deletion&&<ConfirmArchive language={language} busy={busy} error={error} restore={!!deletion.archived_at} onClose={()=>setDeletion(null)} onConfirm={async()=>{setBusy(true);try{await write(deletion,{...deletion,first_name:deletion.first_name||deletion.full_name,archived:!deletion.archived_at});setDeletion(null);await load()}catch(e){setError(explain(e,language))}finally{setBusy(false)}}}/>}
 </div>
}
