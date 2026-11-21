import { test } from 'node:test'
import assert from 'node:assert/strict'
import { customsAgentReport, customsStatementView } from '../src/lib/customsAgentStatement.js'

test('the all-dates statement shows separate currency balances, fees and payment history', () => {
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
  const view = customsStatementView(statement, '')
  assert.equal(view.fees.length, 2)
  assert.deepEqual(view.totals, [
    { unit: 'AFN', agreed: 500000, paid: 0, remaining: 500000 },
    { unit: 'USD', agreed: 10000, paid: 2500, remaining: 7500 },
  ])
  const pdf = customsAgentReport('Ahmad', 'en', view)
  assert.equal(pdf.subtitle, 'All dates')
  assert.deepEqual(pdf.sections.map(section => section.title), ['Current balances', 'Agreed fees', 'Payment history'])
  assert.deepEqual(pdf.sections[2].rows.map(row => row.slice(1)), [
    ['#7', 'Kabul', 'Reversed by #8', '2,000.00 AFN'],
    ['#8', 'Kabul', 'Wrong payment · Reversal of #7', '-2,000.00 AFN'],
    ['#9', 'Admin account', 'Part payment', '25.00 USD'],
  ])
  const afn = customsStatementView(statement, 'AFN')
  assert.equal(afn.totals.length, 1)
  assert.equal(afn.totals[0].paid, 0)
  assert.equal(afn.fees.length, 1)
  assert.deepEqual(afn.payments.map(row => row.receipt_number), [7, 8])
})
