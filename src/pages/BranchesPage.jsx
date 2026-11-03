import { useCallback, useEffect, useRef, useState } from 'react'
import { Archive, Building2, KeyRound, Plus, Power, UserRound } from 'lucide-react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { rpc, explain } from '../lib/operations'
import { ConfirmArchive, IconButton, Modal, RecordTools } from '../components/RecordTools'
import BranchPassword from '../components/BranchPassword'

const labels = {
  en: {
    add: 'Add Branch', none: 'No branches found.', name: 'Branch name', location: 'Location', manager: 'Manager', username: 'Username',
    province: 'Province', city: 'City or district', address: 'Full address', branchPhone: 'Branch phone',
    branchInfo: 'Branch information',
    managerInfo: 'Branch manager information', credentials: 'Login credentials', managerName: 'Manager full name',
    fatherName: 'Father name', managerPhone: 'Manager phone', nationalId: 'National ID', managerAddress: 'Home address',
    login: 'Email or username', password: 'Password', confirm: 'Confirm password',
    create: 'Create branch and account', cancel: 'Cancel', required: 'Complete all required fields.', mismatch: 'Passwords do not match.',
    shortPassword: 'Password must contain at least 8 characters.', success: 'Branch and manager account created.',
    passwordSaved: 'Password saved. The branch manager can sign in with the new password.', passwordSavedDisabled: 'Password saved. Enable the login using the power icon to allow sign-in.',
    loadError: 'The branch database is not ready. Apply and deploy the latest Supabase changes.', total: 'Branches', managers: 'Managers',
  },
  fa: {
    add: 'افزودن شعبه', none: 'شعبه‌ای یافت نشد.', name: 'نام شعبه', location: 'موقعیت', manager: 'مدیر', username: 'نام کاربری',
    province: 'ولایت', city: 'شهر یا ولسوالی', address: 'آدرس کامل', branchPhone: 'شماره شعبه',
    branchInfo: 'معلومات شعبه',
    managerInfo: 'معلومات مدیر شعبه', credentials: 'معلومات ورود', managerName: 'نام کامل مدیر', fatherName: 'نام پدر',
    managerPhone: 'شماره تماس مدیر', nationalId: 'نمبر تذکره', managerAddress: 'آدرس خانه',
    login: 'ایمیل یا نام کاربری', password: 'رمز عبور', confirm: 'تکرار رمز عبور', create: 'ایجاد شعبه و حساب',
    cancel: 'انصراف', required: 'خانه‌های ضروری را تکمیل کنید.', mismatch: 'رمزهای عبور یکسان نیست.',
    shortPassword: 'رمز عبور باید حداقل 8 حرف داشته باشد.', success: 'شعبه و حساب مدیر ایجاد شد.',
    passwordSaved: 'رمز عبور ثبت شد. مدیر شعبه می‌تواند با رمز جدید وارد شود.', passwordSavedDisabled: 'رمز عبور ثبت شد. برای ورود، حساب را با آیکن روشن/خاموش فعال کنید.',
    loadError: 'دیتابیس شعبات آماده نیست. تغییرات جدید Supabase را اجرا و نشر کنید.', total: 'شعبات', managers: 'مدیران',
  },
}

