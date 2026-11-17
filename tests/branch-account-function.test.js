import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'
import { webcrypto } from 'node:crypto'
import { loginIdentity } from '../src/lib/loginIdentity.js'

const branchId = '00000000-0000-0000-0000-000000000011'
const managerId = '00000000-0000-0000-0000-000000000022'
const presidentId = '00000000-0000-0000-0000-000000000033'
const source = await readFile(new URL('../supabase/functions/manage-branch-account/index.ts', import.meta.url), 'utf8')
const js = stripTypeScriptTypes(source).replace(/^import[^\n]*\n/m, '')

function setup(overrides = {}) {
  const actor = { role: 'president', account_enabled: true, ...overrides.actor }
  const branch = { id: branchId, manager_user_id: managerId, archived_at: null, ...overrides.branch }
  const manager = { id: managerId, role: 'branch_manager', branch_id: branchId, username: 'kabul-manager', ...overrides.manager }
  const authUser = {email:manager.username ? `${manager.username}@users.pedram.local` : 'manager@example.test',app_metadata:{provider:'email'},...overrides.authUser}
  const writes = []
  const vaultWrites = []
  const reads = []
  let handler
  const admin = {
    from(table) {
      const filters = {}
      let update
      const query = { select: () => query, update: value => { update = value; return query }, eq: (key, value) => { filters[key] = value; return query }, upsert: async value => { vaultWrites.push({ table, value }); return { error: overrides.vaultError || null } }, insert: async value => { vaultWrites.push({ table, value }); return { error: null } }, single: async () => {
        reads.push({ table, filters })
        if (update) {
          if (overrides.profileError) return {data:null,error:overrides.profileError}
          Object.assign(manager,update)
          return {data:{id:manager.id},error:null}
        }
        if (table === 'branch_password_vault') return {data:overrides.storedVault || vaultWrites.filter(row => row.table === table).at(-1)?.value || null,error:null}
        const data = table === 'branches' ? (filters.id === branchId ? branch : null) : filters.id === presidentId ? actor : filters.id === managerId ? manager : null
        return { data, error: null }
      } }
      return query
    },
    auth: { admin: {
      getUserById: async id => { reads.push({ authUser: id }); return { data: { user: {...authUser} }, error: null } },
      updateUserById: async (id, attributes) => {
        writes.push({ id, attributes })
        const error = overrides.updateError?.code === 'same_password' && !attributes.password ? null : overrides.updateError || (overrides.rollbackError && writes.length > 1 ? overrides.rollbackError : null)
        if (!error) Object.assign(authUser,attributes)
        return {error}
      },
    } },
  }
  const caller = { auth: { getUser: async () => ({ data: { user: overrides.invalidToken ? null : { id: presidentId } }, error: null }) } }
  const vaultKey = Buffer.alloc(32, 7).toString('base64')
  runInNewContext(js, { Request, Response, TextEncoder, TextDecoder, Uint8Array, atob, btoa, crypto: webcrypto, Deno: { env: { get: key => key === 'SUPABASE_SERVICE_ROLE_KEY' ? 'service' : key === 'BRANCH_PASSWORD_VAULT_KEY' ? vaultKey : 'public' }, serve: fn => { handler = fn } }, createClient: (_url, key) => key === 'service' ? admin : caller })
  return { authUser, manager, writes, vaultWrites, reads, invoke: (body, token = 'Bearer test', method = 'POST') => handler(new Request('https://example.test', { method, headers: token ? { Authorization: token } : {}, ...(method === 'POST' ? { body: JSON.stringify({ branch_id: branchId, action: 'password', password: 'New-password-42', ...body }) } : {}) })) }
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
  assert.deepEqual(Object.keys(app.writes[0].attributes), ['password','app_metadata'], 'no role, email, enable or branch changes')
  assert.ok(app.authUser.app_metadata.pedram_branch_password_iv)
  assert.equal(app.vaultWrites.filter(write => write.table === 'branch_password_vault').length, 1)
})

