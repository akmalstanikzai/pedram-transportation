import { test } from 'node:test'
import assert from 'node:assert/strict'
import { customsAgentReport, customsStatementView } from '../src/lib/customsAgentStatement.js'

test('date filters preserve current balances and include reversals in period totals', () => {
  const statement = {
    fees: [
      { date: '2026-11-01', currency: 'AFN', amount: 5000, paid: 0, remaining: 5000 },
      { date: '2026-11-10', currency: 'USD', amount: 100, paid: 25, remaining: 75 },
    ],
    payments: [
      { date: '2026-11-02', currency: 'AFN', amount: 2000, branch: 'Kabul', receipt_number: 7, reversed_by: 8 },
      { date: '2026-11-08', currency: 'AFN', amount: 2000, branch: 'Kabul', receipt_number: 8, reversal: true, reverses_receipt: 7, description: 'Wrong payment' },
      { date: '2026-11-11', currency: 'USD', amount: 25, receipt_number: 9, description: 'Part payment' },
    ],
  }
  const view = customsStatementView(statement, { start: '2026-11-08', end: '', currency: '' })
  assert.equal(view.fees.length, 1)
  assert.deepEqual(view.totals, [
    { unit: 'AFN', agreed: 500000, paid: 0, remaining: 500000, periodPaid: -200000 },
    { unit: 'USD', agreed: 10000, paid: 2500, remaining: 7500, periodPaid: 2500 },
  ])
  const pdf = customsAgentReport('Ahmad', 'en', view, '2026-11-08', '')
  assert.deepEqual(pdf.sections[2].rows.map(row => row.slice(1)), [
    ['#8', 'Kabul', 'Wrong payment · Reversal of #7', '-2,000.00 AFN'],
    ['#9', 'Admin account', 'Part payment', '25.00 USD'],
  ])
  const afn = customsStatementView(statement, { start: '', end: '', currency: 'AFN' })
  assert.equal(afn.totals.length, 1)
  assert.equal(afn.totals[0].periodPaid, 0)
})
