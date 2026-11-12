import { useCallback, useEffect, useRef, useState } from 'react'
import { Archive, Plus, RefreshCw, Search, Truck, UserRound, Users, WalletCards } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { allRows } from '../lib/cashbook'
import { rpc, explain } from '../lib/operations'
import { ConfirmArchive, IconButton, Modal, RecordTools } from '../components/RecordTools'
import DocumentsPanel from '../components/DocumentsPanel'
import DriverAccount from '../components/DriverAccount'
import DriverTransactions from '../components/DriverTransactions'
import SolarHijriDateInput from '../components/SolarHijriDateInput'
import { formatSolarHijri } from '../lib/solarHijri'
import { loadFleetPhotos, uploadFleetPhoto, uploadDriverDocument, uploadVehicleDocument, uploadOwnerIdentity } from '../lib/fleetPhotos'
import { vehicleWeightsFromRow, vehicleWeightsPayload } from '../lib/capacity'
import VehicleUploads from '../components/VehicleUploads'
import VehicleOwnerForm from '../components/VehicleOwnerForm'
import DriverRegistrationFields from '../components/DriverRegistrationFields'
import { driverFormFromRow, driverFormPayload } from '../lib/driverForm'
import OwnerRegistrationFields from '../components/OwnerRegistrationFields'
import { ownerFormFromRow, ownerFormPayload } from '../lib/ownerForm'

