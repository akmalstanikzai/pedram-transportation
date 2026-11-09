import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type','Content-Type':'application/json'}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const base64=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes))
const fromBase64=(value:string)=>Uint8Array.from(atob(value),char=>char.charCodeAt(0))
async function vaultKey(){
 const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),url=Deno.env.get('SUPABASE_URL')
 if(!service||!url)throw new Error('VAULT_KEY_MISSING')
 const material=new TextEncoder().encode(`pedram-trader-password-v1\0${url}\0${service}`)
 const raw=await crypto.subtle.digest('SHA-256',material)
 return crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['encrypt','decrypt'])
}
async function seal(password:string,traderId:string){
 const iv=crypto.getRandomValues(new Uint8Array(12))
 const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(traderId)},await vaultKey(),new TextEncoder().encode(password))
 return {ciphertext:base64(new Uint8Array(encrypted)),iv:base64(iv)}
}
async function open(ciphertext:string,iv:string,traderId:string){
 const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromBase64(iv),additionalData:new TextEncoder().encode(traderId)},await vaultKey(),fromBase64(ciphertext))
 return new TextDecoder().decode(plain)
}

Deno.serve(async request=>{
 if(request.method==='OPTIONS')return new Response('ok',{headers})
 try{
  const token=request.headers.get('Authorization')
  if(!token)throw new Error('ACCESS_DENIED')
  const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const caller=createClient(url,anon,{global:{headers:{Authorization:token}}})
  const admin=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}})
  const {data:{user},error:userError}=await caller.auth.getUser()
  if(userError||!user)throw new Error('ACCESS_DENIED')
  const {data:actor}=await admin.from('profiles').select('role,account_enabled').eq('id',user.id).single()
  if(actor?.role!=='president'||!actor.account_enabled)throw new Error('ACCESS_DENIED')
  const body=await request.json()
  if(typeof body.trader_id!=='string'||!uuid.test(body.trader_id))throw new Error('REQUIRED_FIELDS')
  const {data:trader,error:traderError}=await admin.from('traders').select('id,full_name,phone,archived_at,user_id').eq('id',body.trader_id).single()
  if(traderError||!trader||trader.archived_at)throw new Error('RESOURCE_UNAVAILABLE')
  async function storePassword(password:string){
   const encrypted=await seal(password,trader.id)
   const {error}=await admin.from('trader_password_vault').upsert({trader_id:trader.id,...encrypted,updated_by:user!.id,updated_at:new Date().toISOString()})
   if(error)throw new Error('VAULT_WRITE_FAILED')
   const {error:auditError}=await admin.from('trader_password_vault_audit').insert({trader_id:trader.id,actor_id:user!.id,action:'stored'})
   if(auditError)throw new Error('VAULT_AUDIT_FAILED')
  }
  if(body.action==='details'||body.action==='password'||body.action==='vault'){
   if(!trader.user_id)throw new Error('ACCOUNT_MISSING')
   const {data:profile}=await admin.from('profiles').select('id,role,username,account_enabled').eq('id',trader.user_id).single()
   if(profile?.role!=='trader')throw new Error('ACCESS_DENIED')
   if(body.action==='details'){
    const {data,error}=await admin.auth.admin.getUserById(profile.id)
    if(error||!data.user)throw new Error('ACCOUNT_MISSING')
    return new Response(JSON.stringify({login:profile.username||data.user.email||'',enabled:profile.account_enabled}),{headers})
   }
   if(body.action==='vault'){
    const {data:vault,error:vaultError}=await admin.from('trader_password_vault').select('ciphertext,iv').eq('trader_id',trader.id).single()
    if(vaultError||!vault)throw new Error('PASSWORD_NOT_VAULTED')
    let stored:string
    try{stored=await open(vault.ciphertext,vault.iv,trader.id)}catch{throw new Error('VAULT_LEGACY_UNREADABLE')}
    const {error:auditError}=await admin.from('trader_password_vault_audit').insert({trader_id:trader.id,actor_id:user.id,action:'viewed'})
    if(auditError)throw new Error('VAULT_AUDIT_FAILED')
    return new Response(JSON.stringify({password:stored}),{headers:{...headers,'Cache-Control':'no-store'}})
   }
   if(typeof body.password!=='string'||body.password.length<8)throw new Error('PASSWORD_TOO_SHORT')
   const {error}=await admin.auth.admin.updateUserById(profile.id,{password:body.password})
   if(error&&error.code!=='same_password')throw new Error('PASSWORD_REJECTED')
   await storePassword(body.password)
   return new Response(JSON.stringify({success:true}),{headers})
  }
  if(body.action!=='create')throw new Error('REQUIRED_FIELDS')
  const id=body.request_id,login=String(body.login||'').trim().toLowerCase(),password=body.password
  if(typeof id!=='string'||!uuid.test(id))throw new Error('REQUEST_CONFLICT')
  if(!login||typeof password!=='string'||password.length<8)throw new Error('REQUIRED_FIELDS')
  const isEmail=login.includes('@')
  if(isEmail?!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(login):!/^[a-z0-9._-]+$/.test(login))throw new Error('INVALID_LOGIN')
  const email=isEmail?login:`${login}@users.pedram.local`,username=isEmail?null:login
  if(trader.user_id){
   const {data:existing}=await admin.auth.admin.getUserById(trader.user_id)
   if(existing.user?.app_metadata?.pedram_trader_request===id&&existing.user?.app_metadata?.pedram_trader_actor===user.id&&existing.user?.email===email){await storePassword(password);return new Response(JSON.stringify({user_id:trader.user_id,login:username||email}),{headers})}
   throw new Error('ACCOUNT_ALREADY_LINKED')
  }
  const lookup={p_actor:user.id,p_trader:trader.id,p_request:id,p_email:email}
  const found=await admin.rpc('find_trader_account',lookup)
  if(found.error)throw found.error
  let account=found.data
  if(!account){
   const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:trader.full_name},app_metadata:{pedram_trader_request:id,pedram_trader_actor:user.id,pedram_trader_id:trader.id}})
   if(created.error){const recovered=await admin.rpc('find_trader_account',lookup);if(recovered.error||!recovered.data)throw created.error;account=recovered.data}else account=created.data.user.id
  }
  const {data,error}=await admin.rpc('link_trader_account',{p_actor:user.id,p_trader:trader.id,p_user:account,p_request:id,p_username:username})
  if(error)throw error
  await storePassword(password)
  return new Response(JSON.stringify({user_id:data,login:username||email}),{headers})
 }catch(error){const message=error instanceof Error?error.message:'Unable to manage trader account';console.error('trader account failed',{message});return new Response(JSON.stringify({error:message}),{status:400,headers})}
})
