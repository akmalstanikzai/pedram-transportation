export default function OwnerRegistrationFields({ language, form, onChange, files = {}, onFilesChange }) {
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
    <fieldset className="owner-address-row wide"><legend>{t('Address', 'آدرس')}</legend>
      {field('province', 'Province', 'ولایت')}
      {field('district', 'District', 'ولسوالی')}
      {field('village', 'Village', 'قریه')}
    </fieldset>
    {field('notes', 'Notes', 'ملاحظات', false, 'text', true)}
    {[['profile_photo','Person Photo','عکس شخص'],['identity','Tazkira','تذکره']].map(([key,en,fa]) => <label className="owner-upload-field" key={key}>
      <span>{t(en,fa)} <small>{t('(optional)','(اختیاری)')}</small></span>
      <input type="file" accept={key === 'profile_photo' ? '.jpg,.jpeg,.png,.webp' : '.pdf,.jpg,.jpeg,.png,.webp'} onChange={event => onFilesChange(current => ({ ...current, [key]: event.target.files?.[0] || null }))}/>
      {files[key] && <small className="owner-file-name">{files[key].name}</small>}
    </label>)}
    <p className="wide booking-help">{t('Photo: JPG, PNG or WebP. Tazkira: PDF or image. Up to 5 MB per file.', 'عکس: JPG، PNG یا WebP. تذکره: PDF یا عکس. هر فایل تا 5 MB.')}</p>
  </>
}
