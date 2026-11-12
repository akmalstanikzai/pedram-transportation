import test from 'node:test'
import assert from 'node:assert/strict'
import { dueLoanAlerts } from '../src/lib/loanNotifications.js'

test('alerts on the Kabul due date and keeps unpaid overdue loans visible', () => {
  const loans = [
    { id: 'future', due_date: '2026-11-13', remaining: 10 },
    { id: 'today', due_date: '2026-11-12', remaining: 20 },
    { id: 'overdue', due_date: '2026-11-10', remaining: 5 },
    { id: 'paid', due_date: '2026-11-12', remaining: 0 },
  ]
  assert.deepEqual(dueLoanAlerts(loans, '2026-11-12').map(({ id, timing }) => [id, timing]), [
    ['overdue', 'overdue'], ['today', 'today'],
  ])
})
