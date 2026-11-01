import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  alertKey,
  alertSeverity,
  normalizePreferences,
  parseWorkspaceRoute,
  readPreferences,
  searchCategories,
  visibleAlerts,
  writePreferences,
} from '../src/lib/workspaceTools.js'

test('workspace record links retain their record IDs and filters', () => {
  const route = parseWorkspaceRoute('#/vehicles/documents/parent-id?document=file-id')
  assert.deepEqual(route.segments, ['vehicles', 'documents', 'parent-id'])
  assert.equal(route.params.get('document'), 'file-id')
  assert.equal(
    parseWorkspaceRoute('#/cashbook?scope=admin&currency=USD').params.get('currency'),
    'USD',
  )
  assert.deepEqual(parseWorkspaceRoute('#/').segments, [])
})
test('search exposes only categories with a working destination for each role', () => {
  assert.deepEqual(searchCategories('driver'), ['all', 'bookings'])
  assert.equal(searchCategories('vice_president').includes('cashbook'), false)
  assert.equal(searchCategories('president').includes('cashbook'), true)
  assert.equal(searchCategories('branch_manager').includes('documents'), true)
  assert.deepEqual(searchCategories('departmental_manager'), ['all'])
})
test('saved preferences are validated and isolated by signed-in user', () => {
  const memory = new Map()
  globalThis.localStorage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
  }
  writePreferences('first', { theme: 'dark', density: 'compact' })
  assert.equal(readPreferences('first').theme, 'dark')
  assert.equal(readPreferences('second').theme, 'light')
  assert.equal(normalizePreferences({ theme: 'unknown', notificationDays: 999 }).theme, 'light')
  assert.equal(normalizePreferences({ notificationDays: 999 }).notificationDays, 14)
  memory.set('pedram-preferences:first', '{broken')
  assert.equal(readPreferences('first').theme, 'light')
  delete globalThis.localStorage
})
test('notification switches and read state actually filter the alert list', () => {
  const items = [
    { category: 'documents', id: 'doc', event_date: '2026-11-02' },
    { category: 'bookings', id: 'booking', event_date: '2026-11-03' },
  ]
  const preferences = normalizePreferences({ documentAlerts: false })
  assert.equal(visibleAlerts(items, preferences).length, 1)
  assert.equal(
    visibleAlerts(items, { ...preferences, unreadOnly: true, readAlerts: [alertKey(items[1])] })
      .length,
    0,
  )
  assert.notEqual(alertKey(items[0]), alertKey({ ...items[0], event_date: '2026-12-01' }))
})

test('notification archives restore independently of read status and category', () => {
  const doc = { category: 'documents', id: 'doc', event_date: '2026-11-01' }
  const booking = { category: 'bookings', id: 'booking', event_date: '2026-11-03' }
  const items = [doc, booking]
  const preferences = normalizePreferences({ archivedAlerts: [alertKey(doc)] })
  assert.deepEqual(visibleAlerts(items, preferences), [booking])
  assert.deepEqual(visibleAlerts(items, preferences, { archived: true }), [doc])
  assert.deepEqual(visibleAlerts(items, preferences, { category: 'documents' }), [])
  assert.deepEqual(visibleAlerts(items, { ...preferences, archivedAlerts: [] }), items)
  assert.equal(
    normalizePreferences({ archivedAlerts: [null, 5, 'valid'] }).archivedAlerts.length,
    1,
  )
})

test('notification severity distinguishes expired documents, upcoming expiry and bookings', () => {
  assert.equal(
    alertSeverity({ category: 'documents', event_date: '2026-11-01' }, '2026-11-02'),
    'danger',
  )
  assert.equal(
    alertSeverity({ category: 'documents', event_date: '2026-11-02' }, '2026-11-02'),
    'warning',
  )
  assert.equal(
    alertSeverity({ category: 'bookings', event_date: '2026-11-03' }, '2026-11-02'),
    'info',
  )
})