const initialForm = {
  name: '', province: '', city: '', address: '', branchPhone: '',
  managerName: '', fatherName: '', managerPhone: '', nationalId: '', managerAddress: '', login: '', password: '', confirm: '',
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
  const request=useRef(null)

  const loadBranches = useCallback(async () => {
    const { data, error } = await supabase.from('branches').select('*, manager:profiles!branches_manager_user_id_fkey(*)').order('name')
    setLoading(false)
    if (error) return setMessage({ type: 'error', text: text.loadError })
    setBranches(data || [])
  }, [text.loadError])

  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { void loadBranches() }, [loadBranches])

  function update(name, value) { setForm(current => ({ ...current, [name]: value })) }
  function edit(row){setEditing(row);setForm({name:row.name,province:row.province,city:row.city,address:row.address||'',branchPhone:row.phone||'',managerName:row.manager?.full_name||'',fatherName:row.manager?.father_name||'',managerPhone:row.manager?.phone||'',nationalId:row.manager?.national_id||'',managerAddress:row.manager?.address||'',login:row.manager?.username||'',password:'',confirm:''});setMessage(null);request.current=null;setOpen(true)}
  async function archiveBranch(){setSaving(true);setMessage(null);try{await rpc('save_branch_record',{p_id:deletion.id,p_request:crypto.randomUUID(),p_expected:deletion.updated_at,p_data:{...deletion,archived:!deletion.archived_at,manager_enabled:deletion.manager?.account_enabled??false}});setDeletion(null);await loadBranches()}catch(e){setMessage({type:'error',text:explain(e,language)})}finally{setSaving(false)}}

  async function submit(event) {
    event.preventDefault(); setMessage(null)
    if(editing){
      setSaving(true)
      try{
        const payload={name:form.name,province:form.province,city:form.city,address:form.address,phone:form.branchPhone,manager_user_id:editing.manager_user_id,manager_name:form.managerName,manager_phone:form.managerPhone,father_name:form.fatherName,national_id:form.nationalId,manager_address:form.managerAddress,manager_enabled:editing.manager?.account_enabled??false}
        const key=JSON.stringify(payload);if(request.current?.key!==key)request.current={key,id:crypto.randomUUID()}
        await rpc('save_branch_record',{p_id:editing.id,p_request:request.current.id,p_data:payload,p_expected:editing.updated_at});setOpen(false);setEditing(null);await loadBranches()
      }catch(e){setMessage({type:'error',text:explain(e,language)})}finally{setSaving(false)}
      return
    }
    if (!form.name || !form.province || !form.city || !form.managerName || !form.managerPhone || !form.login || !form.password) return setMessage({ type: 'error', text: text.required })
    if (form.password.length < 8) return setMessage({ type: 'error', text: text.shortPassword })
    if (form.password !== form.confirm) return setMessage({ type: 'error', text: text.mismatch })
    setSaving(true)
    const key=JSON.stringify(form);if(request.current?.key!==key)request.current={key,id:crypto.randomUUID()}
    const { data, error } = await supabase.functions.invoke('create-branch-with-manager', { body: {
      request_id:request.current.id,
      branch: { name: form.name, province: form.province, city: form.city, address: form.address, phone: form.branchPhone },
      manager: { full_name: form.managerName, father_name: form.fatherName, phone: form.managerPhone, national_id: form.nationalId, address: form.managerAddress },
      credentials: { login: form.login, password: form.password },
    } })
    setSaving(false)
    if (error || data?.error) {
      let errorText = data?.error || error?.message
      if (error instanceof FunctionsHttpError) {
        try {
          const details = await error.context.json()
          errorText = details?.error || details?.message || errorText
        } catch {
          // Keep the SDK message when the response body is not JSON.
        }
      }
      return setMessage({ type: 'error', text: errorText ? explain({message:errorText},language) : text.loadError })
    }
    setForm(initialForm); setOpen(false); setMessage({ type: 'success', text: text.success }); loadBranches()
  }

  return <div className="registry-page branch-registry">
    <div className="registry-actions"><button className="registry-primary" onClick={() => { setMessage(null); setEditing(null);setForm(initialForm);request.current=null;setOpen(true) }}><Plus size={18} />{text.add}</button><button className="registry-secondary" aria-pressed={archived} onClick={()=>setArchived(!archived)}><Archive size={18}/>{language==='fa'?'بایگانی':'Archive'}</button></div>
    {message && <div className={`registry-notice ${message.type}`}>{message.code?text[message.code]:message.text}</div>}
    <div className="branch-table-wrap"><table className="branch-table"><thead><tr><th>{text.name}</th><th>{text.location}</th><th>{text.manager}</th><th>{text.branchPhone}</th><th>{text.username}</th><th>{text.password}</th><th>{language==='fa'?'حساب':'Account'}</th><th>{language==='fa'?'عملیات':'Actions'}</th></tr></thead><tbody>
      {loading ? <tr><td colSpan="8" className="branch-table-empty"><span className="spinner dark" /></td></tr> : branches.filter(b=>!!b.archived_at===archived).length ? branches.filter(b=>!!b.archived_at===archived).map(branch => <tr key={branch.id}>
        <td><span className="branch-name-cell"><span className="branch-table-icon"><Building2 size={18} /></span><strong>{branch.name}</strong></span></td>
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
        <FormSection title={text.branchInfo} icon={<Building2 size={18} />}>
          <Field label={text.name} required value={form.name} onChange={value => update('name', value)} />
          <Field label={text.province} required value={form.province} onChange={value => update('province', value)} />
          <Field label={text.city} required value={form.city} onChange={value => update('city', value)} />
          <Field label={text.address} value={form.address} onChange={value => update('address', value)} wide />
          <Field label={text.branchPhone} value={form.branchPhone} onChange={value => update('branchPhone', value)} />
        </FormSection>
        <FormSection title={text.managerInfo} icon={<UserRound size={18} />}>
          <Field label={text.managerName} required value={form.managerName} onChange={value => update('managerName', value)} />
          <Field label={text.fatherName} value={form.fatherName} onChange={value => update('fatherName', value)} />
          <Field label={text.managerPhone} required value={form.managerPhone} onChange={value => update('managerPhone', value)} />
          <Field label={text.nationalId} value={form.nationalId} onChange={value => update('nationalId', value)} />
          <Field label={text.managerAddress} value={form.managerAddress} onChange={value => update('managerAddress', value)} wide />
        </FormSection>
        {!editing&&<FormSection title={text.credentials} icon={<KeyRound size={18} />}>
          <Field label={text.login} required value={form.login} onChange={value => update('login', value)} wide />
          <Field label={text.password} required type="password" value={form.password} onChange={value => update('password', value)} />
          <Field label={text.confirm} required type="password" value={form.confirm} onChange={value => update('confirm', value)} />
        </FormSection>}
        {message?.type === 'error' && <div className="registry-notice error branch-form-message">{message.text}</div>}
        <div className="registry-form-actions branch-actions"><button type="button" disabled={saving} onClick={() => setOpen(false)}>{text.cancel}</button><button className="registry-primary" disabled={saving}>{saving ? <span className="spinner" /> : editing?(language==='fa'?'ثبت':'Save'):text.create}</button></div>
      </form>
    </div></div>}
    {details&&<Modal title={details.name} onClose={()=>setDetails(null)}><dl className="record-details record-modal-body">{[[text.province,details.province],[text.city,details.city],[text.address,details.address],[text.branchPhone,details.phone],[text.managerName,details.manager?.full_name],[text.fatherName,details.manager?.father_name],[text.managerPhone,details.manager?.phone],[text.nationalId,details.manager?.national_id],[text.managerAddress,details.manager?.address]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||'—'}</dd></div>)}</dl></Modal>}
    {deletion&&<ConfirmArchive language={language} busy={saving} error={message?.text} restore={!!deletion.archived_at} onClose={()=>setDeletion(null)} onConfirm={archiveBranch}/>}
    {passwordBranch&&<BranchPassword key={passwordBranch.id} branch={passwordBranch} language={language} onClose={()=>setPasswordBranch(null)} onSaved={()=>{setPasswordBranch(null);setMessage({type:'success',code:passwordBranch.manager?.account_enabled?'passwordSaved':'passwordSavedDisabled'})}}/>}
  </div>
}

function FormSection({ title, icon, children }) { return <section className="branch-form-section"><h3>{icon}{title}</h3><div className="branch-form-fields">{children}</div></section> }
function Field({ label, required, type = 'text', value, onChange, wide }) { return <label className={wide ? 'wide' : ''}><span>{label}{required ? ' *' : ''}</span><input required={required} type={type} value={value} onChange={event => onChange(event.target.value)} /></label> }

