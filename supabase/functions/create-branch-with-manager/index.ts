// Standalone Dashboard deployment: paste this entire file into index.ts.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// Shared with the standalone Edge Functions; keep copies identical (tested).
function normalizeLogin(value) {
  if (typeof value !== 'string') throw new Error('INVALID_LOGIN')
  const login = value.normalize('NFKC').trim()
  const invisibleControl = [...login].some(char => { const code = char.codePointAt(0); return code < 32 || code >= 127 && code <= 159 || code >= 8234 && code <= 8238 || code >= 8294 && code <= 8297 })
  if (!login || [...login].length > 120 || invisibleControl) throw new Error('INVALID_LOGIN')
  return login
}

async function loginIdentity(value) {
  const login = normalizeLogin(value), key = login.toLowerCase()
  // Preserve existing email sign-ins and the original ASCII username format.
  const [local,domain,...extra] = key.split('@')
  const atom = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+$/i
  const email = !extra.length && local?.length <= 64 && local.split('.').every(part => atom.test(part)) && domain?.includes('.') && domain.split('.').every(part => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(part))
  if (email) return {login, email:key, username:null}
  if (key.length <= 64 && /^[a-z0-9_-]+(?:\.[a-z0-9_-]+)*$/.test(key)) return {login, email:`${key}@users.pedram.local`, username:login}
  // Names, spaces and symbols are encoded into an email accepted by Auth.
  const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key))
  const hash = Array.from(new Uint8Array(digest),byte => byte.toString(16).padStart(2,'0')).join('')
  return {login, email:`${hash}@usernames.pedram.local`, username:login}
}

const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type','Content-Type':'application/json','Cache-Control':'no-store'}

async function driverVaultKey() {
 const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
 const url = Deno.env.get('SUPABASE_URL')
 if (!service || !url) throw new Error('VAULT_KEY_MISSING')
 const material = new TextEncoder().encode(`pedram-driver-password-v1\0${url}\0${service}`)
 const digest = await crypto.subtle.digest('SHA-256', material)
 return crypto.subtle.importKey('raw', digest, {name:'AES-GCM'}, false, ['encrypt','decrypt'])
}

async function sealDriverPassword(password: string, driver: string) {
 const iv = crypto.getRandomValues(new Uint8Array(12))
 const encrypted = await crypto.subtle.encrypt(
  {name:'AES-GCM',iv,additionalData:new TextEncoder().encode(driver)},
  await driverVaultKey(), new TextEncoder().encode(password)
 )
 return {ciphertext:btoa(String.fromCharCode(...new Uint8Array(encrypted))),iv:btoa(String.fromCharCode(...iv))}
}

async function openDriverPassword(sealed: {ciphertext:string, iv:string}, driver: string) {
 const bytes = (value: string) => Uint8Array.from(atob(value), char => char.charCodeAt(0))
 const decrypted = await crypto.subtle.decrypt(
  {name:'AES-GCM',iv:bytes(sealed.iv),additionalData:new TextEncoder().encode(driver)},
  await driverVaultKey(), bytes(sealed.ciphertext)
 )
 return new TextDecoder().decode(decrypted)
}

async function storeDriverPassword(admin: ReturnType<typeof createClient>, actor: string, driver: string,
 account: {id:string, updated_at?:string}, sealed: {ciphertext:string,iv:string}) {
 if (!account.updated_at) return false
 const {error} = await admin.rpc('store_driver_login_password', {
  p_actor:actor, p_driver:driver, p_user:account.id, p_auth_updated_at:account.updated_at,
  p_ciphertext:sealed.ciphertext, p_iv:sealed.iv,
 })
 return !error
}

