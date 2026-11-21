import { Files } from 'lucide-react'
import { RegistrationSection, RegistrationUpload } from './RegistrationFields'

const slots = [['profile_photo','Vehicle picture','عکس موتر'],['permit','Road permit','جواز سیر'],['card','Card','کارت'],['booklet','Booklet','کتابچه'],['other','Other document','سند دیگر']]

export default function VehicleUploads({ language, photo, onPhotoChange, files, onFilesChange }) {
  const t = (en,fa) => language === 'fa' ? fa : en
  return <RegistrationSection kind="documents" tone="amber" title={t('Vehicle documents','اسناد واسطه')} icon={Files}>
    {slots.map(([key,en,fa]) => {
      const isPhoto = key === 'profile_photo'
      return <RegistrationUpload key={key} language={language} label={t(en,fa)} imageOnly={isPhoto}
        fileName={(isPhoto ? photo : files[key])?.name}
        onChange={isPhoto ? onPhotoChange : file => onFilesChange(current => ({...current,[key]:file}))} />
    })}
    <p className="wide booking-help">{t('Photos: JPG, PNG or WebP. Documents: PDF or image. Up to 5 MB per file.', 'عکس: JPG، PNG یا WebP. اسناد: PDF یا عکس. هر فایل تا 5 MB.')}</p>
  </RegistrationSection>
}
