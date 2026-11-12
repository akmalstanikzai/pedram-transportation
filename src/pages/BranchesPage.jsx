import { useCallback, useEffect, useRef, useState } from 'react'
import { Archive, Building2, KeyRound, Plus, Power, UserRound } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { rpc, explain } from '../lib/operations'
import { ConfirmArchive, IconButton, Modal, RecordTools } from '../components/RecordTools'
import BranchPassword from '../components/BranchPassword'
import { branchAccountError } from '../lib/branchAccountError'
import { loadBranchManagerFiles, uploadBranchManagerFile } from '../lib/branchManagerFiles'
import { initialBranchForm as initialForm, branchFormFromRow, branchFormPayload } from '../lib/branchForm'

const managerSlots=[['identity','Tazkira / National ID','تذکره'],['cv','CV','سی وی'],['education','Educational documents','سند تحصیلی'],['contract','Contract','قرارداد'],['extra','Extra documents','اسناد دیگر']]
const legacyManagerSlots=[['doc1','Previous document 1','سند قبلی ۱'],['doc2','Previous document 2','سند قبلی ۲'],['doc3','Previous document 3','سند قبلی ۳'],['doc4','Previous document 4','سند قبلی ۴']]

const labels = {
  en: {
    add: 'Add Branch', none: 'No branches found.', name: 'Branch name', location: 'Location', manager: 'Manager', username: 'Username',
    code: 'Branch code', province: 'Province', city: 'District', address: 'Location', branchPhone: 'Branch phone',
    branchInfo: 'Branch information',
    managerInfo: 'Branch manager information', credentials: 'Login credentials', managerName: 'Name', managerSurname: 'Surname',
    fatherName: 'Father name', managerPhone: 'Mobile', nationalId: 'National ID', managerAddress: 'Home address', village: 'Village', managerPhoto: 'Manager photo',
    login: 'Email or username', password: 'Password', confirm: 'Confirm password',
    create: 'Create branch and account', cancel: 'Cancel', required: 'Complete all required fields.', mismatch: 'Passwords do not match.',
    shortPassword: 'Password must contain at least 8 characters.', invalidLogin: 'Use a valid email, or a username with English letters, numbers, dots, hyphens or underscores.', success: 'Branch and manager account created.',
    passwordSaved: 'Password saved. The branch manager can sign in with the new password.', passwordSavedDisabled: 'Password saved. Enable the login using the power icon to allow sign-in.',
    loadError: 'The branch database is not ready. Apply and deploy the latest Supabase changes.', total: 'Branches', managers: 'Managers',
  },
  fa: {
    add: 'افزودن شعبه', none: 'شعبه‌ای یافت نشد.', name: 'نام شعبه', location: 'موقعیت', manager: 'مدیر', username: 'نام کاربری',
    code: 'کد شعبه', province: 'ولایت', city: 'ولسوالی', address: 'موقعیت', branchPhone: 'شماره شعبه',
    branchInfo: 'معلومات شعبه',
    managerInfo: 'معلومات مدیر شعبه', credentials: 'معلومات ورود', managerName: 'نام', managerSurname: 'تخلص', fatherName: 'نام پدر',
    managerPhone: 'موبایل', nationalId: 'نمبر تذکره', managerAddress: 'آدرس خانه', village: 'قریه', managerPhoto: 'عکس مدیر',
    login: 'ایمیل یا نام کاربری', password: 'رمز عبور', confirm: 'تکرار رمز عبور', create: 'ایجاد شعبه و حساب',
    cancel: 'انصراف', required: 'خانه‌های ضروری را تکمیل کنید.', mismatch: 'رمزهای عبور یکسان نیست.',
    shortPassword: 'رمز عبور باید حداقل 8 حرف داشته باشد.', invalidLogin: 'ایمیل درست وارد کنید، یا نام کاربری را با حروف انگلیسی، اعداد، نقطه، خط تیره یا زیرخط بنویسید.', success: 'شعبه و حساب مدیر ایجاد شد.',
    passwordSaved: 'رمز عبور ثبت شد. مدیر شعبه می‌تواند با رمز جدید وارد شود.', passwordSavedDisabled: 'رمز عبور ثبت شد. برای ورود، حساب را با آیکن روشن/خاموش فعال کنید.',
    loadError: 'دیتابیس شعبات آماده نیست. تغییرات جدید Supabase را اجرا و نشر کنید.', total: 'شعبات', managers: 'مدیران',
  },
}

