import { useCallback, useEffect, useRef, useState } from 'react'
import { Archive, Eye, KeyRound, Plus, Search, UserRound } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { allRows } from '../lib/cashbook'
import { rpc, explain } from '../lib/operations'
import { ConfirmArchive, IconButton, Modal, RecordTools } from '../components/RecordTools'
import TraderAccount from '../components/TraderAccount'
import TraderLogin from '../components/TraderLogin'
import CompactTable from '../components/CompactTable'
import Icon from '../components/Icon'
import { RegistrationSection } from '../components/RegistrationFields'
import './TradersPage.css'
const fields=[['first_name','First name','نام',true],['last_name','Surname','تخلص',false],['phone','Mobile','موبایل',true],['address','Address','آدرس',true]]
export default function TradersPage({language,profile,onBack}){
 return profile?.role==='president' && profile.account_enabled !== false
   ? <TraderDirectory language={language} profile={profile} onBack={onBack}/>
   : null
}

function TraderDirectory({language,profile,onBack}){
 const t=(en,fa)=>language==='fa'?fa:en
 const [rows,setRows]=useState([]),[query,setQuery]=useState(''),[archived,setArchived]=useState(false),[form,setForm]=useState({}),[edit,setEdit]=useState(null),[open,setOpen]=useState(false),[detail,setDetail]=useState(null),[loginTrader,setLoginTrader]=useState(null),[deletion,setDeletion]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const request=useRef(null)
 const load=useCallback(async()=>{const updated=await allRows(supabase,'traders');setRows(updated);return updated},[])
 useEffect(()=>{void Promise.resolve().then(load).catch(e=>setError(explain(e,language)))},[load,language])
 function start(row){setEdit(row);setForm(row?{...row,first_name:row.first_name||row.full_name}:{branch_id:null});setOpen(true);setError('');request.current=null}
 async function write(row,payload){const key=JSON.stringify({id:row?.id,payload});if(request.current?.key!==key)request.current={key,id:crypto.randomUUID()};return rpc('save_trader_record',{p_id:row?.id||null,p_request:request.current.id,p_data:payload,p_expected:row?.updated_at||null})}
 async function save(e){e.preventDefault();setBusy(true);setError('');try{await write(edit,{...form,archived:false});setOpen(false);await load()}catch(e){setError(explain(e,language))}finally{setBusy(false)}}
 const visible = rows.filter(r=>!!r.archived_at===archived&&`${r.full_name} ${r.phone}`.toLowerCase().includes(query.toLowerCase()))
 const archiveTrader = (row, archived) => write(row,{...row,first_name:row.first_name||row.full_name,archived})
 return <div className="registry-page traders-directory">
 <header className="traders-title">
   {onBack && <button type="button" className="module-back" onClick={onBack}><Icon name="back" size={16}/>{t('Back','بازگشت')}</button>}
   <h1>{t('Traders','تاجران')}</h1>
 </header>
 <div className="registry-toolbar traders-tools">
   <label className="registry-search"><Search size={16}/><input type="search" value={query} onChange={e=>setQuery(e.target.value)}
     aria-label={t('Search traders','جستجوی تاجران')} placeholder={t('Search name or mobile','جستجوی نام یا موبایل')}/></label>
   <button type="button" className="registry-secondary traders-archive" aria-label={t('Archive','بایگانی')} title={t('Archive','بایگانی')} aria-pressed={archived} onClick={()=>setArchived(!archived)}><Archive size={16}/><span>{t('Archive','بایگانی')}</span></button>
   <button type="button" className="registry-primary" onClick={()=>start(null)}><Plus size={16}/>{t('Add trader','افزودن تاجر')}</button>
 </div>
 {error&&!open&&!deletion&&<p className="registry-notice error" role="alert">{error}</p>}
 <CompactTable key={String(archived)} label={t('Traders','تاجران')} bulk={{
   language, rows:visible, disabled:busy, refresh:load,
   actions:[{label:archived?t('Restore selected','بازیابی انتخاب‌شده‌ها'):t('Archive selected','بایگانی انتخاب‌شده‌ها'),run:row=>archiveTrader(row,!archived)}],
 }} columns={[
   {label:t('Name / mobile','نام / موبایل')}, {label:t('Address','آدرس')}, {label:t('Actions','عملیات'),width:'39%'},
 ]}>{visible.map(row=><tr key={row.id}>
   <th scope="row"><strong>{row.full_name}</strong><small><bdi dir="ltr">{row.phone}</bdi></small></th>
   <td>{row.address || '—'}</td>
   <td><div className="compact-table-actions">
     <IconButton icon={Eye} label={t('Account and details','حساب و مشخصات')} onClick={()=>setDetail(row)} disabled={busy}/>
     {profile?.role==='president'&&!row.archived_at&&<IconButton icon={KeyRound} label={t('Trader login','حساب ورود تاجر')} onClick={()=>setLoginTrader(row)} disabled={busy}/>}
     <RecordTools language={language} archived={row.archived_at} disabled={busy} onEdit={()=>start(row)} onArchive={()=>{setError('');request.current=null;setDeletion(row)}}/>
   </div></td>
 </tr>)}</CompactTable>
 {open&&<Modal title={edit?t('Edit trader','ویرایش تاجر'):t('Register trader','ثبت تاجر')} className="registration-form-card" busy={busy} onClose={()=>setOpen(false)}><form className="registration-form" onSubmit={save}><fieldset disabled={busy} className="registration-fieldset"><RegistrationSection kind="trader" tone="blue" title={t("Trader information","معلومات تاجر")} icon={UserRound}>{fields.map(([key,en,fa,required])=><label key={key}><span>{t(en,fa)}{required?' *':''}</span><input type={key==='phone'?'tel':'text'} required={required} value={form[key]||''} onChange={e=>setForm({...form,[key]:e.target.value})}/></label>)}</RegistrationSection></fieldset><p className="wide booking-help">{t('Changes update the trader profile. Previous booking details remain as originally recorded.','تغییرات در مشخصات تاجر ثبت می‌شود. معلومات بوکینگ‌های قبلی به شکل اصلی باقی می‌ماند.')}</p>{error&&<p className="wide registry-notice error" role="alert">{error}</p>}<div className="registry-form-actions registration-actions"><button type="button" disabled={busy} onClick={()=>setOpen(false)}>{t('Cancel','انصراف')}</button><button className="registry-primary" disabled={busy}>{t('Save','ثبت')}</button></div></form></Modal>}
 {detail&&<Modal title={detail.full_name} onClose={()=>setDetail(null)}><div className="record-modal-body trader-detail"><RegistrationSection kind="trader" tone="blue" title={t("Trader information","معلومات تاجر")} icon={UserRound}><dl className="record-details trader-detail-fields wide">{fields.map(([key,en,fa])=><div key={key}><dt>{t(en,fa)}</dt><dd>{(key==='first_name' ? detail.first_name || detail.full_name : detail[key])||'—'}</dd></div>)}</dl></RegistrationSection><TraderAccount trader={detail} language={language} profile={profile}/></div></Modal>}
 {loginTrader&&<Modal title={t('Trader login','حساب ورود تاجر')} className="branch-password-modal" busy={busy} onClose={()=>setLoginTrader(null)}><TraderLogin key={loginTrader.id} trader={loginTrader} language={language} onBusyChange={setBusy} onChanged={async()=>{const updated=await load();setLoginTrader(updated.find(row=>row.id===loginTrader.id)||null)}}/></Modal>}
 {deletion&&<ConfirmArchive language={language} busy={busy} error={error} restore={!!deletion.archived_at} onClose={()=>setDeletion(null)} onConfirm={async()=>{setBusy(true);try{await archiveTrader(deletion,!deletion.archived_at);setDeletion(null);await load()}catch(e){setError(explain(e,language))}finally{setBusy(false)}}}/>}
 </div>
}
