import { Files, MapPin, UserRound } from 'lucide-react'
import { RegistrationSection, RegistrationUpload } from './RegistrationFields'

const documentSlots = [
  ['profile_photo', 'Photo of Driver', 'عکس راننده'], ['identity', 'Tazkira', 'تذکره'],
  ['licence', 'License', 'لایسنس'], ['passport', 'Passport', 'پاسپورت'],
  ['health', 'Health Card', 'کارت صحت'], ['other', 'Other Document', 'اسناد دیگر'],
]

export default function DriverRegistrationFields({ language, form, onChange, files = {}, onFilesChange }) {
  const t = (en, fa) => language === 'fa' ? fa : en
  const field = (key, en, fa, required = false, type = 'text') => <label>
    <span>{t(en, fa)}{required ? ' *' : ''}</span>
    <input type={type} required={required} value={form[key] || ''} onChange={event => onChange({ ...form, [key]: event.target.value })}/>
  </label>
  return <>
    <RegistrationSection kind="driver" tone="blue" title={t('Driver information', 'معلومات راننده')} icon={UserRound}>
      {field('first_name', 'Name', 'نام', true)}
      {field('surname', 'Surname', 'تخلص')}
      {field('father_name', 'Father name', 'نام پدر')}
      {field('phone', 'Mobile', 'موبایل', true, 'tel')}
    </RegistrationSection>
    <RegistrationSection kind="location" tone="teal" title={t('Location', 'موقعیت')} icon={MapPin}>
      <fieldset className="driver-address-row wide" aria-label={t('Address', 'آدرس')}>
        {field('province', 'Province', 'ولایت')}
        {field('district', 'District', 'ولسوالی')}
        {field('village', 'Village', 'قریه')}
      </fieldset>
    </RegistrationSection>
    <RegistrationSection kind="documents" tone="amber" title={t('Driver documents', 'اسناد راننده')} icon={Files}>
      {documentSlots.map(([key,en,fa]) => <RegistrationUpload key={key} language={language} label={t(en,fa)}
        imageOnly={key==='profile_photo'} fileName={files[key]?.name} onChange={file=>onFilesChange(current=>({...current,[key]:file}))} />)}
      <p className="wide booking-help">{t('Photo: JPG, PNG or WebP. Documents: PDF or image. Up to 5 MB per file.', 'عکس: JPG، PNG یا WebP. اسناد: PDF یا عکس. هر فایل تا 5 MB.')}</p>
    </RegistrationSection>
  </>
}
