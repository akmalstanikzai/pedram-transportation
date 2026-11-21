import { Files, MapPin, UserRound } from 'lucide-react'
import { RegistrationSection, RegistrationUpload } from './RegistrationFields'

export default function OwnerRegistrationFields({ language, form, onChange, files = {}, onFilesChange }) {
  const t = (en, fa) => language === 'fa' ? fa : en
  const field = (key, en, fa, required = false, type = 'text', wide = false) => <label className={wide ? 'wide' : ''}>
    <span>{t(en, fa)}{required ? ' *' : ''}</span>
    <input type={type} required={required} value={form[key] || ''} onChange={event => onChange({ ...form, [key]: event.target.value })}/>
  </label>
  return <>
    <RegistrationSection kind="owner" tone="blue" title={t('Owner information', 'معلومات مالک')} icon={UserRound}>
      {field('first_name', 'Name', 'نام', true)}
      {field('surname', 'Surname', 'تخلص')}
      {field('father_name', 'Father name', 'نام پدر')}
      {field('phone', 'Mobile', 'موبایل', true, 'tel')}
    </RegistrationSection>
    <RegistrationSection kind="location" tone="teal" title={t('Location', 'موقعیت')} icon={MapPin}>
      <fieldset className="owner-address-row wide" aria-label={t('Address', 'آدرس')}>
        {field('province', 'Province', 'ولایت')}
        {field('district', 'District', 'ولسوالی')}
        {field('village', 'Village', 'قریه')}
      </fieldset>
      {field('notes', 'Notes', 'ملاحظات', false, 'text', true)}
    </RegistrationSection>
    <RegistrationSection kind="documents" tone="amber" title={t('Owner documents', 'اسناد مالک')} icon={Files}>
      {[['profile_photo','Person Photo','عکس شخص'],['identity','Tazkira','تذکره']].map(([key,en,fa]) =>
        <RegistrationUpload key={key} language={language} label={t(en,fa)} imageOnly={key==='profile_photo'}
          fileName={files[key]?.name} onChange={file=>onFilesChange(current=>({...current,[key]:file}))} />)}
      <p className="wide booking-help">{t('Photo: JPG, PNG or WebP. Tazkira: PDF or image. Up to 5 MB per file.', 'عکس: JPG، PNG یا WebP. تذکره: PDF یا عکس. هر فایل تا 5 MB.')}</p>
    </RegistrationSection>
  </>
}
