const slots = [['profile_photo','Vehicle picture','عکس موتر'],['permit','Road permit','جواز سیر'],['card','Card','کارت'],['booklet','Booklet','کتابچه'],['other','Other document','سند دیگر']]

export default function VehicleUploads({ language, photo, onPhotoChange, files, onFilesChange }) {
  const t = (en,fa) => language === 'fa' ? fa : en
  return <div className="vehicle-upload-grid wide">
    {slots.map(([key,en,fa]) => <label key={key}>
      <span>{t(en,fa)}</span>
      <input type="file" accept={key === 'profile_photo' ? '.jpg,.jpeg,.png,.webp' : '.pdf,.jpg,.jpeg,.png,.webp'} onChange={event => key === 'profile_photo' ? onPhotoChange(event.target.files?.[0] || null) : onFilesChange(current => ({ ...current, [key]: event.target.files?.[0] || null }))}/>
      {(key === 'profile_photo' ? photo : files[key]) && <small>{(key === 'profile_photo' ? photo : files[key]).name}</small>}
    </label>)}
    <p className="wide booking-help">{t('Photos: JPG, PNG or WebP. Documents: PDF or image. Up to 5 MB per file.', 'عکس: JPG، PNG یا WebP. اسناد: PDF یا عکس. هر فایل تا 5 MB.')}</p>
  </div>
}
