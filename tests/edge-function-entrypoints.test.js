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
