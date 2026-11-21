import { Upload } from 'lucide-react'
import './RegistrationFields.css'

export function RegistrationSection({ kind, tone, title, icon: SectionIcon, children }) {
  return <section className="registration-section" data-section={kind} data-tone={tone} aria-label={title}>
    <h3><SectionIcon size={17} aria-hidden="true" />{title}</h3>
    <div className="registration-grid">{children}</div>
  </section>
}

export function RegistrationUpload({ language, label, imageOnly, fileName, onChange }) {
  return <label className="registration-upload">
    <span>{label}</span>
    <span className="registration-file-control">
      <input type="file" aria-label={label} accept={imageOnly ? '.jpg,.jpeg,.png,.webp' : '.pdf,.jpg,.jpeg,.png,.webp'}
        onChange={event => onChange(event.target.files?.[0] || null)} />
      <Upload size={15} aria-hidden="true" />
      <span aria-hidden="true">{language === 'fa' ? 'انتخاب فایل' : 'Choose file'}</span>
    </span>
    {fileName && <small><bdi>{fileName}</bdi></small>}
  </label>
}
