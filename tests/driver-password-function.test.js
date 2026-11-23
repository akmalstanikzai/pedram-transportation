import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'
import { webcrypto } from 'node:crypto'

const driverId='00000000-0000-0000-0000-000000000011',userId='00000000-0000-0000-0000-000000000022',presidentId='00000000-0000-0000-0000-000000000033'
const source=await readFile(new URL('../supabase/functions/create-driver-account/index.ts',import.meta.url),'utf8')
const js=stripTypeScriptTypes(source).replace(/^import[^\n]*\n/m,'')
function setup(options={}) {
 const actor={role:'president',account_enabled:true,...options.actor}
 const driver={id:driverId,user_id:userId,branch_id:null,archived_at:null,...options.driver}
 const profile={id:userId,role:'driver',branch_id:null,username:'driver-one',account_enabled:false,...options.profile}
 let handler,storedPassword='Old-test-password42'
 const writes=[],vaultCalls=[]
 let sealed
 const authUser={id:userId,email:'driver@example.test',updated_at:'2026-11-23T08:35:12.374001Z'}
 const admin={from(table){const filters={};const query={select:()=>query,eq:(k,v)=>{filters[k]=v;return query},single:async()=>({data:table==='drivers'?(filters.id===driverId?driver:null):filters.id===presidentId?actor:filters.id===userId?profile:null,error:null})};return query},
 async rpc(name,args){
  vaultCalls.push({name,args})
  if(name==='store_driver_login_password'){
   if(options.storeFailed)return {error:{message:'STALE_RECORD'}}
   sealed={ciphertext:args.p_ciphertext,iv:args.p_iv}
   return {error:null}
  }
  if(name==='read_driver_login_password')return sealed ? {data:sealed} : {error:{message:'PASSWORD_NOT_VAULTED'}}
  if(options.create && name==='find_driver_account')return {data:null}
  if(options.create && name==='link_driver_account')return {data:userId,error:null}
  throw new Error('Unexpected driver RPC')
 },
 auth:{admin:{
  createUser:async attrs=>{
   if(!options.create)throw new Error('Must not create a replacement account')
   storedPassword=attrs.password
   return {data:{user:authUser}}
  },
  getUserById:async()=>({data:{user:authUser},error:null}),
  updateUserById:async(id,attrs)=>{writes.push({id,attrs});if(!options.authError)storedPassword=attrs.password;return{data:{user:authUser},error:options.authError||null}},
 }}}
 const caller={auth:{getUser:async()=>({data:{user:options.invalidToken?null:{id:presidentId}}})}}
 runInNewContext(js,{Request,Response,TextEncoder,TextDecoder,crypto:webcrypto,btoa,atob,Deno:{env:{get:k=>k==='SUPABASE_SERVICE_ROLE_KEY'?'service':'public'},serve:fn=>{handler=fn}},createClient:(_u,key)=>key==='service'?admin:caller})
 return{writes,profile,vaultCalls,accepts:password=>password===storedPassword,call:(body={},token='Bearer test',method='POST')=>handler(new Request('https://example.test',{method,headers:token?{Authorization:token}:{},...(method==='POST'?{body:JSON.stringify({driver_id:driverId,action:'password',password:'New-test-password42',...body})}:{})}))}
}
test('driver key updates only the linked Auth password, preserving disabled state and account identity',async()=>{
 const app=setup()
 assert.equal((await app.call({user_id:presidentId,email:'forged@example.test'})).status,200)
 assert.equal(app.writes[0].id,userId)
 assert.deepEqual(Object.keys(app.writes[0].attrs),['password'])
 assert.equal(app.accepts('Old-test-password42'),false)
 assert.equal(app.accepts('New-test-password42'),true)
 assert.equal(app.profile.account_enabled,false)
 const write=app.vaultCalls[0].args
 assert.equal(write.p_user,userId)
 assert.equal(write.p_driver,driverId)
 assert.equal(write.p_actor,presidentId)
 assert.equal(write.p_auth_updated_at,'2026-11-23T08:35:12.374001Z')
 assert.doesNotMatch(JSON.stringify(write),/New-test-password/)
 const read=await app.call({action:'vault'})
 assert.equal(read.headers.get('cache-control'),'no-store')
 assert.deepEqual(await read.json(),{password:'New-test-password42'})
})
test('details return the current sign-in name and work for email logins',async()=>{
 for(const [username,expected] of [['driver-one','driver-one'],[null,'driver@example.test']]){
  const app=setup({profile:{username}})
  assert.deepEqual(await(await app.call({action:'details'})).json(),{login:expected})
  assert.equal(app.writes.length,0)
 }
})
test('only an enabled President can manage driver credentials',async()=>{
 for(const options of [{actor:{role:'driver'}},{actor:{role:'branch_manager'}},{actor:{role:'vice_president'}},{actor:{account_enabled:false}},{invalidToken:true}]){
  const app=setup(options);assert.ok((await app.call()).status>=400);assert.ok((await app.call({action:'vault'})).status>=400);assert.equal(app.writes.length,0);assert.equal(app.vaultCalls.length,0)
 }
 const app=setup();assert.ok((await app.call({},null)).status>=400);assert.equal((await app.call({},null,'OPTIONS')).status,200)
})
test('unlinked, archived, forged and cross-branch targets are rejected',async()=>{
 for(const options of [{driver:{user_id:null}},{driver:{archived_at:'2026-11-03'}},{profile:{role:'president'}},{profile:{branch_id:driverId}},{driver:{user_id:presidentId}}]){
  const app=setup(options);assert.ok((await app.call()).status>=400);assert.equal(app.writes.length,0)
 }
 const app=setup();assert.ok((await app.call({driver_id:'invalid'})).status>=400);assert.equal(app.writes.length,0)
})
test('validation and provider errors do not report success',async()=>{
 const app=setup();assert.equal((await(await app.call({password:'short'})).json()).error,'PASSWORD_TOO_SHORT');assert.equal(app.writes.length,0)
 const weak=setup({authError:{code:'weak_password'}});assert.equal((await(await weak.call()).json()).error,'PASSWORD_REJECTED')
 const retry=setup({authError:{code:'same_password'}});assert.equal((await(await retry.call()).json()).error,'DRIVER_PASSWORD_UNCHANGED')
 const unknown=setup();assert.ok((await unknown.call({action:'delete'})).status>=400);assert.equal(unknown.writes.length,0)
})

test('older credentials and vault failures do not reveal an old password',async()=>{
 const app=setup({storeFailed:true})
 assert.equal((await(await app.call({action:'vault'})).json()).error,'PASSWORD_NOT_VAULTED')
 assert.equal((await(await app.call()).json()).error,'DRIVER_VAULT_WRITE_FAILED')
 assert.ok(app.accepts('New-test-password42'))
 assert.equal((await(await app.call({action:'vault'})).json()).error,'PASSWORD_NOT_VAULTED')
})

test('new driver accounts save the initial credential after linking',async()=>{
 const app=setup({create:true})
 const result=await app.call({action:undefined,login:'new-driver',request_id:'00000000-0000-0000-0000-000000000055'})
 assert.equal(result.status,200)
 assert.equal((await result.json()).vault_saved,true)
 assert.deepEqual(app.vaultCalls.map(call=>call.name),['find_driver_account','link_driver_account','store_driver_login_password'])
 assert.deepEqual(await(await app.call({action:'vault'})).json(),{password:'New-test-password42'})
})
