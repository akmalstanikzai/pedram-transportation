import {customsAgentFields,customsAgentFileTypes,latestCustomsAgentFiles} from '../lib/customsAgentForm'
import { Files, UserRound } from 'lucide-react'
import { RegistrationSection, RegistrationUpload } from './RegistrationFields'

export default function CustomsAgentFields({language,form,onChange,files,onFilesChange,existing=[],onView}) {
  const t=(en,fa)=>language==='fa'?fa:en
  const previous=latestCustomsAgentFiles(existing)
  const field=([key,en,fa,limit])=><label key={key}>
    <span>{t(en,fa)}{['name','phone'].includes(key)?' *':''}</span>
    <input type={key==='phone'?'tel':'text'} required={['name','phone'].includes(key)} maxLength={limit}
      dir={key==='phone'?'ltr':undefined} value={form[key]} onChange={event=>onChange(current=>({...current,[key]:event.target.value}))}/>
  </label>
  return <>
    <RegistrationSection kind="agent" tone="blue" title={t('Agent information','معلومات کمیشن کار')} icon={UserRound}>
      <div className="customs-fields-row wide">{customsAgentFields.slice(0,3).map(field)}</div>
      <div className="customs-fields-row wide">{customsAgentFields.slice(3).map(field)}</div>
    </RegistrationSection>
    <RegistrationSection kind="documents" tone="amber" title={t('Documents','اسناد')} icon={Files}>
    {customsAgentFileTypes.map(([type,en,fa])=>{
      const saved=previous.find(file=>file.document_type===type)
      return <div key={type} className="customs-upload-slot">
        <RegistrationUpload language={language} label={t(en,fa)} imageOnly={type==='photo'} fileName={files[type]?.name}
          onChange={file=>onFilesChange(current=>({...current,[type]:file}))}/>
        {saved && <button type="button" className="employee-existing-file" onClick={()=>onView(saved)}>{t('View saved file','دیدن فایل ثبت‌شده')} · {saved.file_name}</button>}
      </div>
    })}
    <p className="wide booking-help">{t('Photo: JPG, PNG or WebP. Documents: PDF or image. Up to 5 MB per file.','عکس: JPG، PNG یا WebP. اسناد: PDF یا عکس. هر فایل تا 5 MB.')}</p>
    </RegistrationSection>
  </>
}
