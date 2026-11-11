import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'

for (const [name, kind] of [['create-branch-with-manager','branch'],['create-driver-account','driver']]) {
  test(`${name} is self-contained and starts without local imports`,async()=>{
    const source=await readFile(new URL(`../supabase/functions/${name}/index.ts`,import.meta.url),'utf8')
    const canonical=(await readFile(new URL('../supabase/functions/_shared/provision.ts',import.meta.url),'utf8')).trim().replace(/\r\n/g,'\n').replace('export async function provision','async function provision')
    assert.ok(source.replace(/\r\n/g,'\n').includes(canonical),'standalone logic must match canonical provisioning logic')
    assert.doesNotMatch(source,/^import\s.*from\s*['"]\.\.?\//m,'Dashboard file must not depend on a local helper')
    const js=stripTypeScriptTypes(source).replace(/^import[^\n]*\n/m,'')
    let handler
    runInNewContext(js,{Response,Request,Deno:{env:{get:()=>''},serve:fn=>{handler=fn}},createClient:()=>{throw new Error('Unexpected network dependency')}})
    assert.equal(typeof handler,'function')
    assert.ok(source.includes(`provision('${kind}',request)`))
    const preflight=await handler(new Request('https://example.test',{method:'OPTIONS'}))
    assert.equal(preflight.status,200)
    const denied=await handler(new Request('https://example.test',{method:'POST'}))
    assert.equal(denied.status,400)
    assert.equal((await denied.json()).error,'ACCESS_DENIED')
  })
}

test('branch creation forwards code, separate manager names and home address to the atomic save', async () => {
  const source = await readFile(new URL('../supabase/functions/create-branch-with-manager/index.ts', import.meta.url), 'utf8')
  const js = stripTypeScriptTypes(source).replace(/^import[^\n]*\n/m, '')
  let handler, saved
  const actor = '00000000-0000-0000-0000-000000000001'
  const managerId = '00000000-0000-0000-0000-000000000002'
  const caller = { auth: { async getUser() { return { data: { user: { id: actor } } } } } }
  const query = { select() { return this }, eq() { return this }, async single() { return { data: { role: 'president', account_enabled: true } } } }
  const admin = { from() { return query }, async rpc(name, args) {
    if (name === 'find_branch_provisioning_account') return { data: managerId }
    assert.equal(name, 'provision_branch')
    saved = args
    return { data: 'new-branch' }
  } }
  runInNewContext(js, { Response, Request, console, Deno: { env: { get: () => 'configured' }, serve: fn => { handler = fn } }, createClient: (_url, _key, options) => options.global ? caller : admin })
  const response = await handler(new Request('https://example.test', { method: 'POST', headers: { Authorization: 'Bearer example', 'Content-Type': 'application/json' }, body: JSON.stringify({
    request_id: '00000000-0000-0000-0000-000000000003', credentials: { login: 'new.manager', password: 'password123' },
    branch: { name: 'Branch', code: 'KBL-01', province: 'Kabul', city: 'District', address: 'Location' },
    manager: { full_name: 'Ahmad Ahmadi', first_name: 'Ahmad', surname: 'Ahmadi', phone: '0700000000', home_province: 'Bamyan', home_district: 'Yakawlang', home_village: 'Village' },
  }) }))
  assert.equal(response.status, 200)
  assert.equal(saved.p_actor, actor)
  assert.equal(saved.p_manager, managerId)
  assert.equal(saved.p_data.code, 'KBL-01')
  assert.equal(saved.p_data.manager_first_name, 'Ahmad')
  assert.equal(saved.p_data.manager_surname, 'Ahmadi')
  assert.equal(saved.p_data.home_province, 'Bamyan')
  assert.equal(saved.p_data.home_district, 'Yakawlang')
  assert.equal(saved.p_data.home_village, 'Village')
})
