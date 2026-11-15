import { employeeFields, employeeFileTypes } from '../lib/employeeSave'

export default function EmployeeRegistrationFields({language, form, onChange, files, onFilesChange, existing = [], onView}) {
  const t = (en,fa) => language === 'fa' ? fa : en
  const field = ([key,en,fa]) => <label key={key}><span>{t(en,fa)}{key !== 'father_name' ? ' *' : ''}</span><input required={key !== 'father_name'} type={key === 'salary' ? 'number' : key === 'phone' ? 'tel' : 'text'} min={key === 'salary' ? '0' : undefined} step={key === 'salary' ? '0.01' : undefined} value={form[key] || ''} onChange={event => onChange(current => ({...current, [key]:event.target.value}))}/></label>
  return <>
    {employeeFields.slice(0,4).map(field)}
    <div className="employee-address-row wide">{employeeFields.slice(4,7).map(field)}</div>
    {field(employeeFields[7])}
    <div className="employee-upload-grid wide">{employeeFileTypes.map(([type,en,fa]) => {
      const previous = existing.filter(row => row.document_type === type && row.state === 'ready').sort((a,b) => b.created_at.localeCompare(a.created_at))[0]
      return <label key={type}><span>{t(en,fa)}</span><input type="file" accept={type === 'photo' ? '.jpg,.jpeg,.png,.webp' : '.pdf,.jpg,.jpeg,.png,.webp'} onChange={event => onFilesChange(current => ({...current,[type]:event.target.files?.[0] || null}))}/>{files[type] && <small>{files[type].name}</small>}{previous && <button className="employee-existing-file" type="button" onClick={() => onView(previous)}>{t('View saved file','دیدن فایل ثبت‌شده')} · {previous.file_name}</button>}</label>
    })}</div>
    <p className="wide booking-help">{t('Photo: JPG, PNG or WebP. Documents: PDF or image. Up to 5 MB per file.', 'عکس: JPG، PNG یا WebP. اسناد: PDF یا عکس. هر فایل تا 5 MB.')}</p>
  </>
}
