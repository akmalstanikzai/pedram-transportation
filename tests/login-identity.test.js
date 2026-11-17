import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { loginIdentity, normalizeLogin } from '../src/lib/loginIdentity.js'

test('legacy usernames and email addresses keep their existing Auth identities', async () => {
  for (const login of ['kabul-manager','manager.one','manager_1','123']) assert.equal((await loginIdentity(login)).email,`${login}@users.pedram.local`)
  assert.equal((await loginIdentity(' Manager@Example.com ')).email,'manager@example.com')
  assert.equal((await loginIdentity('KABUL-MANAGER')).email,(await loginIdentity('kabul-manager')).email)
})

test('Dari, spaces, symbols, numeric names and email-like usernames work consistently', async () => {
  const emails = new Set()
  for (const name of ['مدیر کابل','احمد ضیاء','Branch Manager 1','Kabul+Office!','name@office','user@@office','۱۲۳۴','🚌 Pedram','.manager','a..b','..@example.com','name@-example.com','a'.repeat(80)]) {
    const identity = await loginIdentity(name)
    assert.equal(identity.login,name)
    assert.match(identity.email,/^[a-f0-9]{64}@usernames\.pedram\.local$/)
    assert.ok(!emails.has(identity.email)); emails.add(identity.email)
    assert.equal((await loginIdentity(`  ${name}  `)).email,identity.email)
  }
  assert.equal((await loginIdentity('Branch Manager')).email,(await loginIdentity('branch manager')).email)
  assert.equal((await loginIdentity('Ｃａｂｕｌ')).email,(await loginIdentity('Cabul')).email)
  for (const invalid of ['', '   ', 'name\nnew', 'name\u202etest', 'a'.repeat(121), null]) assert.throws(() => normalizeLogin(invalid), /INVALID_LOGIN/)
})

test('frontend and standalone Edge Functions use exactly the same identity rules', async () => {
  const helper = (await readFile(new URL('../src/lib/loginIdentity.js',import.meta.url),'utf8')).replaceAll('export function','function').replaceAll('export async function','async function').trim()
  for (const name of ['manage-branch-account','create-branch-with-manager','create-driver-account']) {
    const source = await readFile(new URL(`../supabase/functions/${name}/index.ts`,import.meta.url),'utf8')
    assert.ok(source.includes(helper),`${name} identity rules drifted`)
  }
})