const tables={vehicle:'vehicles',owner:'vehicle_owners',driver:'drivers'}
const vehicleTypes=[['لنډی','Landi'],['تیلر','Trailer']]
const vehicleConditions=[['یخچالی','Refrigerated'],['تخته فرش','Flatbed'],['ترپال کش','Tarpaulin'],['کانتینری','Container'],['تانکر','Tanker']]
const fields={
 owner:[['full_name','Name','نام','text',true],['father_name','Father name','نام پدر'],['phone','Mobile','موبایل','tel',true],['national_id','Tazkira number','نمبر تذکره'],['province','Province','ولایت'],['address','Address','آدرس'],['notes','Notes','ملاحظات']],
 driver:[['full_name','Name','نام','text',true],['father_name','Father name','نام پدر'],['phone','Mobile','موبایل','tel',true],['national_id','Tazkira number','نمبر تذکره'],['address','Address','آدرس'],['license_number','Licence number','نمبر لایسنس'],['previous_company','Previous company','شرکت قبلی']],
 vehicle:[['plate_number','Plate number','نمبر پلیت','text',true],['province','Province','ولایت'],['foreign_plate_number','Foreign plate (optional)','پلیت خارجی (اختیاری)'],['vehicle_type','Vehicle type','نوعیت','vehicle_type',true],['vehicle_condition','Body style','حالت','vehicle_condition'],['model','Model','ماډل'],['color','Color','رنگ'],['capacity_tons','Weight capacity','ظرفیت','capacity'],['notes','Notes','ملاحظات']]
}
const legacyVehicleFields=[['vin_number','VIN / chassis','نمبر شاسی'],['model_year','Model year','سال ساخت'],['permit_number','Permit number','نمبر جواز']]
export default function VehiclesPage({language,profile}){
 const branchManager=profile?.role==='branch_manager'
 const president=profile?.role==='president'
 const canManage=row=>president||(branchManager&&!!profile.branch_id&&row.branch_id===profile.branch_id)
 const t=(en,fa)=>language==='fa'?fa:en
 const [data,setData]=useState({vehicle:[],owner:[],driver:[]}),[photos,setPhotos]=useState({}),[photoFile,setPhotoFile]=useState(null),[ownerFiles,setOwnerFiles]=useState({}),[driverFiles,setDriverFiles]=useState({}),[vehicleFiles,setVehicleFiles]=useState({}),[typeCustom,setTypeCustom]=useState(false),[conditionCustom,setConditionCustom]=useState(false),[capacity,setCapacity]=useState(()=>vehicleWeightsFromRow(null)),[queries,setQueries]=useState({vehicle:'',driver:'',owner:''}),[archives,setArchives]=useState({vehicle:false,driver:false,owner:false}),[editor,setEditor]=useState(null),[detail,setDetail]=useState(null),[account,setAccount]=useState(null),[deletion,setDeletion]=useState(null),[destinationCompany,setDestinationCompany]=useState(''),[form,setForm]=useState({}),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState('')
 const [inlineOwner,setInlineOwner]=useState(false)
 const [driverTransactions,setDriverTransactions]=useState(null)
 const [active,setActive]=useState('vehicle')
 const [loadFailure,setLoadFailure]=useState(null)
 const [scopeEditor,setScopeEditor]=useState(null)
 const [branches,setBranches]=useState([])
 const kinds=['vehicle','driver','owner']
 const icons={vehicle:Truck,driver:UserRound,owner:Users}
 const ActiveIcon=icons[active]
 const query=queries[active],archived=archives[active]
 const request=useRef(null)
 const load=useCallback(async()=>{
  const [vehicle,owner,driver]=await Promise.all(Object.values(tables).map(table=>allRows(supabase,table)))
  const records={vehicle,owner,driver}
  setData(records)
  void loadFleetPhotos().then(setPhotos).catch(()=>setPhotos({}))
  return records
 },[])
 const refresh=useCallback(async()=>{
  setLoading(true)
  setLoadFailure(null)
  try { await load() } catch (error) { setLoadFailure(error) }
  finally { setLoading(false) }
 },[load])
 useEffect(()=>{void Promise.resolve().then(refresh)},[refresh])
 async function openScope(kind,row){
  setBusy(true)
  setError('')
  setScopeEditor({kind,row,branch:row.branch_id||''})
  setBranches([])
  try { setBranches(await allRows(supabase,'branches','id,name,archived_at')) }
  catch (error) { setError(explain(error,language)) }
  finally { setBusy(false) }
 }
 async function saveScope(event){
  event.preventDefault()
  if(busy||!scopeEditor||!president)return
  const {kind,row,branch}=scopeEditor
  setBusy(true)
  setError('')
  try {
   await rpc('set_fleet_branch_scope',{p_kind:kind,p_id:row.id,p_branch:branch||null,p_expected:row.updated_at})
   setScopeEditor(null)
   await refresh()
  } catch (error) { setError(explain(error,language)) }
  finally { setBusy(false) }
 }
 const title=kind=>kind==='vehicle'?t('Vehicles','وسایط'):kind==='driver'?t('Drivers','رانندگان'):t('Owners','مالکان')
 const statusLabel=id=>({available:t('Available','آماده'),assigned:t('Assigned','تعیین‌شده'),on_trip:t('On trip','در سفر'),under_repair:t('Under repair','در ترمیم'),inactive:t('Inactive','غیرفعال')})[id]||id
 function edit(kind,row=null){setInlineOwner(false);setEditor({kind,row});setPhotoFile(null);setDriverFiles({});setOwnerFiles({});setVehicleFiles({});setTypeCustom(!!row?.vehicle_type&&!vehicleTypes.some(([id])=>id===row.vehicle_type));setConditionCustom(!!row?.vehicle_condition&&!vehicleConditions.some(([id])=>id===row.vehicle_condition));setCapacity(vehicleWeightsFromRow(row));setError('');request.current=null;setForm(kind==='driver'?driverFormFromRow(row,branchManager?profile.branch_id:null):kind==='owner'?ownerFormFromRow(row,branchManager?profile.branch_id:null):row?{...row}:{status:'available',branch_id:branchManager?profile.branch_id:null})}
 async function write(kind,row,payload){const key=JSON.stringify({kind,id:row?.id,payload});if(request.current?.key!==key)request.current={key,id:crypto.randomUUID()};return kind==='vehicle'?rpc('save_vehicle_record',{p_id:row?.id||null,p_request:request.current.id,p_data:payload,p_expected:row?.updated_at||null}):kind==='owner'?rpc('save_owner_record',{p_id:row?.id||null,p_request:request.current.id,p_data:payload,p_expected:row?.updated_at||null}):kind==='driver'?rpc('save_driver_employment',{p_id:row?.id||null,p_request:request.current.id,p_data:payload,p_expected:row?.updated_at||null}):rpc('save_fleet_record',{p_kind:kind,p_id:row?.id||null,p_request:request.current.id,p_data:payload,p_expected:row?.updated_at||null})}
 async function save(e){e.preventDefault();if(busy)return;setBusy(true);setError('');try{const payload={...(editor.kind==='driver'?driverFormPayload(form):editor.kind==='owner'?ownerFormPayload(form):form),archived:!!form.archived_at};if(editor.kind==='vehicle')Object.assign(payload,vehicleWeightsPayload(capacity));const id=await write(editor.kind,editor.row,payload);const kind=editor.kind;if(photoFile)await uploadFleetPhoto(kind,id,photoFile);if(kind==='driver')for(const [category,file] of Object.entries(driverFiles))if(file){if(category==='profile_photo')await uploadFleetPhoto('driver',id,file);else await uploadDriverDocument(id,category,file);}if(kind==='owner')for(const [category,file] of Object.entries(ownerFiles))if(file){if(category==='profile_photo')await uploadFleetPhoto('owner',id,file);else await uploadOwnerIdentity(id,file);}if(kind==='vehicle')for(const [category,file] of Object.entries(vehicleFiles))if(file)await uploadVehicleDocument(id,category,file);setEditor(null);setPhotoFile(null);setDriverFiles({});setOwnerFiles({});setVehicleFiles({});const updated=await load();setDetail({kind,row:updated[kind].find(r=>r.id===id)})}catch(e){setError(explain(e,language))}finally{setBusy(false)}}
 async function archive(){setBusy(true);setError('');try{await write(deletion.kind,deletion.row,{...deletion.row,archived:!deletion.row.archived_at,...(deletion.kind==='driver'&&!deletion.row.archived_at?{destination_company:destinationCompany.trim()}:{})});setDeletion(null);setDestinationCompany('');await load()}catch(e){setError(explain(e,language))}finally{setBusy(false)}}
 const rowName=r=>r.plate_number||r.full_name
 const detailRow=detail&&data[detail.kind].find(r=>r.id===detail.row?.id)
 const rows=data[active].filter(r=>!!r.archived_at===archived&&`${rowName(r)} ${r.phone||''} ${r.phone_secondary||''} ${r.vehicle_type||''} ${r.vin_number||''} ${r.license_number||''} ${r.previous_company||''} ${r.destination_company||''}`.toLowerCase().includes(query.trim().toLowerCase())).sort((a,b)=>rowName(a).localeCompare(rowName(b),'en',{numeric:true}))
 function tabKey(e){const index=kinds.indexOf(active),forward=language==='fa'?'ArrowLeft':'ArrowRight',back=language==='fa'?'ArrowRight':'ArrowLeft';let next;if(e.key===forward)next=kinds[(index+1)%kinds.length];else if(e.key===back)next=kinds[(index+kinds.length-1)%kinds.length];else if(e.key==='Home')next=kinds[0];else if(e.key==='End')next=kinds.at(-1);if(next){e.preventDefault();setActive(next);document.getElementById(`fleet-tab-${next}`)?.focus()}}
 return <div className="registry-page fleet-registry">
 <div className="registry-toolbar">
  <p className="booking-help">{president?t('Use the branch icon to assign a record to one branch or share it with all branches.','با آیکن شعبه، ریکارد را به یک شعبه اختصاص دهید یا با همه شعبه‌ها شریک کنید.'):t('Fleet shows your branch records and records shared from head office.','وسایط، ریکاردهای شعبه شما و ریکاردهای مشترک دفتر مرکزی را نشان می‌دهد.')}</p>
  <IconButton icon={RefreshCw} label={t('Refresh fleet','تازه‌سازی وسایط')} disabled={loading||busy} onClick={refresh}/>
 </div>
 {branchManager&&!profile.branch_id&&<p role="alert" className="registry-notice error">{t('Your login has no assigned branch. Ask the President to check the branch manager account.','حساب شما به شعبه وصل نیست. از رئیس بخواهید حساب مدیر شعبه را بررسی کند.')}</p>}
 {loadFailure&&<p role="alert" className="registry-notice error">{t('Fleet records could not load. Use Refresh fleet to try again.','ریکاردهای وسایط بارگیری نشد. برای کوشش دوباره، وسایط را تازه‌سازی کنید.')}</p>}
 <div className="fleet-tabs" role="tablist" aria-label={t('Fleet sections','بخش‌های وسایط')} onKeyDown={tabKey}>{kinds.map(kind=>{const Icon=icons[kind];return <button type="button" role="tab" id={`fleet-tab-${kind}`} aria-selected={active===kind} aria-controls={`fleet-panel-${kind}`} tabIndex={active===kind?0:-1} className={active===kind?'active':''} key={kind} onClick={()=>setActive(kind)}><Icon size={25}/><strong>{title(kind)}</strong><span>{loading||loadFailure?'—':data[kind].filter(r=>!r.archived_at).length}</span></button>})}</div>
 <section className="fleet-panel" id={`fleet-panel-${active}`} role="tabpanel" aria-labelledby={`fleet-tab-${active}`} tabIndex={0}>
 <div className="fleet-panel-heading"><h2><ActiveIcon size={22}/>{title(active)}</h2><button className="registry-primary" disabled={loading||!!loadFailure||busy||(branchManager&&!profile.branch_id)} onClick={()=>edit(active)}><Plus size={18}/>{active==='vehicle'?t('Add vehicle','افزودن واسطه'):active==='driver'?t('Add driver','افزودن راننده'):t('Add owner','افزودن مالک')}</button></div>
 <div className="registry-toolbar"><label className="registry-search"><Search size={18}/><input aria-label={active==='vehicle'?t('Search vehicles','جستجوی وسایط'):active==='driver'?t('Search drivers','جستجوی رانندگان'):t('Search owners','جستجوی مالکان')} placeholder={active==='vehicle'?t('Search plate, type or VIN','جستجوی پلیت، نوع یا شاسی'):t('Search name or mobile','جستجوی نام یا موبایل')} value={query} onChange={e=>setQueries({...queries,[active]:e.target.value})}/></label><button className="registry-secondary" onClick={()=>setArchives({...archives,[active]:!archived})} aria-pressed={archived}><Archive size={18}/>{archived?t('Archived','بایگانی‌شده'):t('Archive','بایگانی')}</button></div>
 {error&&!editor&&!deletion&&!scopeEditor&&<p className="registry-notice error" role="alert">{error}</p>}{loading&&<p role="status">{t('Loading…','در حال بارگیری…')}</p>}
 <div className="record-list">{rows.map(row=><article className="record-row" key={row.id}>{photos[row.id]?<img className="fleet-profile-thumb" src={photos[row.id]} alt=""/>:<span className="fleet-profile-thumb placeholder"><ActiveIcon size={23}/></span>}<div className="record-row-main"><strong>{rowName(row)}</strong><small>{active==='vehicle'?`${row.vehicle_type} · ${data.owner.find(o=>o.id===row.owner_id)?.full_name||'—'}`:row.phone}{active==='driver'&&row.archived_at&&row.destination_company?` · ${t('Moved to','رفت به')} ${row.destination_company}`:''}</small></div>{row.status&&<span className={`status-pill ${row.status}`}>{statusLabel(row.status)}</span>}{active==='driver'&&president&&<IconButton icon={WalletCards} label={t('Transactions','معاملات')} disabled={busy} onClick={()=>setDriverTransactions(row)}/>}<RecordTools language={language} archived={row.archived_at} disabled={busy} onView={()=>setDetail({kind:active,row})} onScope={president?()=>openScope(active,row):undefined} onEdit={canManage(row)?()=>edit(active,row):undefined} onDocuments={canManage(row)?()=>setDetail({kind:active,row,documents:true}):undefined} onAccount={active==='driver'&&profile?.role==='president'?()=>setAccount(row):undefined} onArchive={canManage(row)?()=>{setError('');setDestinationCompany('');request.current=null;setDeletion({kind:active,row})}:undefined}/></article>)}</div>
 {!rows.length&&!loading&&!loadFailure&&<div className="registry-empty"><ActiveIcon size={34}/><strong>{query?t('No matching records.','معلومات مطابق یافت نشد.'):archived?t('No archived records in this section.','در این بخش معلومات بایگانی‌شده موجود نیست.'):branchManager?t('No branch or shared records in this section. Add a branch record or ask the President to share one.','در این بخش ریکارد شعبه یا مشترک وجود ندارد. ریکارد شعبه اضافه کنید یا از رئیس بخواهید ریکاردی را شریک کند.'):t('No records in this section yet.','هنوز در این بخش معلومات ثبت نشده است.')}</strong></div>}
 </section>
 {scopeEditor&&president&&<Modal title={`${t('Branch access','دسترسی شعبه')} · ${rowName(scopeEditor.row)}`} busy={busy} onClose={()=>setScopeEditor(null)}>
  <form className="registry-form" onSubmit={saveScope}>
   <label className="wide"><span>{t('Available to','در دسترس برای')}</span>
    <select disabled={busy} value={scopeEditor.branch} onChange={event=>setScopeEditor(current=>({...current,branch:event.target.value}))}>
     <option value="">{t('Shared with all branches','مشترک با همه شعبه‌ها')}</option>
     {branches.filter(branch=>!branch.archived_at||branch.id===scopeEditor.row.branch_id).map(branch=><option key={branch.id} value={branch.id} disabled={!!branch.archived_at}>{branch.name}</option>)}
    </select>
   </label>
   <p className="wide booking-help">{t('Select one branch to keep the record within that branch. Choose shared to make it available for bookings from any branch.','برای محدود کردن ریکارد، یک شعبه را انتخاب کنید. برای استفاده در بوکینگ همه شعبه‌ها، گزینه مشترک را انتخاب کنید.')}</p>
   {scopeEditor.kind==='vehicle'&&<p className="wide booking-help">{t('If selected, the owner must be shared or assigned to the same branch.','در صورت انتخاب، مالک باید مشترک باشد یا به همان شعبه اختصاص داشته باشد.')}</p>}
   {error&&<p role="alert" className="wide registry-notice error">{error}</p>}
   <div className="registry-form-actions">
    <button type="button" disabled={busy} onClick={()=>setScopeEditor(null)}>{t('Cancel','انصراف')}</button>
    <button className="registry-primary" disabled={busy||scopeEditor.branch===(scopeEditor.row.branch_id||'')}>{t('Save branch access','ثبت دسترسی شعبه')}</button>
   </div>
  </form>
 </Modal>}
 {editor&&<Modal key={inlineOwner?'inline-owner':'fleet-editor'} title={inlineOwner?t('Create new owner','ایجاد مالک جدید'):editor.row?t('Edit','ویرایش'):t('Register','ثبت')} onClose={()=>inlineOwner?setInlineOwner(false):setEditor(null)} busy={busy}>{inlineOwner?<VehicleOwnerForm language={language} branchId={form.branch_id||null} onBusyChange={setBusy} onCreated={owner=>{setData(current=>({...current,owner:[...current.owner.filter(row=>row.id!==owner.id),owner]}));setForm(current=>({...current,owner_id:owner.id}))}} onCancel={()=>setInlineOwner(false)} onDone={()=>setInlineOwner(false)}/>:<form className={`registry-form ${editor.kind==='vehicle'?'vehicle-registration-form':editor.kind==='driver'?'driver-registration-form':editor.kind==='owner'?'owner-registration-form':''}`} onSubmit={save}><fieldset className="booking-fields wide" disabled={busy}>
 {editor.kind==='vehicle'?<VehicleRegistrationFields language={language} form={form} onChange={setForm} owners={data.owner} onCreateOwner={()=>setInlineOwner(true)} capacity={capacity} onCapacityChange={setCapacity} typeCustom={typeCustom} onTypeCustom={setTypeCustom} conditionCustom={conditionCustom} onConditionCustom={setConditionCustom}/>:editor.kind==='driver'?<DriverRegistrationFields language={language} form={form} onChange={setForm} files={driverFiles} onFilesChange={setDriverFiles}/>:editor.kind==='owner'?<OwnerRegistrationFields language={language} form={form} onChange={setForm} files={ownerFiles} onFilesChange={setOwnerFiles}/>:fields[editor.kind].map(([key,en,fa,type='text',required=false])=>type==='capacity'?<CapacityField key={key} language={language} value={capacity} onChange={setCapacity}/>:type==='vehicle_type'||type==='vehicle_condition'?<VehicleChoiceField key={key} label={t(en,fa)} required={required} language={language} options={type==='vehicle_type'?vehicleTypes:vehicleConditions} value={form[key]||''} custom={type==='vehicle_type'?typeCustom:conditionCustom} onCustom={type==='vehicle_type'?setTypeCustom:setConditionCustom} onChange={value=>setForm(current=>({...current,[key]:value}))}/>:<label key={key}><span>{t(en,fa)}{required?' *':''}</span>{type==='date'?<SolarHijriDateInput required={required} language={language} value={form[key]??''} onChange={value=>setForm({...form,[key]:value})} ariaLabel={t(en,fa)}/>:<input required={required} type={type} inputMode={key==='model_year'?'numeric':undefined} pattern={key==='model_year'?'[0-9]+':undefined} step={type==='number'?'0.001':undefined} min={type==='number'?'0.001':undefined} value={form[key]??''} onChange={e=>setForm({...form,[key]:e.target.value})}/>}</label>)}
 {editor.kind==='vehicle'&&<VehicleUploads language={language} photo={photoFile} onPhotoChange={setPhotoFile} files={vehicleFiles} onFilesChange={setVehicleFiles}/>}</fieldset>{error&&<p role="alert" className="wide registry-notice error">{error}</p>}<div className="registry-form-actions"><button type="button" disabled={busy} onClick={()=>setEditor(null)}>{t('Cancel','انصراف')}</button><button className="registry-primary" disabled={busy}>{t('Save','ثبت')}</button></div></form>}</Modal>}
 {detailRow&&<Modal title={rowName(detailRow)} onClose={()=>setDetail(null)}><div className="record-modal-body">{!detail.documents&&<div className="fleet-detail-layout"><div className="fleet-profile-frame">{photos[detailRow.id]?<img src={photos[detailRow.id]} alt={t('Profile photo','عکس پروفایل')}/>:<span><ActiveIcon size={42}/></span>}</div><dl className="record-details">{[...fields[detail.kind],...(detail.kind==='driver'?[['surname','Surname','تخلص'],['phone_secondary','Second mobile','موبایل دوم'],['province','Province','ولایت'],['district','District','ولسوالی'],['village','Village','قریه']]:[]),...(detail.kind==='owner'?[['surname','Surname','تخلص'],['district','District','ولسوالی'],['village','Village','قریه']]:[]),...(detail.kind==='vehicle'?[...legacyVehicleFields.filter(([key])=>detailRow[key]),['gross_weight_kg','Gross permitted weight (kg)','وزن مجموعی مجاز (کیلوگرام)'],['empty_weight_kg','Empty vehicle weight (kg)','وزن خالی موتر (کیلوگرام)']]:[])].map(([key,en,fa,type])=><div key={key}><dt>{t(en,fa)}</dt><dd>{type==='date'?formatSolarHijri(detailRow[key]):detailRow[key]??'—'}</dd></div>)}{detail.kind==='driver'&&detailRow.destination_company&&<div><dt>{t('Company after leaving','شرکت بعد از ترک کار')}</dt><dd>{detailRow.destination_company}</dd></div>}{detail.kind==='driver'&&detailRow.left_company_at&&<div><dt>{t('Left on','تاریخ ترک کار')}</dt><dd>{formatSolarHijri(detailRow.left_company_at)}</dd></div>}{detailRow.status&&<div><dt>{t('Status','وضعیت')}</dt><dd>{statusLabel(detailRow.status)}</dd></div>}{detail.kind==='vehicle'&&<div><dt>{t('Owner','مالک')}</dt><dd>{data.owner.find(o=>o.id===detailRow.owner_id)?.full_name||'—'}</dd></div>}</dl></div>}{detail.documents&&<DocumentsPanel kind={detail.kind} parentId={detailRow.id} language={language} archived={!!detailRow.archived_at} onChanged={async()=>{await load()}}/>}</div></Modal>}
 {driverTransactions&&<DriverTransactions driver={driverTransactions} language={language} onClose={()=>setDriverTransactions(null)}/>}
 {account&&<Modal title={t('Driver login','حساب ورود راننده')} onClose={()=>setAccount(null)} busy={busy} className={account.user_id?'branch-password-modal':''}><DriverAccount driver={account} language={language} onBusyChange={setBusy} onChanged={async()=>{const updated=await load();setAccount(updated.driver.find(d=>d.id===account.id))}}/></Modal>}
 {deletion&&(deletion.kind==='driver'&&!deletion.row.archived_at?<Modal title={t('Archive driver','بایگانی راننده')} onClose={()=>setDeletion(null)} busy={busy}><form className="registry-form" onSubmit={e=>{e.preventDefault();void archive()}}><p>{t('The driver’s profile and booking history will stay in the archive.','مشخصات و تاریخچه بوکینگ راننده در بایگانی باقی می‌ماند.')}</p><label><span>{t('Company the driver is joining','شرکتی که راننده به آن می‌رود')} *</span><input required autoFocus value={destinationCompany} onChange={e=>setDestinationCompany(e.target.value)}/></label>{error&&<p role="alert" className="registry-notice error">{error}</p>}<div className="registry-form-actions"><button type="button" disabled={busy} onClick={()=>setDeletion(null)}>{t('Cancel','انصراف')}</button><button className="registry-primary" disabled={busy}>{t('Archive driver','بایگانی راننده')}</button></div></form></Modal>:<ConfirmArchive language={language} busy={busy} error={error} restore={!!deletion.row.archived_at} onClose={()=>setDeletion(null)} onConfirm={archive}/>)}
 </div>
}

