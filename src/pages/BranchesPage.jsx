import { useCallback, useEffect, useState } from 'react'
import { Building2, KeyRound, Plus, UserRound } from 'lucide-react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

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
    shortPassword: 'رمز عبور باید حداقل ۸ حرف داشته باشد.', success: 'شعبه و حساب مدیر ایجاد شد.',
    loadError: 'دیتابیس شعبات آماده نیست. تغییرات جدید Supabase را اجرا و نشر کنید.', total: 'شعبات', managers: 'مدیران',
  },
}

const initialForm = {
  name: '', province: '', city: '', address: '', branchPhone: '',
  managerName: '', fatherName: '', managerPhone: '', nationalId: '', managerAddress: '', login: '', password: '', confirm: '',
}

export default function BranchesPage({ language }) {
  const text = labels[language] || labels.en
  const [branches, setBranches] = useState([])
  const [form, setForm] = useState(initialForm)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)

  const loadBranches = useCallback(async () => {
    const { data, error } = await supabase.from('branches').select('*, manager:profiles!branches_manager_user_id_fkey(full_name, phone, username, account_enabled)').order('name')
    setLoading(false)
    if (error) return setMessage({ type: 'error', text: text.loadError })
    setBranches(data || [])
  }, [text.loadError])

  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { void loadBranches() }, [loadBranches])

  function update(name, value) { setForm(current => ({ ...current, [name]: value })) }

  async function submit(event) {
    event.preventDefault(); setMessage(null)
    if (!form.name || !form.province || !form.city || !form.managerName || !form.managerPhone || !form.login || !form.password) return setMessage({ type: 'error', text: text.required })
    if (form.password.length < 8) return setMessage({ type: 'error', text: text.shortPassword })
    if (form.password !== form.confirm) return setMessage({ type: 'error', text: text.mismatch })
    setSaving(true)
    const { data, error } = await supabase.functions.invoke('create-branch-with-manager', { body: {
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
      return setMessage({ type: 'error', text: errorText || text.loadError })
    }
    setForm(initialForm); setOpen(false); setMessage({ type: 'success', text: text.success }); loadBranches()
  }

  return <div className="registry-page branch-registry">
    <div className="registry-actions"><button className="registry-primary" onClick={() => { setMessage(null); setOpen(true) }}><Plus size={18} />{text.add}</button></div>
    {message && <div className={`registry-notice ${message.type}`}>{message.text}</div>}
    <div className="branch-table-wrap"><table className="branch-table"><thead><tr><th>{text.name}</th><th>{text.location}</th><th>{text.manager}</th><th>{text.branchPhone}</th><th>{text.username}</th></tr></thead><tbody>
      {loading ? <tr><td colSpan="5" className="branch-table-empty"><span className="spinner dark" /></td></tr> : branches.length ? branches.map(branch => <tr key={branch.id}>
        <td><span className="branch-name-cell"><span className="branch-table-icon"><Building2 size={18} /></span><strong>{branch.name}</strong></span></td>
        <td>{branch.city}, {branch.province}</td>
        <td>{branch.manager?.full_name || '—'}</td>
        <td>{branch.phone || branch.manager?.phone || '—'}</td>
        <td>{branch.manager?.username || '—'}</td>
      </tr>) : <tr><td colSpan="5" className="branch-table-empty"><Building2 size={28} /><strong>{text.none}</strong></td></tr>}
    </tbody></table></div>

    {open && <div className="registry-modal" role="dialog" aria-modal="true"><div className="registry-form-card branch-form-card">
      <div className="registry-form-head"><span className="module-card-icon blue"><Building2 size={27} /></span><h2>{text.add}</h2></div>
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
        <FormSection title={text.credentials} icon={<KeyRound size={18} />}>
          <Field label={text.login} required value={form.login} onChange={value => update('login', value)} wide />
          <Field label={text.password} required type="password" value={form.password} onChange={value => update('password', value)} />
          <Field label={text.confirm} required type="password" value={form.confirm} onChange={value => update('confirm', value)} />
        </FormSection>
        {message?.type === 'error' && <div className="registry-notice error branch-form-message">{message.text}</div>}
        <div className="registry-form-actions branch-actions"><button type="button" onClick={() => setOpen(false)}>{text.cancel}</button><button className="registry-primary" disabled={saving}>{saving ? <span className="spinner" /> : text.create}</button></div>
      </form>
    </div></div>}
  </div>
}

function FormSection({ title, icon, children }) { return <section className="branch-form-section"><h3>{icon}{title}</h3><div className="branch-form-fields">{children}</div></section> }
function Field({ label, required, type = 'text', value, onChange, wide }) { return <label className={wide ? 'wide' : ''}><span>{label}{required ? ' *' : ''}</span><input required={required} type={type} value={value} onChange={event => onChange(event.target.value)} /></label> }