export default function BranchesPage({ language, profile }) {
  if (profile?.role !== 'president' || profile.account_enabled !== true) return null
  return <BranchRegistry language={language} />
}

function BranchRegistry({ language }) {
  const text = labels[language] || labels.en
  const [branches, setBranches] = useState([])
  const [form, setForm] = useState(initialForm)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [editing,setEditing]=useState(null)
  const [details,setDetails]=useState(null)
  const [deletion,setDeletion]=useState(null)
  const [archived,setArchived]=useState(false)
  const [passwordBranch,setPasswordBranch]=useState(null)
  const [files,setFiles]=useState({})
  const [selectedFiles,setSelectedFiles]=useState({})
  const request=useRef(null)

  const loadBranches = useCallback(async () => {
    const { data, error } = await supabase.from('branches').select('*, manager:profiles!branches_manager_user_id_fkey(*)').order('name')
    setLoading(false)
    if (error) return setMessage({ type: 'error', text: text.loadError })
    setBranches(data || [])
    try{setFiles(await loadBranchManagerFiles())}catch{setMessage({type:'error',text:language==='fa'?'فایل‌های مدیر بارگیری نشد.':'Manager files could not be loaded.'})}
  }, [text.loadError,language])

  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { void loadBranches() }, [loadBranches])

  function update(name, value) { setForm(current => ({ ...current, [name]: value })) }
  function edit(row){setEditing(row);setSelectedFiles({});setForm(branchFormFromRow(row));setMessage(null);request.current=null;setOpen(true)}
  async function uploadSelected(branchId){for(const [type,file] of Object.entries(selectedFiles))if(file)await uploadBranchManagerFile(branchId,type,file)}
  async function archiveBranch(){setSaving(true);setMessage(null);try{await rpc('save_branch_record',{p_id:deletion.id,p_request:crypto.randomUUID(),p_expected:deletion.updated_at,p_data:{...deletion,archived:!deletion.archived_at,manager_enabled:deletion.manager?.account_enabled??false}});setDeletion(null);await loadBranches()}catch(e){setMessage({type:'error',text:explain(e,language)})}finally{setSaving(false)}}

  async function submit(event) {
    event.preventDefault(); setMessage(null)
    if(editing){
      setSaving(true)
      try{
        const payload={...branchFormPayload(form),manager_user_id:editing.manager_user_id,manager_enabled:editing.manager?.account_enabled??false}
        const key=JSON.stringify(payload);if(request.current?.key!==key)request.current={key,id:crypto.randomUUID()}
        await rpc('save_branch_record',{p_id:editing.id,p_request:request.current.id,p_data:payload,p_expected:editing.updated_at});await uploadSelected(editing.id);setOpen(false);setEditing(null);setSelectedFiles({});await loadBranches()
      }catch(e){setMessage({type:'error',text:explain(e,language)})}finally{setSaving(false)}
      return
    }
    if (!form.name.trim() || !form.province.trim() || !form.city.trim() || !form.managerName.trim() || !form.managerPhone.trim() || !form.login.trim() || !form.password) return setMessage({ type: 'error', text: text.required })
    const login = form.login.trim()
    if (login.includes('@') ? !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(login) : !/^[a-z0-9._-]+$/i.test(login)) return setMessage({ type: 'error', text: text.invalidLogin })
    if (form.password.length < 8) return setMessage({ type: 'error', text: text.shortPassword })
    if (form.password !== form.confirm) return setMessage({ type: 'error', text: text.mismatch })
    setSaving(true)
    const { data: readiness, error: readinessError } = await supabase.functions.invoke('manage-branch-account', { body: { action: 'check_vault' } })
    if (readinessError || !readiness?.ready) {
      const failure = await branchAccountError(readiness, readinessError)
      setSaving(false)
      return setMessage({ type: 'error', text: explain(failure, language) })
    }
    const key=JSON.stringify(form);if(request.current?.key!==key)request.current={key,id:crypto.randomUUID()}
    const { data, error } = await supabase.functions.invoke('create-branch-with-manager', { body: {
      request_id:request.current.id,
      branch: { name: form.name, code: form.code, province: form.province, city: form.city, address: form.address, phone: form.branchPhone },
      manager: { full_name: branchFormPayload(form).manager_name, first_name: form.managerName, surname: form.managerSurname, father_name: form.fatherName, phone: form.managerPhone, national_id: form.nationalId, address: branchFormPayload(form).manager_address, home_province: form.homeProvince, home_district: form.homeDistrict, home_village: form.homeVillage },
      credentials: { login: form.login, password: form.password },
    } })
    if (error || data?.error) {
      setSaving(false)
      const failure = await branchAccountError(data, error)
      return setMessage({ type: 'error', text: explain(failure, language) })
    }
    try{await uploadSelected(data.branch_id)}catch(e){setSaving(false);setOpen(false);setSelectedFiles({});await loadBranches();return setMessage({type:'error',text:`${text.success} ${explain(e,language)}`})}
    const { data: vaultData, error: vaultError } = await supabase.functions.invoke('manage-branch-account', { body: { branch_id: data.branch_id, action: 'password', password: form.password } })
    if (vaultError || vaultData?.error) {
      const failure = await branchAccountError(vaultData, vaultError)
      setSaving(false);setForm(initialForm); setOpen(false); setMessage({ type: 'error', text: `${text.success} ${explain(failure,language)}` }); loadBranches(); return
    }
    setSaving(false);setSelectedFiles({});setForm(initialForm); setOpen(false); setMessage({ type: 'success', text: text.success }); loadBranches()
  }

  return <div className="registry-page branch-registry">
    <div className="registry-actions"><button className="registry-primary" onClick={() => { setMessage(null); setEditing(null);setForm(initialForm);setSelectedFiles({});request.current=null;setOpen(true) }}><Plus size={18} />{text.add}</button><button className="registry-secondary" aria-pressed={archived} onClick={()=>setArchived(!archived)}><Archive size={18}/>{language==='fa'?'بایگانی':'Archive'}</button></div>
    {message && <div className={`registry-notice ${message.type}`}>{message.code?text[message.code]:message.text}</div>}
    <div className="branch-table-wrap"><table className="branch-table"><thead><tr><th>{text.name}</th><th>{text.location}</th><th>{text.manager}</th><th>{text.branchPhone}</th><th>{text.username}</th><th>{text.password}</th><th>{language==='fa'?'حالت':'Account'}</th><th>{language==='fa'?'عملیات':'Actions'}</th></tr></thead><tbody>
      {loading ? <tr><td colSpan="8" className="branch-table-empty"><span className="spinner dark" /></td></tr> : branches.filter(b=>!!b.archived_at===archived).length ? branches.filter(b=>!!b.archived_at===archived).map(branch => <tr key={branch.id}>
        <td><span className="branch-name-cell">{files[`${branch.id}:photo`]?.url?<img className="branch-manager-thumb" src={files[`${branch.id}:photo`].url} alt=""/>:<span className="branch-table-icon"><Building2 size={18} /></span>}<strong>{branch.name}</strong></span></td>
        <td>{branch.city}, {branch.province}</td>
        <td>{branch.manager?.full_name || '—'}</td>
        <td>{branch.phone || branch.manager?.phone || '—'}</td>
        <td>{branch.manager?.username || '—'}</td>
        <td><IconButton icon={KeyRound} label={language==='fa'?`تغییر رمز عبور · ${branch.name}`:`Change password · ${branch.name}`} disabled={saving||!!branch.archived_at||!branch.manager_user_id} onClick={()=>{setMessage(null);setPasswordBranch(branch)}}/></td>
        <td><IconButton icon={Power} label={branch.manager?.account_enabled?(language==='fa'?'غیرفعال کردن حساب':'Disable login'):(language==='fa'?'فعال کردن حساب':'Enable login')} disabled={saving||!!branch.archived_at||!branch.manager_user_id} onClick={async()=>{setSaving(true);try{await rpc('set_account_enabled',{p_kind:'branch',p_id:branch.id,p_enabled:!branch.manager?.account_enabled});await loadBranches()}catch(e){setMessage({type:'error',text:explain(e,language)})}finally{setSaving(false)}}}/><small>{branch.manager?.account_enabled?(language==='fa'?'فعال':'Enabled'):(language==='fa'?'غیرفعال':'Disabled')}</small></td>
        <td><RecordTools language={language} disabled={saving} archived={branch.archived_at} onView={()=>setDetails(branch)} onEdit={()=>edit(branch)} onArchive={()=>{setMessage(null);setDeletion(branch)}}/></td>
      </tr>) : <tr><td colSpan="8" className="branch-table-empty"><Building2 size={28} /><strong>{text.none}</strong></td></tr>}
    </tbody></table></div>

    {open && <div className="registry-modal" role="dialog" aria-modal="true"><div className="registry-form-card branch-form-card">
      <div className="registry-form-head"><span className="module-card-icon blue"><Building2 size={27} /></span><h2>{editing?(language==='fa'?'ویرایش شعبه':'Edit branch'):text.add}</h2></div>
      <form className="branch-form" onSubmit={submit}>
        <BranchDetailsFields language={language} form={form} update={update} editing={editing} files={files} selectedFiles={selectedFiles} setSelectedFiles={setSelectedFiles} />
        {!editing&&<FormSection title={text.credentials} icon={<KeyRound size={18} />}>
          <Field label={text.login} required value={form.login} onChange={value => update('login', value)} wide />
          <Field label={text.password} required type="password" value={form.password} onChange={value => update('password', value)} />
          <Field label={text.confirm} required type="password" value={form.confirm} onChange={value => update('confirm', value)} />
        </FormSection>}
        {message?.type === 'error' && <div className="registry-notice error branch-form-message">{message.text}</div>}
        <div className="registry-form-actions branch-actions"><button type="button" disabled={saving} onClick={() => setOpen(false)}>{text.cancel}</button><button className="registry-primary" disabled={saving}>{saving ? <span className="spinner" /> : editing?(language==='fa'?'ثبت':'Save'):text.create}</button></div>
      </form>
    </div></div>}
    {details&&<Modal title={details.name} onClose={()=>setDetails(null)}><BranchInformation language={language} details={details} files={files}/></Modal>}
    {deletion&&<ConfirmArchive language={language} busy={saving} error={message?.text} restore={!!deletion.archived_at} onClose={()=>setDeletion(null)} onConfirm={archiveBranch}/>}
    {passwordBranch&&<BranchPassword key={passwordBranch.id} branch={passwordBranch} language={language} onClose={()=>setPasswordBranch(null)} onSaved={()=>{setPasswordBranch(null);setMessage({type:'success',code:passwordBranch.manager?.account_enabled?'passwordSaved':'passwordSavedDisabled'})}}/>}
  </div>
}

