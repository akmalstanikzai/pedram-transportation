import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadAccountProfile } from '../src/lib/accountProfile.js'

test('loads the profile using the SDK session even when its expiry appears past locally', async () => {
  const profile = { id: 'user', role: 'driver' }
  const query = {
    select() { return this },
    eq(column, value) { assert.equal(column, 'id'); assert.equal(value, 'user'); return this },
    abortSignal() { return this },
    async single() { return { data: profile, error: null } },
  }
  const client = {
    auth: { async getSession() { return { data: { session: { user: { id: 'user' }, expires_at: 1 } }, error: null } } },
    from(table) { assert.equal(table, 'profiles'); return query },
  }
  assert.deepEqual((await loadAccountProfile(client, 'user', new AbortController().signal)).data, profile)
})

test('a refresh rate limit is returned without issuing a profile request', async () => {
  const error = { status: 429, message: 'Too many requests' }
  const client = {
    auth: { async getSession() { return { data: {}, error } } },
    from() { assert.fail('must not query with rejected credentials') },
  }
  assert.equal((await loadAccountProfile(client, 'user', new AbortController().signal)).error, error)
})

test('a signed out session never queries a profile', async () => {
  const client = {
    auth: { async getSession() { return { data: { session: null }, error: null } } },
    from() { assert.fail('must not query without a session') },
  }
  assert.equal((await loadAccountProfile(client, 'user', new AbortController().signal)).status, 401)
})
