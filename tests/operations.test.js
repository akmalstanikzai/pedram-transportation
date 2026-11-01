import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  canAccess,
  canOperate,
  errorText,
  isPublicSupabaseKey,
  normalizeLogin,
  normalizePlate,
  validateFile,
} from '../src/lib/operations.js'

test('login identifiers are normalized consistently and invalid usernames are rejected', () => {
  assert.deepEqual(normalizeLogin('  Branch.Manager  '), {
    username: 'branch.manager',
    email: 'branch.manager@users.pedram.local',
  })
  assert.deepEqual(normalizeLogin('Staff@Example.com'), {
    username: null,
    email: 'staff@example.com',
  })
  for (const login of ['a', 'john doe', '<username>', 'user@', 'مدیر'])
    assert.throws(() => normalizeLogin(login), /INVALID_LOGIN/)
})
test('only browser-safe Supabase key types are accepted', () => {
  const token = (role) =>
    `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.test-signature`
  assert.equal(isPublicSupabaseKey(token('anon')), true)
  assert.equal(isPublicSupabaseKey('sb_publishable_test_fixture'), true)
  assert.equal(isPublicSupabaseKey(token('service_role')), false)
  assert.equal(isPublicSupabaseKey('sb_secret_test_fixture'), false)
  assert.equal(isPublicSupabaseKey('<your key>'), false)
})
test('navigation implements least privilege while retaining planned president modules', () => {
  assert.equal(canOperate('vice_president'), true)
  assert.equal(canAccess('vice_president', 'vehicles'), true)
  assert.equal(canAccess('branch_manager', 'bookings'), true)
  assert.equal(canAccess('branch_manager', 'cashbook'), true)
  assert.equal(canAccess('driver', 'bookings'), true)
  assert.equal(canAccess('driver', 'drivers'), false)
  assert.equal(canAccess('departmental_manager', 'vehicles'), false)
  for (const module of ['trip-plans', 'trader-accounts', 'customs', 'finance', 'reports']) {
    assert.equal(canAccess('president', module), true)
    assert.equal(canAccess('branch_manager', module), false)
  }
})
test('plate normalization and document limits handle common invalid inputs', () => {
  assert.equal(normalizePlate(' kab  123 '), 'KAB123')
  assert.equal(validateFile({ name: 'licence.JPG', type: 'image/jpeg', size: 1024 }), 'image/jpeg')
  for (const file of [
    { name: 'payload.exe', type: 'application/octet-stream', size: 5 },
    { name: 'large.pdf', type: 'application/pdf', size: 20971521 },
    { name: 'spoof.pdf', type: 'text/html', size: 100 },
    { name: 'empty.pdf', type: 'application/pdf', size: 0 },
  ])
    assert.throws(() => validateFile(file), /INVALID_FILE/)
})
test('errors are localized without exposing backend internals', () => {
  for (const code of ['PGRST202', '42703']) {
    assert.match(errorText({ code }, 'en'), /pending database migrations/)
  }
  assert.match(errorText({ code: '23505' }, 'en'), /already exists/)
  assert.notEqual(errorText('ACCOUNT_DISABLED', 'en'), errorText('ACCOUNT_DISABLED', 'fa'))
  assert.doesNotMatch(
    errorText(new Error('private SQL or credential detail'), 'en'),
    /private SQL|credential/,
  )
})
