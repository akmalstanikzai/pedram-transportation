// Standalone Dashboard deployment: paste this entire file into index.ts.
// Keep provisioning logic in sync with ../_shared/provision.ts (checked by tests).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type','Content-Type':'application/json'}
async function provision(kind:'branch'|'driver',request:Request){
 if(request.method==='OPTIONS')return new Response('ok',{headers})
 try{
  const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_ANON_KEY')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const token=request.headers.get('Authorization');if(!token)throw new Error('ACCESS_DENIED')
  const caller=createClient(url,key,{global:{headers:{Authorization:token}}})
  const admin=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}})
  const {data:{user}}=await caller.auth.getUser();if(!user)throw new Error('ACCESS_DENIED')
  const {data:actor}=await admin.from('profiles').select('role,account_enabled').eq('id',user.id).single()
  if(actor?.role!=='president'||!actor.account_enabled)throw new Error('ACCESS_DENIED')
  const body=await request.json(),id=body.request_id
  if(typeof id!=='string'||!/^[0-9a-f-]{36}$/i.test(id))throw new Error('REQUEST_CONFLICT')
  const credentials=kind==='branch'?body.credentials:body
  const login=String(credentials?.login||'').trim().toLowerCase(),password=credentials?.password
  if(!login||typeof password!=='string'||password.length<8)throw new Error('REQUIRED_FIELDS')
  const isEmail=login.includes('@');if(!isEmail&&!/^[a-z0-9._-]+$/.test(login))throw new Error('REQUIRED_FIELDS')
  const email=isEmail?login:`${login}@users.pedram.local`,username=isEmail?null:login
  let fullName='',metadata:Record<string,string>,lookupName:string,lookup:Record<string,string>
  if(kind==='branch'){
   if(!body.branch?.name?.trim()||!body.branch?.province?.trim()||!body.branch?.city?.trim()||!body.manager?.full_name?.trim()||!body.manager?.phone?.trim())throw new Error('REQUIRED_FIELDS')
   fullName=body.manager.full_name.trim();metadata={pedram_provisioning_request:id,pedram_provisioning_actor:user.id}
   lookupName='find_branch_provisioning_account';lookup={p_actor:user.id,p_request:id,p_email:email}
  }else{
   const {data:driver,error}=await admin.from('drivers').select('id,full_name,archived_at,status').eq('id',body.driver_id).single()
   if(error||!driver||driver.archived_at||driver.status==='inactive')throw new Error('RESOURCE_UNAVAILABLE')
   fullName=driver.full_name;metadata={pedram_driver_request:id,pedram_driver_actor:user.id,pedram_driver_id:driver.id}
   lookupName='find_driver_account';lookup={p_actor:user.id,p_driver:driver.id,p_request:id,p_email:email}
  }
  const found=await admin.rpc(lookupName,lookup);if(found.error)throw found.error
  let account=found.data
  if(!account){
   const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:fullName},app_metadata:metadata})
   if(created.error){const recovered=await admin.rpc(lookupName,lookup);if(recovered.error||!recovered.data)throw created.error;account=recovered.data}else account=created.data.user.id
  }
  if(kind==='driver'){
   const {data,error}=await admin.rpc('link_driver_account',{p_actor:user.id,p_driver:body.driver_id,p_user:account,p_request:id,p_username:username});if(error)throw error
   return new Response(JSON.stringify({user_id:data,username,email}),{headers})
  }
  const manager=body.manager,branch=body.branch
  const {data,error}=await admin.rpc('provision_branch',{p_actor:user.id,p_request:id,p_manager:account,p_username:username,p_data:{name:branch.name,province:branch.province,city:branch.city,address:branch.address,phone:branch.phone,manager_name:manager.full_name,manager_phone:manager.phone,father_name:manager.father_name,national_id:manager.national_id,manager_address:manager.address}})
  if(error)throw error
  return new Response(JSON.stringify({branch_id:data,username,email}),{headers})
 }catch(error){const message=error instanceof Error?error.message:(error as {message?:string})?.message||'Unable to create account';return new Response(JSON.stringify({error:message}),{status:400,headers})}
}
Deno.serve(request=>provision('driver',request))
