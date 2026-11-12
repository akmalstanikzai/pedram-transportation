import { ownerFormPayload } from './ownerForm.js'

export async function persistVehicleOwner(progress, { form, files, saveOwner, uploadPhoto, uploadIdentity, onCreated, makeRequestId = () => crypto.randomUUID() }) {
  for (const [key,file] of Object.entries(files)) {
    if (!file) continue
    const extension = file.name.split('.').pop()?.toLowerCase()
    const allowed = key === 'profile_photo' ? ['jpg','jpeg','png','webp'] : key === 'identity' ? ['pdf','jpg','jpeg','png','webp'] : []
    if (!allowed.includes(extension) || file.size <= 0 || file.size > 5242880) throw new Error('INVALID_FILE')
  }
  if (!progress.saved) {
    const payload = ownerFormPayload(form), key = JSON.stringify(payload)
    if (progress.request?.key !== key) progress.request = { key, id: makeRequestId() }
    const id = await saveOwner({ p_id: null, p_request: progress.request.id, p_data: payload, p_expected: null })
    progress.saved = { ...payload, id, archived_at: null }
    onCreated(progress.saved)
  }
  for (const [key,file] of Object.entries(files)) {
    if (!file || progress.completed.has(key)) continue
    if (key === 'profile_photo') await uploadPhoto(progress.saved.id,file)
    else await uploadIdentity(progress.saved.id,file)
    progress.completed.add(key)
  }
  return progress.saved
}
