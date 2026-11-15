import { supabase } from './supabase'
import { rpc } from './operations'

const mime = { pdf:'application/pdf', jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', webp:'image/webp' }


export async function uploadEmployeeFile(employeeId, type, file, id) {
  const ext = file.name.split('.').pop().toLowerCase()
  const path = await rpc('reserve_employee_file', {p_id:id, p_employee:employeeId, p_type:type, p_name:file.name, p_mime:mime[ext], p_size:file.size})
  const {error} = await supabase.storage.from('employee-files').upload(path, file, {contentType:mime[ext], upsert:false})
  // A previous upload may have succeeded before its response was lost.
  if (error && String(error.statusCode) !== '409') throw error
  await rpc('complete_employee_file', {p_id:id})
}