function FormSection({ title, icon, children }) { return <section className="branch-form-section"><h3>{icon}{title}</h3><div className="branch-form-fields">{children}</div></section> }
function Field({ label, required, type = 'text', value, onChange, wide }) { return <label className={wide ? 'wide' : ''}><span>{label}{required ? ' *' : ''}</span><input required={required} type={type} value={value} onChange={event => onChange(event.target.value)} /></label> }


export function BranchDetailsFields({ language, form, update, editing = null, files = {}, selectedFiles = {}, setSelectedFiles }) {
  const text = labels[language] || labels.en
  return <>
        <FormSection title={text.branchInfo} icon={<Building2 size={18} />}>
          <Field label={text.name} required value={form.name} onChange={value => update('name', value)} />
          <Field label={text.code} value={form.code} onChange={value => update('code', value)} />
          <Field label={text.province} required value={form.province} onChange={value => update('province', value)} />
          <Field label={text.city} required value={form.city} onChange={value => update('city', value)} />
          <Field label={text.address} value={form.address} onChange={value => update('address', value)} wide />
        </FormSection>
        <FormSection title={text.managerInfo} icon={<UserRound size={18} />}>
          <Field label={text.managerName} required value={form.managerName} onChange={value => update('managerName', value)} />
          <Field label={text.managerSurname} value={form.managerSurname} onChange={value => update('managerSurname', value)} />
          <Field label={text.fatherName} value={form.fatherName} onChange={value => update('fatherName', value)} />
          <Field label={text.managerPhone} required type="tel" value={form.managerPhone} onChange={value => update('managerPhone', value)} />
          <fieldset className="branch-home-address wide"><legend>{text.managerAddress}</legend>
            <Field label={text.province} value={form.homeProvince} onChange={value => update('homeProvince', value)} />
            <Field label={text.city} value={form.homeDistrict} onChange={value => update('homeDistrict', value)} />
            <Field label={text.village} value={form.homeVillage} onChange={value => update('homeVillage', value)} />
          </fieldset>
          <label><span>{text.managerPhoto}</span><input type="file" accept=".jpg,.jpeg,.png,.webp" onChange={event=>setSelectedFiles(current=>({...current,photo:event.target.files?.[0]||null}))}/>{(selectedFiles.photo||editing&&files[`${editing.id}:photo`])&&<small>{selectedFiles.photo?.name||files[`${editing.id}:photo`]?.file_name}</small>}</label>
          {managerSlots.map(([key,en,fa])=><label key={key}><span>{language==='fa'?fa:en}</span><input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={event=>setSelectedFiles(current=>({...current,[key]:event.target.files?.[0]||null}))}/>{editing&&files[`${editing.id}:${key}`]&&<small>{files[`${editing.id}:${key}`].file_name}</small>}</label>)}
          {editing&&legacyManagerSlots.filter(([key])=>files[`${editing.id}:${key}`]).map(([key,en,fa])=><div className="branch-legacy-file" key={key}><strong>{language==='fa'?fa:en}</strong><a href={files[`${editing.id}:${key}`].url} target="_blank" rel="noreferrer">{files[`${editing.id}:${key}`].file_name}</a></div>)}
          <p className="wide booking-help">{language==='fa'?'فایل‌ها اختیاری اند. عکس و اسناد تا ۵ MB؛ سند جدید جای سند قبلی را در نمای شعبه می‌گیرد.':'Files are optional. Each photo or document can be up to 5 MB. A new upload replaces the file shown in the branch profile.'}</p>
        </FormSection>
  </>
}