test('login details support both username and email accounts without writing Auth', async () => {
  for (const [username, expected] of [['kabul-manager', 'kabul-manager'], [null, 'manager@example.test']]) {
    const app = setup({ manager: { username } })
    assert.deepEqual(await (await app.invoke({ action: 'details' })).json(), { login: expected })
    assert.equal(app.writes.length, 0)
  }
})

test('vault readiness checks the configured key without needing a branch', async () => {
  const app = setup()
  const response = await app.invoke({ action: 'check_vault', branch_id: undefined })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ready: true })
  assert.equal(app.writes.length, 0)
  assert.equal(app.vaultWrites.length, 0)
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

test('changing a username supports Dari, spaces and symbols and matches the sign-in identity', async () => {
  for (const login of ['مدیر کابل','Branch Manager 1','Manager+Special!','name@office','New.Manager','office@example.test']) {
    const app = setup()
    const response = await app.invoke({action:'login',login})
    assert.equal(response.status,200)
    assert.deepEqual(await response.json(),{success:true,login})
    assert.equal(app.authUser.email,(await loginIdentity(login)).email)
    assert.equal(app.manager.username,login)
    assert.equal(app.manager.role,'branch_manager')
    assert.equal(app.manager.branch_id,branchId)
    assert.deepEqual(await (await app.invoke({action:'details'})).json(),{login})
    assert.ok(!app.writes[0].attributes.password)
  }
})

test('duplicate usernames and profile failures do not silently break the existing login', async () => {
  const duplicate = setup({updateError:{code:'email_exists'}})
  assert.deepEqual(await (await duplicate.invoke({action:'login',login:'Taken Name'})).json(),{error:'LOGIN_TAKEN'})
  assert.equal(duplicate.manager.username,'kabul-manager')
  const failed = setup({profileError:{code:'network'}}), priorEmail = failed.authUser.email
  assert.deepEqual(await (await failed.invoke({action:'login',login:'New Name'})).json(),{error:'LOGIN_PROFILE_FAILED'})
  assert.equal(failed.authUser.email,priorEmail)
  assert.deepEqual(await (await failed.invoke({action:'details'})).json(),{login:'kabul-manager'})
  const profileDuplicate = setup({profileError:{code:'23505'}})
  assert.deepEqual(await (await profileDuplicate.invoke({action:'login',login:'Taken'})).json(),{error:'LOGIN_TAKEN'})
  assert.equal(profileDuplicate.authUser.email,priorEmail)
  const rollbackFailure = setup({profileError:{code:'network'},rollbackError:{code:'network'}})
  assert.deepEqual(await (await rollbackFailure.invoke({action:'login',login:'Working New Name'})).json(),{error:'LOGIN_SYNC_FAILED'})
  assert.deepEqual(await (await rollbackFailure.invoke({action:'details'})).json(),{login:'Working New Name'},'details must report the login that actually matches Auth')
})

test('password display returns the newly saved password, is not cached, and rejects stale vault data', async () => {
  const app = setup()
  assert.equal((await app.invoke({password:'Current-test-pass-42'})).status,200)
  const shown = await app.invoke({action:'vault'})
  assert.equal(shown.headers.get('cache-control'),'no-store')
  assert.deepEqual(await shown.json(),{password:'Current-test-pass-42'})
  assert.equal(app.authUser.app_metadata.provider,'email')
  const failedVault = setup({vaultError:{code:'network'},storedVault:{iv:'old-nonce',ciphertext:'old-password',key_version:2}})
  assert.deepEqual(await (await failedVault.invoke()).json(),{error:'VAULT_WRITE_FAILED'})
  assert.deepEqual(await (await failedVault.invoke({action:'vault'})).json(),{error:'PASSWORD_NOT_VAULTED'},'never present the previous password as current after a failed vault save')
})
