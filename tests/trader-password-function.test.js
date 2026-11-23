import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'
import { webcrypto } from 'node:crypto'

const actorId='00000000-0000-0000-0000-000000000001'
const traderId='00000000-0000-0000-0000-000000000002'
const accountId='00000000-0000-0000-0000-000000000003'
const requestId='00000000-0000-0000-0000-000000000004'
const source=await readFile(new URL('../supabase/functions/manage-trader-account/index.ts',import.meta.url),'utf8')
const script=stripTypeScriptTypes(source).replace(/^import[^\n]*\n/m,'')
const password='Sample-test-credential123'

function setup(options={}) {
  const actor={role:'president',account_enabled:true,...options.actor}
  const profile={id:accountId,role:'trader',username:'trader-one',account_enabled:false,...options.profile}
  const trader={id:traderId,full_name:'Trader One',user_id:accountId,...options.trader}
  const currentUser={id:accountId,email:'trader-one@users.pedram.local',updated_at:'2026-11-23T09:00:00.123456Z', app_metadata:{}}
  const writes=[], operations=[]
  let handler, sealed
  const caller={auth:{getUser:async()=>({data:{user:options.invalidToken?null:{id:actorId}}})}}
  const admin={
    from(table){
      let id
      const query={select:()=>query,eq:(_key,value)=>{id=value;return query},
        single:async()=>({data:table==='traders'&&id===traderId?trader:id===actorId?actor:id===accountId?profile:null})}
      return query
    },
    async rpc(name,args){
      if(name==='find_trader_account')return {data:null}
      if(name==='link_trader_account'){trader.user_id=accountId;return {data:accountId}}
      assert.equal(name,'trader_login_password')
      operations.push(args)
      if(args.p_operation==='status')return options.missingMigration?{error:{message:'RPC missing'}}:{data:{saved:!!sealed}}
      if(args.p_operation==='store'){
        if(options.storeError)return {error:{message:'STALE_RECORD'}}
        assert.equal(args.p_iv,currentUser.app_metadata.pedram_trader_password_iv)
        sealed={ciphertext:args.p_ciphertext,iv:args.p_iv}
        return {data:{saved:true}}
      }
      return sealed?{data:sealed}:{error:{message:'PASSWORD_NOT_VAULTED'}}
    },
    auth:{admin:{
      getUserById:async()=>({data:{user:currentUser}}),
      async updateUserById(id, fields){
        writes.push({id,fields})
        if(options.authError)return {error:options.authError}
        currentUser.app_metadata={...currentUser.app_metadata,...fields.app_metadata}
        return {data:{user:currentUser}}
      },
      async createUser(fields){
        currentUser.email=fields.email
        currentUser.app_metadata=fields.app_metadata
        return {data:{user:currentUser}}
      },
    }},
  }
  runInNewContext(script,{Request,Response,TextEncoder,TextDecoder,crypto:webcrypto,btoa,atob,
    Deno:{env:{get:key=>key==='SUPABASE_SERVICE_ROLE_KEY'?'service':'configured'},serve:fn=>{handler=fn}},
    createClient:(_url,key)=>key==='service'?admin:caller})
  return {writes,operations,call:(action,extra={},method='POST',authorized=true)=>handler(new Request('https://example.test',{method,
    headers:authorized?{Authorization:'Bearer test'}:{},
    ...(method==='POST'?{body:JSON.stringify({action,trader_id:traderId,...extra})}:{})}))}
}

test('trader password updates the linked user and reveals only the verified vault copy',async()=>{
  const app=setup()
  assert.deepEqual(await (await app.call('details')).json(),{login:'trader-one',enabled:false})
  assert.equal((await (await app.call('vault')).json()).error,'TRADER_PASSWORD_NOT_VAULTED')
  assert.deepEqual(await (await app.call('password',{password,user_id:actorId})).json(),{success:true,vault_saved:true})
  assert.equal(app.writes[0].id,accountId)
  assert.doesNotMatch(JSON.stringify(app.operations),new RegExp(password))
  const reveal=await app.call('vault')
  assert.equal(reveal.headers.get('Cache-Control'),'no-store')
  assert.deepEqual(await reveal.json(),{password,verified:true})
})

test('other roles, retired accounts, and invalid targets cannot read any saved password',async()=>{
  for (const details of [{actor:{role:'trader'}},{actor:{account_enabled:false}},{invalidToken:true},{profile:{role:'president'}},{trader:{archived_at:'2026-11-23'}}]){
    const app=setup(details)
    assert.ok((await app.call('vault')).status>=400)
    assert.equal(app.operations.length,0)
  }
  const app=setup()
  assert.equal((await app.call('vault',{},'GET')).status,405)
  assert.equal((await app.call('vault',{},'POST',false)).status,401)
})

test('a missing migration is diagnosed before Auth changes and failed writes remain visible as errors',async()=>{
  const missing=setup({missingMigration:true})
  assert.equal((await (await missing.call('password',{password})).json()).error,'TRADER_VAULT_UNAVAILABLE')
  assert.equal(missing.writes.length,0)
  const failed=setup({storeError:true})
  assert.equal((await (await failed.call('password',{password})).json()).error,'VAULT_WRITE_FAILED')
  const same=setup({authError:{code:'same_password'}})
  assert.equal((await (await same.call('password',{password})).json()).error,'TRADER_PASSWORD_UNCHANGED')
})

test('creating a login saves the initial password and a creation replay leaves newer credentials intact',async()=>{
  const app=setup({trader:{user_id:null}})
  const payload={login:'trader-one',request_id:requestId,password}
  assert.deepEqual(await (await app.call('create',payload)).json(),{user_id:accountId,login:payload.login,vault_saved:true})
  const newer='Newer-sample-test-credential456'
  await app.call('password',{password:newer})
  assert.equal((await (await app.call('create',payload)).json()).vault_saved,true)
  assert.equal((await (await app.call('vault')).json()).password,newer)
})
