import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'

const driverId='00000000-0000-0000-0000-000000000011',userId='00000000-0000-0000-0000-000000000022',presidentId='00000000-0000-0000-0000-000000000033'
const source=await readFile(new URL('../supabase/functions/create-driver-account/index.ts',import.meta.url),'utf8')
const js=stripTypeScriptTypes(source).replace(/^import[^\n]*\n/m,'')
function setup(options={}) {
 const actor={role:'president',account_enabled:true,...options.actor}
 const driver={id:driverId,user_id:userId,branch_id:null,archived_at:null,...options.driver}
 const profile={id:userId,role:'driver',branch_id:null,username:'driver-one',account_enabled:false,...options.profile}
 let handler,storedPassword='Old-test-password42'
 const writes=[]
 const admin={from(table){const filters={};const query={select:()=>query,eq:(k,v)=>{filters[k]=v;return query},single:async()=>({data:table==='drivers'?(filters.id===driverId?driver:null):filters.id===presidentId?actor:filters.id===userId?profile:null,error:null})};return query},rpc(){throw new Error('Management must not provision/link an account')},auth:{admin:{
  createUser(){throw new Error('Must not create a replacement account')},
  getUserById:async()=>({data:{user:{email:'driver@example.test'}},error:null}),
  updateUserById:async(id,attrs)=>{writes.push({id,attrs});if(!options.authError)storedPassword=attrs.password;return{error:options.authError||null}},
 }}}
 const caller={auth:{getUser:async()=>({data:{user:options.invalidToken?null:{id:presidentId}}})}}
 runInNewContext(js,{Request,Response,Deno:{env:{get:k=>k==='SUPABASE_SERVICE_ROLE_KEY'?'service':'public'},serve:fn=>{handler=fn}},createClient:(_u,key)=>key==='service'?admin:caller})
 return{writes,profile,accepts:password=>password===storedPassword,call:(body={},token='Bearer test',method='POST')=>handler(new Request('https://example.test',{method,headers:token?{Authorization:token}:{},...(method==='POST'?{body:JSON.stringify({driver_id:driverId,action:'password',password:'New-test-password42',...body})}:{})}))}
}
test('driver key updates only the linked Auth password, preserving disabled state and account identity',async()=>{
 const app=setup()
 assert.equal((await app.call({user_id:presidentId,email:'forged@example.test'})).status,200)
 assert.equal(app.writes[0].id,userId)
 assert.deepEqual(Object.keys(app.writes[0].attrs),['password'])
 assert.equal(app.accepts('Old-test-password42'),false)
 assert.equal(app.accepts('New-test-password42'),true)
 assert.equal(app.profile.account_enabled,false)
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
  const app=setup(options);assert.ok((await app.call()).status>=400);assert.equal(app.writes.length,0)
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
 const retry=setup({authError:{code:'same_password'}});assert.deepEqual(await(await retry.call()).json(),{success:true})
 const unknown=setup();assert.ok((await unknown.call({action:'delete'})).status>=400);assert.equal(unknown.writes.length,0)
})
