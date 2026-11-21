export const employeeFields = [
  ['first_name','Name','نام'], ['last_name','Surname','تخلص'],
  ['father_name','Father name','نام پدر'], ['phone','Contact','موبایل'],
  ['province','Province','ولایت'], ['district','District','ولسوالی'], ['village','Village','قریه'],
  ['occupation','Occupation','وظیفه'],
  ['salary','Salary (AFN)','معاش (افغانی)'],
]
export const employeeFileTypes = [['photo', 'Employee photo', 'عکس کارمند'], ['identity', 'National ID / Tazkira', 'تذکره'], ['other', 'Other document', 'سند دیگر']]
const mime = { pdf:'application/pdf', jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', webp:'image/webp' }
export function validateEmployeeFiles(files) {
  for (const [type, file] of Object.entries(files)) {
    if (!file) continue
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!employeeFileTypes.some(([key]) => key === type) || !mime[ext] || type === 'photo' && ext === 'pdf' || file.size <= 0 || file.size > 5242880 || file.name.length > 255) throw new Error('INVALID_FILE')
  }
}


// Retain the saved record and each file's request ID until all uploads finish.
export async function persistEmployee(progress, { payload, files, validateFiles, saveRecord, uploadFile, onSaved, makeId = () => crypto.randomUUID() }) {
  validateFiles(files)
  if (!progress.saved) {
    progress.id ||= makeId()
    progress.saved = await saveRecord(progress.id, payload)
    onSaved(progress.saved)
  }
  for (const [type, file] of Object.entries(files)) {
    if (!file) continue
    progress.uploads ||= {}
    const entry = progress.uploads[type] ||= {id:makeId(), done:false}
    if (entry.done) continue
    await uploadFile(progress.saved.id, type, file, entry.id)
    entry.done = true
  }
  return progress.saved
}
