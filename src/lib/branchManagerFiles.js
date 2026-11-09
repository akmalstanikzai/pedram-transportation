import { supabase } from './supabase'
import { rpc } from './operations'

const mime={pdf:'application/pdf',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp'}

export async function uploadBranchManagerFile(branchId,type,file){
  const ext=file.name.split('.').pop()?.toLowerCase()
  if(!mime[ext]||type==='photo'&&ext==='pdf'||file.size>5242880||file.size<=0)throw new Error('Use a JPG, PNG, WebP or PDF file up to 5 MB. Photos must be images.')
  const id=crypto.randomUUID()
  const path=await rpc('reserve_branch_manager_file',{p_id:id,p_branch:branchId,p_type:type,p_name:file.name,p_mime:mime[ext],p_size:file.size})
  const {error}=await supabase.storage.from('branch-manager-files').upload(path,file,{contentType:mime[ext],upsert:false})
  if(error)throw error
  await rpc('complete_branch_manager_file',{p_id:id})
}

export async function loadBranchManagerFiles(){
  const {data,error}=await supabase.from('branch_manager_files').select('branch_id,document_type,file_name,storage_path,created_at').eq('state','ready').order('created_at',{ascending:false})
  if(error)throw error
  const latest=new Map()
  for(const row of data||[]){const key=`${row.branch_id}:${row.document_type}`;if(!latest.has(key))latest.set(key,row)}
  const files=[...latest.values()]
  if(!files.length)return {}
  const signed=[]
  for(let offset=0;offset<files.length;offset+=100){
    const {data,error:signError}=await supabase.storage.from('branch-manager-files').createSignedUrls(files.slice(offset,offset+100).map(row=>row.storage_path),3600)
    if(signError)throw signError
    signed.push(...data)
  }
  return Object.fromEntries(files.map((row,index)=>[`${row.branch_id}:${row.document_type}`,{...row,url:signed[index]?.signedUrl}]))
}
