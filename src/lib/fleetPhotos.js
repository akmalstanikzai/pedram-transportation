import { supabase } from './supabase'
import { rpc } from './operations'

const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }
const passportMime = { ...mime, pdf: 'application/pdf' }

export async function uploadFleetPhoto(kind, parentId, file) {
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (!mime[ext] || !file.size || file.size > 5 * 1024 * 1024) throw new Error('INVALID_FILE')
  const id = crypto.randomUUID()
  const path = await rpc('reserve_fleet_document', { p_id: id, p_kind: kind, p_parent: parentId, p_type: 'profile_photo', p_name: file.name, p_mime: mime[ext], p_size: file.size, p_expires: null })
  const { error } = await supabase.storage.from('fleet-documents').upload(path, file, { contentType: mime[ext], upsert: false })
  if (error) throw error
  await rpc('complete_fleet_document', { p_id: id })
}

export async function uploadDriverPassport(parentId, file) {
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (!passportMime[ext] || !file.size || file.size > 5 * 1024 * 1024) throw new Error('INVALID_FILE')
  const id = crypto.randomUUID()
  const path = await rpc('reserve_fleet_document', { p_id: id, p_kind: 'driver', p_parent: parentId, p_type: 'passport', p_name: file.name, p_mime: passportMime[ext], p_size: file.size, p_expires: null })
  const { error } = await supabase.storage.from('fleet-documents').upload(path, file, { contentType: passportMime[ext], upsert: false })
  if (error) throw error
  await rpc('complete_fleet_document', { p_id: id })
}

export async function loadFleetPhotos() {
  const data = []
  for (let offset = 0; ; offset += 500) {
    const { data: page, error } = await supabase.from('vehicle_documents').select('vehicle_id,owner_id,driver_id,storage_path,created_at').eq('document_type', 'profile_photo').eq('state', 'ready').order('created_at', { ascending: false }).range(offset, offset + 499)
    if (error) throw error
    data.push(...page)
    if (page.length < 500) break
  }
  const latest = new Map()
  for (const row of data || []) {
    const id = row.vehicle_id || row.owner_id || row.driver_id
    if (id && !latest.has(id)) latest.set(id, row.storage_path)
  }
  const paths = [...latest.values()]
  if (!paths.length) return {}
  const urls = []
  for (let offset = 0; offset < paths.length; offset += 100) {
    const { data: signed, error } = await supabase.storage.from('fleet-documents').createSignedUrls(paths.slice(offset, offset + 100), 3600)
    if (error) throw error
    urls.push(...signed)
  }
  return Object.fromEntries([...latest].map(([id], index) => [id, urls[index]?.signedUrl || '']))
}
