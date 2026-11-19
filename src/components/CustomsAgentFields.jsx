import {customsAgentFields,customsAgentFileTypes,latestCustomsAgentFiles} from '../lib/customsAgentForm'

export default function CustomsAgentFields({language,form,onChange,files,onFilesChange,existing=[],onView}) {
  const t=(en,fa)=>language==='fa'?fa:en
  const previous=latestCustomsAgentFiles(existing)
  const field=([key,en,fa,limit])=><label key={key}>
    <span>{t(en,fa)}{['name','phone'].includes(key)?' *':''}</span>
    <input type={key==='phone'?'tel':'text'} required={['name','phone'].includes(key)} maxLength={limit}
      dir={key==='phone'?'ltr':undefined} value={form[key]} onChange={event=>onChange(current=>({...current,[key]:event.target.value}))}/>
  </label>
  return <>
    <div className="customs-fields-row">{customsAgentFields.slice(0,3).map(field)}</div>
    <div className="customs-fields-row">{customsAgentFields.slice(3).map(field)}</div>
    <div className="customs-upload-grid">{customsAgentFileTypes.map(([type,en,fa])=>{
      const saved=previous.find(file=>file.document_type===type)
      return <label key={type}><span>{t(en,fa)}</span>
        <input type="file" accept={type==='photo'?'.jpg,.jpeg,.png,.webp':'.pdf,.jpg,.jpeg,.png,.webp'}
          onChange={event=>onFilesChange(current=>({...current,[type]:event.target.files?.[0] || null}))}/>
        {files[type] && <small>{files[type].name}</small>}
        {saved && <button type="button" className="employee-existing-file" onClick={()=>onView(saved)}>{t('View saved file','دیدن فایل ثبت‌شده')} · {saved.file_name}</button>}
      </label>
    })}</div>
    <p className="booking-help">{t('Photo: JPG, PNG or WebP. Documents: PDF or image. Up to 5 MB per file.','عکس: JPG، PNG یا WebP. اسناد: PDF یا عکس. هر فایل تا 5 MB.')}</p>
  </>
}
