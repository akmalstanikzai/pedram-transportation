import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canAccessModule } from '../src/lib/roles.js'

test('branch portal allows only its four required pages', () => {
  const modules = ['cashbook', 'branches', 'vehicles', 'bookings', 'traders']
  assert.deepEqual(modules.filter(id => canAccessModule('branch_manager', id)), ['cashbook', 'vehicles', 'bookings', 'traders'])
  assert.equal(canAccessModule('branch_manager', 'branches'), false)
})
test('only President can open Branches; unknown roles and pages are denied', () => {
  assert.equal(canAccessModule('president', 'branches'), true)
  for (const role of ['driver', 'vice_president', 'departmental_manager', undefined, 'admin']) assert.equal(canAccessModule(role, 'branches'), false)
  assert.equal(canAccessModule('president', 'unknown-page'), false)
})