export function CapacityField({language,value,onChange}) {
 const t=(en,fa)=>language==='fa'?fa:en
 return <fieldset className="capacity-entry wide"><legend>{t('Capacity','ظرفیت')}</legend><div className="vehicle-weight-fields">
  <input aria-label={t('Gross permitted weight (kg)','وزن مجموعی مجاز (کیلوگرام)')} type="number" min="0.001" step="0.001" inputMode="decimal" value={value.gross??''} onChange={e=>onChange({...value,gross:e.target.value})}/>
  <input aria-label={t('Empty vehicle weight (kg)','وزن خالی موتر (کیلوگرام)')} type="number" min="0" step="0.001" inputMode="decimal" value={value.empty??''} onChange={e=>onChange({...value,empty:e.target.value})}/>
 </div></fieldset>
}

function VehicleChoiceField({label,required,language,options,value,custom,onCustom,onChange,wide=false}) {
 const t=(en,fa)=>language==='fa'?fa:en
 return <label className={`vehicle-choice-field ${wide?'wide':''}`}><span>{label}{required?' *':''}</span><select required={required&&!custom} value={custom?'other':value} onChange={e=>{const other=e.target.value==='other';onCustom(other);onChange(other?'':e.target.value)}}><option value="">—</option>{options.map(([id,en])=><option key={id} value={id}>{t(en,id)}</option>)}<option value="other">{t('Other / write name','دیگر / نوشتن نام')}</option></select>{custom&&<input required={required} value={value} onChange={e=>onChange(e.target.value)} aria-label={t(`Other ${label}`,`نام دیگر ${label}`)} placeholder={t('Write a name','نام را بنویسید')}/>}</label>
}

