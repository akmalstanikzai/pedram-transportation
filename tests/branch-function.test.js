// Runs the actual Edge handler with Auth/SQL adapters stubbed. No network or credentials.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
const source = stripTypeScriptTypes(
  (
    await readFile(
      new URL('../supabase/functions/create-branch-with-manager/index.ts', import.meta.url),
      'utf8',
    )
  ).replace(/^import .*\n/, ''),
)
const requestId = '10000000-0000-0000-0000-000000000001'
const payload = {
  request_id: requestId,
  branch: { name: 'Kabul', province: 'Kabul', city: 'Kabul' },
  manager: { full_name: 'Manager', phone: '0700000000' },
  credentials: { login: 'branch.manager', password: 'IsolatedTest123!' },
}
function fixture(options = {}) {
  const calls = { created: [], removed: [], rpc: [] }
  let reads = 0,
    recoveryReads = 0
  const caller = {
    auth: {
      getUser: async () => ({
        data: { user: options.unauthenticated ? null : { id: 'president-id' } },
        error: null,
      }),
    },
  }
  const admin = {
    from: (_table) => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: { role: options.role || 'president', account_enabled: !options.disabled },
            error: null,
          }),
          maybeSingle: async () => {
            reads++
            return {
              data: options.prior || (reads > 1 ? options.committed : null),
              error:
                options.schemaMissing || (reads > 1 && options.reconciliationFailure)
                  ? { message: 'unavailable' }
                  : null,
            }
          },
        }),
      }),
    }),
    auth: {
      admin: {
        createUser: async (data) => {
          calls.created.push(data)
          return {
            data: { user: options.createError ? null : { id: 'new-user-id' } },
            error: options.createError,
          }
        },
        deleteUser: async (id) => {
          calls.removed.push(id)
          return { error: options.cleanupError || null }
        },
      },
    },
    rpc: async (name, args) => {
      calls.rpc.push({ name, args })
      if (name === 'find_branch_provisioning_account') {
        recoveryReads++
        return {
          data: options.recovered || (recoveryReads > 1 ? options.recoveredAfterTimeout : null),
          error: null,
        }
      }
      return { data: options.sqlError ? null : 'new-branch-id', error: options.sqlError || null }
    },
  }
  let handler
  const deno = {
    env: { get: (name) => (name === 'SUPABASE_URL' ? 'https://isolated.example' : 'test-only') },
    serve: (fn) => {
      handler = fn
    },
  }
  let clients = 0
  new Function('Deno', 'createClient', 'console', source)(
    deno,
    () => (++clients === 1 ? caller : admin),
    { error() {} },
  )
  return {
    calls,
    send: async (
      body = payload,
      headers = { Authorization: 'Bearer isolated-test' },
      method = 'POST',
    ) => {
      clients = 0
      const response = await handler(
        new Request('https://isolated.example/function', {
          method,
          headers: { ...headers, 'Content-Type': 'application/json' },
          ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
        }),
      )
      return { status: response.status, body: await response.json() }
    },
  }
}
test('branch endpoint rejects unauthenticated, unauthorized and disabled callers', async () => {
  assert.equal((await fixture().send(payload, {})).status, 401)
  assert.equal((await fixture({ unauthenticated: true }).send()).status, 401)
  assert.equal((await fixture({ role: 'branch_manager' }).send()).status, 403)
  assert.equal((await fixture({ disabled: true }).send()).body.error, 'ACCOUNT_DISABLED')
  assert.equal((await fixture().send(payload, {}, 'GET')).status, 405)
})
test('input is validated before any account is created', async () => {
  const f = fixture()
  assert.equal(
    (await f.send({ ...payload, credentials: { ...payload.credentials, login: 'john doe' } })).body
      .error,
    'INVALID_LOGIN',
  )
  assert.equal(
    (await f.send({ ...payload, branch: { ...payload.branch, name: '   ' } })).body.error,
    'REQUIRED_FIELDS',
  )
  assert.equal(f.calls.created.length, 0)
  assert.equal(
    (await f.send({ ...payload, branch_id: '-'.repeat(36), expected_updated_at: '2026-11-01' }))
      .body.error,
    'REQUIRED_FIELDS',
  )
})
test('successful branch creation uses the atomic provisioning RPC and trusted recovery metadata', async () => {
  const f = fixture(),
    response = await f.send()
  assert.equal(response.body.branch_id, 'new-branch-id')
  assert.equal(f.calls.created[0].email, 'branch.manager@users.pedram.local')
  assert.equal(f.calls.created[0].app_metadata.pedram_provisioning_request, requestId)
  assert.equal(f.calls.rpc.at(-1).name, 'provision_branch')
  assert.equal(f.calls.removed.length, 0)
})
test('retry of an already provisioned branch creates no extra account', async () => {
  const f = fixture({ prior: { id: 'existing', created_by: 'president-id' } })
  assert.equal((await f.send()).body.branch_id, 'existing')
  assert.equal(f.calls.created.length, 0)
})
test('interrupted Auth provisioning recovers the same account', async () => {
  const f = fixture({ recovered: 'recovered-user-id' })
  assert.equal((await f.send()).status, 200)
  assert.equal(f.calls.created.length, 0)
  assert.equal(f.calls.rpc.at(-1).args.p_manager, 'recovered-user-id')
  const timeout = fixture({
    createError: { status: 503, message: 'timeout' },
    recoveredAfterTimeout: 'timed-out-user',
  })
  assert.equal((await timeout.send()).status, 200)
  assert.equal(timeout.calls.rpc.at(-1).args.p_manager, 'timed-out-user')
})
test('a replacement manager uses the existing branch and its optimistic version', async () => {
  const f = fixture()
  await f.send({ ...payload, branch_id: requestId, expected_updated_at: '2026-11-01T00:00:00Z' })
  assert.equal(f.calls.rpc.at(-1).args.p_branch, requestId)
  assert.equal(f.calls.rpc.at(-1).args.p_expected, '2026-11-01T00:00:00Z')
})
test('definite SQL failure compensates Auth creation; ambiguous commits never delete the account', async () => {
  const definite = fixture({ sqlError: { code: 'P0001', message: 'DUPLICATE_RECORD' } })
  assert.equal((await definite.send()).body.error, 'DUPLICATE_RECORD')
  assert.deepEqual(definite.calls.removed, ['new-user-id'])
  const ambiguous = fixture({ sqlError: { message: 'fetch failed' }, reconciliationFailure: true })
  assert.equal((await ambiguous.send()).body.error, 'PROVISIONING_REVIEW_REQUIRED')
  assert.equal(ambiguous.calls.removed.length, 0)
  const committed = fixture({
    sqlError: { message: 'fetch failed' },
    committed: { id: 'committed', created_by: 'president-id' },
  })
  assert.equal((await committed.send()).body.branch_id, 'committed')
  assert.equal(committed.calls.removed.length, 0)
  const recovered = fixture({
    recovered: 'prior-user',
    sqlError: { code: 'P0001', message: 'MANAGER_ASSIGNED' },
  })
  assert.equal((await recovered.send()).body.error, 'PROVISIONING_REVIEW_REQUIRED')
  assert.equal(
    recovered.calls.removed.length,
    0,
    'previously recovered accounts must not be deleted',
  )
})
