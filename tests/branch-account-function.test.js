import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'

const branchId = '00000000-0000-0000-0000-000000000011'
const managerId = '00000000-0000-0000-0000-000000000022'
const presidentId = '00000000-0000-0000-0000-000000000033'
const source = await readFile(new URL('../supabase/functions/manage-branch-account/index.ts', import.meta.url), 'utf8')
const js = stripTypeScriptTypes(source).replace(/^import[^\n]*\n/m, '')

function setup(overrides = {}) {
  const actor = { role: 'president', account_enabled: true, ...overrides.actor }
  const branch = { id: branchId, manager_user_id: managerId, archived_at: null, ...overrides.branch }
  const manager = { id: managerId, role: 'branch_manager', branch_id: branchId, username: 'kabul-manager', ...overrides.manager }
  const writes = []
  const reads = []
  let handler
  const admin = {
    from(table) {
      const filters = {}
      const query = { select: () => query, eq: (key, value) => { filters[key] = value; return query }, single: async () => {
        reads.push({ table, filters })
        const data = table === 'branches' ? (filters.id === branchId ? branch : null) : filters.id === presidentId ? actor : filters.id === managerId ? manager : null
        return { data, error: null }
      } }
      return query
    },
    auth: { admin: {
      getUserById: async id => { reads.push({ authUser: id }); return { data: { user: { email: 'manager@example.test' } }, error: null } },
      updateUserById: async (id, attributes) => { writes.push({ id, attributes }); return { error: overrides.updateError || null } },
    } },
  }
  const caller = { auth: { getUser: async () => ({ data: { user: overrides.invalidToken ? null : { id: presidentId } }, error: null }) } }
  runInNewContext(js, { Request, Response, Deno: { env: { get: key => key === 'SUPABASE_SERVICE_ROLE_KEY' ? 'service' : 'public' }, serve: fn => { handler = fn } }, createClient: (_url, key) => key === 'service' ? admin : caller })
  return { writes, reads, invoke: (body, token = 'Bearer test', method = 'POST') => handler(new Request('https://example.test', { method, headers: token ? { Authorization: token } : {}, ...(method === 'POST' ? { body: JSON.stringify({ branch_id: branchId, action: 'password', password: 'New-password-42', ...body }) } : {}) })) }
}

test('standalone branch account function supports preflight and rejects missing/invalid auth and other roles', async () => {
  assert.doesNotMatch(source, /^import\s.*from\s*['"]\.\.?\//m)
  const plain = setup()
  assert.equal((await plain.invoke({}, null, 'OPTIONS')).status, 200)
  assert.equal((await plain.invoke({}, null, 'GET')).status, 405)
  assert.equal((await plain.invoke({}, null)).status, 401)
  for (const overrides of [{ invalidToken: true }, { actor: { role: 'driver' } }, { actor: { role: 'branch_manager' } }, { actor: { role: 'vice_president' } }, { actor: { account_enabled: false } }]) {
    const app = setup(overrides)
    assert.ok((await app.invoke()).status >= 400)
    assert.equal(app.writes.length, 0)
    assert.ok(!app.reads.some(r => r.table === 'branches'), 'unauthorized caller cannot inspect branch accounts')
  }
})

test('password update targets only the registered manager and returns no credentials', async () => {
  const app = setup()
  const response = await app.invoke({ user_id: presidentId, email: 'forged@example.test' })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { success: true })
  assert.equal(app.writes.length, 1)
  assert.equal(app.writes[0].id, managerId)
  assert.equal(app.writes[0].attributes.password, 'New-password-42')
  assert.deepEqual(Object.keys(app.writes[0].attributes), ['password'], 'no role, email, enable or branch changes')
})

test('login details support both username and email accounts without writing Auth', async () => {
  for (const [username, expected] of [['kabul-manager', 'kabul-manager'], [null, 'manager@example.test']]) {
    const app = setup({ manager: { username } })
    assert.deepEqual(await (await app.invoke({ action: 'details' })).json(), { login: expected })
    assert.equal(app.writes.length, 0)
  }
})

test('archived/missing branches, missing managers and wrong-role/cross-branch managers cannot be changed', async () => {
  for (const overrides of [{ branch: { archived_at: '2026-11-02' } }, { branch: { manager_user_id: null } }, { branch: { manager_user_id: presidentId } }, { manager: { role: 'president' } }, { manager: { branch_id: null } }]) {
    const app = setup(overrides)
    assert.ok((await app.invoke()).status >= 400)
    assert.equal(app.writes.length, 0)
  }
  const app = setup()
  assert.ok((await app.invoke({ branch_id: '00000000-0000-0000-0000-000000000099' })).status >= 400)
  assert.equal(app.writes.length, 0)
})

test('password validation, provider rejection and harmless retries have safe responses', async () => {
  for (const body of [{ password: 'short' }, { password: null }, { branch_id: 'invalid' }, { action: 'delete' }]) {
    const app = setup()
    assert.equal((await app.invoke(body)).status, 400)
    assert.equal(app.writes.length, 0)
  }
  const weak = setup({ updateError: { code: 'weak_password', message: 'Provider details' } })
  assert.deepEqual(await (await weak.invoke()).json(), { error: 'PASSWORD_REJECTED' })
  const repeated = setup({ updateError: { code: 'same_password' } })
  assert.deepEqual(await (await repeated.invoke()).json(), { success: true })
})