export function VehicleRegistrationFields({language,form,onChange,owners=[],onCreateOwner,capacity,onCapacityChange,typeCustom=false,onTypeCustom,conditionCustom=false,onConditionCustom}) {
 const t=(en,fa)=>language==='fa'?fa:en
 return <>
  <label className="wide"><span>{t('Owner (optional)','مالک (اختیاری)')}</span><select value={form.owner_id||''} onChange={e=>e.target.value==='__new_owner__'?onCreateOwner?.():onChange({...form,owner_id:e.target.value||null})}><option value="">{t('Optional','اختیاری')}</option><option value="__new_owner__">{t('Create new owner…','ایجاد مالک جدید…')}</option>{owners.filter(o=>(!o.archived_at||o.id===form.owner_id)&&(!o.branch_id||o.branch_id===(form.branch_id||null))).map(o=><option key={o.id} value={o.id}>{o.full_name} · {o.phone}</option>)}</select></label>
  {fields.vehicle.map(([key,en,fa,type='text',required=false])=>type==='capacity'?<CapacityField key={key} language={language} value={capacity} onChange={onCapacityChange}/>:type==='vehicle_type'||type==='vehicle_condition'?<VehicleChoiceField key={key} label={t(en,fa)} required={required} language={language} options={type==='vehicle_type'?vehicleTypes:vehicleConditions} value={form[key]||''} custom={type==='vehicle_type'?typeCustom:conditionCustom} onCustom={type==='vehicle_type'?onTypeCustom:onConditionCustom} onChange={value=>onChange({...form,[key]:value})}/>:<label key={key} className={['plate_number','province','model','color'].includes(key)?'':'wide'}><span>{t(en,fa)}{required?' *':''}</span><input required={required} type={type} value={form[key]??''} onChange={e=>onChange({...form,[key]:e.target.value})}/></label>)}
 </>
}