async function provision(kind:'branch'|'driver',request:Request){
 if(request.method==='OPTIONS')return new Response('ok',{headers})
 if(request.method!=='POST')return new Response(JSON.stringify({error:'METHOD_NOT_ALLOWED'}),{status:405,headers})
 let stage='authenticate'
 try{
  const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_ANON_KEY')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const token=request.headers.get('Authorization');if(!token)throw new Error('ACCESS_DENIED')
  const caller=createClient(url,key,{global:{headers:{Authorization:token}}})
  const admin=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}})
  const {data:{user}}=await caller.auth.getUser();if(!user)throw new Error('ACCESS_DENIED')
  const {data:actor}=await admin.from('profiles').select('role,account_enabled').eq('id',user.id).single()
  if(actor?.role!=='president'||!actor.account_enabled)throw new Error('ACCESS_DENIED')
  const body=await request.json(),id=body.request_id
  // Manage only the Auth account already linked to the selected Fleet driver.
  if(kind==='driver'&&body.action!==undefined){
   if(!['details','password','vault'].includes(body.action)||typeof body.driver_id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.driver_id))throw new Error('REQUIRED_FIELDS')
   stage='driver_login'
   const {data:driver,error:driverError}=await admin.from('drivers').select('id,user_id,branch_id,archived_at').eq('id',body.driver_id).single()
   if(driverError||!driver||driver.archived_at)throw new Error('DRIVER_UNAVAILABLE')
   if(!driver.user_id)throw new Error('ACCOUNT_MISSING')
   const {data:profile,error:profileError}=await admin.from('profiles').select('id,role,branch_id,username').eq('id',driver.user_id).single()
   if(profileError||profile?.role!=='driver'||profile.branch_id!==driver.branch_id||profile.id===user.id)throw new Error('ACCESS_DENIED')
   if(body.action==='details'){
    const {data,error}=await admin.auth.admin.getUserById(profile.id)
    if(error||!data.user)throw new Error('ACCOUNT_MISSING')
    return new Response(JSON.stringify({login:profile.username||data.user.email||''}),{headers})
   }
   if(body.action==='vault'){
    const {data:sealed,error}=await admin.rpc('read_driver_login_password',{p_actor:user.id,p_driver:driver.id,p_user:profile.id})
    if(error||!sealed){
     const code=['PASSWORD_NOT_VAULTED','ACCESS_DENIED'].includes(error?.message) ? error.message : 'DRIVER_VAULT_UNAVAILABLE'
     throw new Error(code)
    }
    let savedPassword
    try{savedPassword=await openDriverPassword(sealed,driver.id)}
    catch{throw new Error('VAULT_LEGACY_UNREADABLE')}
    return new Response(JSON.stringify({password:savedPassword}),{headers})
   }
   if(typeof body.password!=='string'||body.password.length<8)throw new Error('PASSWORD_TOO_SHORT')
   const sealed=await sealDriverPassword(body.password,driver.id)
   const {data,error}=await admin.auth.admin.updateUserById(profile.id,{password:body.password})
   if(error?.code==='same_password')throw new Error('DRIVER_PASSWORD_UNCHANGED')
   if(error)throw new Error('PASSWORD_REJECTED')
   if(!data.user||!await storeDriverPassword(admin,user.id,driver.id,data.user,sealed))throw new Error('DRIVER_VAULT_WRITE_FAILED')
   return new Response(JSON.stringify({success:true,vault_saved:true}),{headers})
  }
  if(typeof id!=='string'||!/^[0-9a-f-]{36}$/i.test(id))throw new Error('REQUEST_CONFLICT')
  const credentials=kind==='branch'?body.credentials:body
  const {email,username}=await loginIdentity(credentials?.login),password=credentials?.password
  if(typeof password!=='string'||password.length<8)throw new Error('PASSWORD_TOO_SHORT')
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
  stage='find_account'
  const found=await admin.rpc(lookupName,lookup);if(found.error)throw found.error
  let account=found.data
  let newDriverAuth: {id:string,updated_at?:string} | null = null
  const sealed=kind==='driver'&&!account ? await sealDriverPassword(password,body.driver_id) : null
  if(!account){
   stage='create_account'
   const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:fullName},app_metadata:metadata})
   if(created.error){const recovered=await admin.rpc(lookupName,lookup);if(recovered.error||!recovered.data)throw created.error;account=recovered.data}
   else {
    account=created.data.user.id
    if(kind==='driver')newDriverAuth=created.data.user
   }
  }
  if(kind==='driver'){
   const {data,error}=await admin.rpc('link_driver_account',{p_actor:user.id,p_driver:body.driver_id,p_user:account,p_request:id,p_username:username});if(error)throw error
   const vault_saved = newDriverAuth && sealed ? await storeDriverPassword(admin,user.id,body.driver_id,newDriverAuth,sealed) : null
   return new Response(JSON.stringify({user_id:data,username,email,vault_saved}),{headers})
  }
  const manager=body.manager,branch=body.branch
  stage='save_branch'
  const {data,error}=await admin.rpc('provision_branch',{p_actor:user.id,p_request:id,p_manager:account,p_username:username,p_data:{name:branch.name,code:branch.code,province:branch.province,city:branch.city,address:branch.address,phone:branch.phone,manager_name:manager.full_name,manager_first_name:manager.first_name,manager_surname:manager.surname,home_province:manager.home_province,home_district:manager.home_district,home_village:manager.home_village,manager_phone:manager.phone,father_name:manager.father_name,national_id:manager.national_id,manager_address:manager.address}})
  if(error)throw error
  return new Response(JSON.stringify({branch_id:data,username,email}),{headers})
 }catch(error){const message=error instanceof Error?error.message:(error as {message?:string})?.message||'Unable to create account';console.error('Account action failed',{kind,stage,code:(error as {code?:string})?.code||''});return new Response(JSON.stringify({error:message,stage}),{status:400,headers})}
}

Deno.serve(request=>provision('branch',request))