export function BranchInformation({ language, details, files = {} }) {
  const text = labels[language] || labels.en
  const manager = details.manager || {}
  const item = (key,label,value,wide=false) => <div key={key} className={wide?'wide':''}><dt>{label}</dt><dd>{value||'—'}</dd></div>
  return <div className="record-modal-body branch-details-view">
    {files[`${details.id}:photo`]?.url&&<img className="branch-manager-photo" src={files[`${details.id}:photo`].url} alt={text.managerPhoto}/>}
    <section aria-label={text.branchInfo}>
      <h3>{text.branchInfo}</h3>
      <dl className="record-details branch-information-grid">
        <div className="wide branch-details-code"><dt>{text.code}</dt><dd>{details.code||'—'}</dd></div>
        {item('province',text.province,details.province)}
        {item('district',text.city,details.city)}
        {item('location',text.address,details.address,true)}
      </dl>
    </section>
    <section aria-label={text.managerInfo}>
      <h3>{text.managerInfo}</h3>
      <dl className="record-details branch-information-grid">
        {item('name',text.managerName,manager.first_name??manager.full_name)}
        {item('surname',text.managerSurname,manager.surname)}
        {item('father',text.fatherName,manager.father_name)}
        {item('mobile',text.managerPhone,manager.phone)}
        {item('home',text.managerAddress,manager.address,true)}
      </dl>
    </section>
    <h3>{language==='fa'?'اسناد مدیر':'Manager documents'}</h3>
    <div className="branch-manager-documents">
      {[...managerSlots,...legacyManagerSlots.filter(([key])=>files[`${details.id}:${key}`])].map(([key,en,fa])=>{
        const file=files[`${details.id}:${key}`]
        return <div key={key}><strong>{language==='fa'?fa:en}</strong>{file?.url?<a href={file.url} target="_blank" rel="noreferrer">{file.file_name}</a>:<span>—</span>}</div>
      })}
    </div>
  </div>
}
