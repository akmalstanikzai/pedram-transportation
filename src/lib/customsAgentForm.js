export const customsAgentFields = [
  ['name','Name','نام',150], ['father_name','Father name','نام پدر',150], ['phone','Mobile','موبایل',40],
  ['province','Province','ولایت',100], ['district','District','ولسوالی',100], ['village','Village','قریه',150],
]
export const customsAgentFileTypes = [
  ['identity','Tazkira','تذکره'], ['photo','Commission agent photo','عکس کمیشن کار'],
  ['other1','Other document 1','سند دیگر ۱'], ['other2','Other document 2','سند دیگر ۲'],
]
export const customsFileMime = {pdf:'application/pdf',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp'}
export function customsAgentForm(row) {
  return Object.fromEntries(customsAgentFields.map(([key])=>[key,String(row?.[key] ?? '')]))
}
export function validateCustomsAgentFiles(files) {
  for (const [type,file] of Object.entries(files)) {
    if (!file) continue
    const ext=file.name.split('.').pop()?.toLowerCase()
    if (!customsAgentFileTypes.some(([key])=>key===type) || !customsFileMime[ext] || type==='photo' && ext==='pdf'
      || file.size<=0 || file.size>5242880 || file.name.length>255) throw new Error('INVALID_FILE')
  }
}
export function latestCustomsAgentFiles(files = []) {
  return customsAgentFileTypes.map(([type])=>files.filter(file=>file.document_type===type && file.state==='ready')
    .sort((a,b)=>b.created_at.localeCompare(a.created_at))[0]).filter(Boolean)
}

export async function persistCustomsAgent(progress, {form,files,saveRecord,uploadFile,onSaved,makeId=()=>crypto.randomUUID()}) {
  const payload=Object.fromEntries(customsAgentFields.map(([key])=>[key,String(form[key] || '').trim()]))
  if (!payload.name || !payload.phone) throw new Error('REQUIRED_FIELDS')
  if (customsAgentFields.some(([key,,,limit])=>payload[key].length>limit)) throw new Error('INVALID_CUSTOMS_AGENT')
  validateCustomsAgentFiles(files)
  if (!progress.saved) {
    const signature=JSON.stringify(payload)
    if (progress.signature && progress.signature!==signature) throw new Error('REQUEST_CONFLICT')
    progress.signature=signature
    progress.id ||= makeId()
    progress.saved=await saveRecord(progress.id,payload)
    onSaved(progress.saved)
  }
  for (const [type,file] of Object.entries(files)) {
    if (!file) continue
    progress.uploads ||= {}
    const entry=progress.uploads[type] ||= {id:makeId(),done:false}
    if (entry.done) continue
    await uploadFile(progress.saved.id,type,file,entry.id)
    entry.done=true
  }
  return progress.saved
}
