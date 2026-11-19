import {supabase} from './supabase'
import {rpc} from './operations'
import {customsFileMime} from './customsAgentForm'

export async function loadCustomsAgents() {
  const rows=[]
  for (let offset=0;;offset+=500) {
    const {data,error}=await supabase.from('customs_agents').select('*, customs_agent_files(*)')
      .order('created_at',{ascending:false}).order('id').range(offset,offset+499)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length<500) return rows
  }
}
export const saveCustomsAgent = (id,payload,updatedAt) => rpc('save_customs_agent',{p_id:id,p_data:payload,p_updated_at:updatedAt || null})
export async function uploadCustomsAgentFile(agentId,type,file,id) {
  const mime=customsFileMime[file.name.split('.').pop().toLowerCase()]
  const path=await rpc('reserve_customs_agent_file',{p_id:id,p_agent:agentId,p_type:type,p_name:file.name,p_mime:mime,p_size:file.size})
  const {error}=await supabase.storage.from('customs-agent-files').upload(path,file,{contentType:mime,upsert:false})
  if (error && String(error.statusCode)!=='409') throw error
  await rpc('complete_customs_agent_file',{p_id:id})
}
export async function customsAgentFileUrl(file) {
  const {data,error}=await supabase.storage.from('customs-agent-files').createSignedUrl(file.storage_path,120)
  if (error) throw error
  return data.signedUrl
}
