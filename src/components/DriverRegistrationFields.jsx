const documentSlots = [
  ['profile_photo', 'Photo of Driver', 'عکس راننده'], ['identity', 'Tazkira', 'تذکره'],
  ['licence', 'License', 'لایسنس'], ['passport', 'Passport', 'پاسپورت'],
  ['health', 'Health Card', 'کارت صحت'], ['other', 'Other Document', 'اسناد دیگر'],
]

export default function DriverRegistrationFields({ language, form, onChange, files = {}, onFilesChange }) {
  const t = (en, fa) => language === 'fa' ? fa : en
  const field = (key, en, fa, required = false, type = 'text', wide = false) => <label className={wide ? 'wide' : ''}>
    <span>{t(en, fa)}{required ? ' *' : ''}</span>
    <input type={type} required={required} value={form[key] || ''} onChange={event => onChange({ ...form, [key]: event.target.value })}/>
  </label>
  return <>
    {field('first_name', 'Name', 'نام', true)}
    {field('surname', 'Surname', 'تخلص')}
    {field('father_name', 'Father name', 'نام پدر')}
    {field('phone', 'Mobile', 'موبایل', true, 'tel')}
    <fieldset className="driver-address-row wide" aria-label={t('Address', 'آدرس')}>
      {field('province', 'Province', 'ولایت')}
      {field('district', 'District', 'ولسوالی')}
      {field('village', 'Village', 'قریه')}
    </fieldset>
    {documentSlots.map(([key,en,fa]) => <label className="driver-upload-field" key={key}>
      <span>{t(en,fa)}</span>
      <input type="file" accept={key === 'profile_photo' ? '.jpg,.jpeg,.png,.webp' : '.pdf,.jpg,.jpeg,.png,.webp'} onChange={event => onFilesChange(current => ({ ...current, [key]: event.target.files?.[0] || null }))}/>
      {files[key] && <small className="driver-file-name">{files[key].name}</small>}
    </label>)}
    <p className="wide booking-help">{t('Photo: JPG, PNG or WebP. Documents: PDF or image. Up to 5 MB per file.', 'عکس: JPG، PNG یا WebP. اسناد: PDF یا عکس. هر فایل تا 5 MB.')}</p>
  </>
}
