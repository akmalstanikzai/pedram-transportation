import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cashbookReceipt, canPrintReceipt, personStatement, traderPortalStatement } from '../src/lib/financialReports.js'

test('person statements filter dates and keep currencies separate, including reversal cash movements', () => {
  const transactions = [
    { id:'a', date:'2026-11-10', direction:'out', amount:'10.10', currency:'USD', description:'Loan', branch:'Kabul', loan_due_date:'2026-12-10', loan_remaining:'5.10' },
    { id:'b', date:'2026-11-11', direction:'in', amount:5, currency:'USD', description:'Repayment', loan_repayment_entry_id:'a' },
    { id:'c', date:'2026-11-11', direction:'out', amount:1000, currency:'AFN', description:'Reversed expense', reversed_by:12 },
    { id:'d', date:'2026-11-11', direction:'in', amount:1000, currency:'AFN', description:'Reversal', reversal:true },
    { id:'e', date:'2026-10-01', direction:'out', amount:100, currency:'USD', description:'Old payment' },
  ]
  for (const kind of ['driver', 'employee']) for (const language of ['en', 'fa']) {
    const report = personStatement({ language, kind, name:'Person', transactions, start:'2026-11-10', end:'2026-11-11' })
    assert.deepEqual(report.sections[0].rows, [['AFN','1,000.00 AFN','1,000.00 AFN'], ['USD','5.00 USD','10.10 USD']])
    assert.equal(report.sections[1].rows.length, 4)
    assert.ok(JSON.stringify(report).includes('5.10 USD'))
    assert.ok(!JSON.stringify(report).includes('Old payment'))
    const filtered = personStatement({ language, kind, name:'Person', transactions, start:'2026-11-11', end:'2026-11-11', currency:'USD' })
    assert.deepEqual(filtered.sections[0].rows, [['USD','5.00 USD','0.00 USD']])
    assert.equal(filtered.sections[1].rows.length, 1)
  }
  assert.equal(transactions[0].id, 'a')
})

test('individual receipts exclude synthetic opening balances and redacted branch aggregates', () => {
  const row = { id:'entry', entry_date:'2026-11-12', direction:'out', amount:'12.34', currency:'AFN', description:'Expense', receipt_number:100, corrections:[{}] }
  for (const hidden of [{...row, opening:true}, {...row, private_activity:true}, {...row, direction:'invalid'}, null]) {
    assert.equal(canPrintReceipt(hidden), false)
    assert.equal(cashbookReceipt({row:hidden, language:'en', account:'Kabul'}), null)
  }
  for (const language of ['en', 'fa']) {
    const report = cashbookReceipt({row, language, account:'Kabul'})
    assert.equal(report.sections[0].rows[3][1], '12.34 AFN')
    assert.equal(report.sections[0].rows[4][1], 'Expense')
    assert.ok(JSON.stringify(report).includes('Kabul'))
    assert.ok(!JSON.stringify(report).includes('100'))
  }
})

test('trader portal report reconciles cancelled charges, refunds and bookings in the selected currency', () => {
  const data = {
    trader:{name:'My trader', password:'never print'},
    bookings:[{id:'b', number:1, date:'2026-11-12', currency:'USD', origin:'Kabul', destination:'Herat', goods:'Food'}, {id:'foreign', number:2, date:'2026-11-12', currency:'AFN', goods:'Other currency'}],
    charges:[{id:'c', booking_id:'b', date:'2026-11-12', amount:100, currency:'USD', description:'Charge'}, {id:'v', booking_id:'b', date:'2026-11-12', amount:50, currency:'USD', description:'Cancelled item', voided_at:'2026-11-12'}, {id:'x', booking_id:'foreign', date:'2026-11-12', amount:2000, currency:'AFN', description:'Hidden AFN charge'}],
    payments:[{id:'p', booking_id:'b', date:'2026-11-12', amount:70, currency:'USD', direction:'in', description:'Payment'}, {id:'r', booking_id:'b', date:'2026-11-12', amount:10, currency:'USD', direction:'out', description:'Refund'}],
  }
  for (const language of ['en', 'fa']) {
    const report = traderPortalStatement({data, currency:'USD', language})
    assert.deepEqual(report.sections[0].rows.map(row => row[1]), ['100.00 USD','60.00 USD','40.00 USD','0.00 USD'])
    assert.equal(report.sections[1].rows.length,1)
    assert.deepEqual(report.sections[1].rows[0].slice(3), ['100.00 USD','60.00 USD','40.00 USD'])
    assert.equal(report.sections[2].rows.length,4)
    assert.ok(report.sections[2].rows.some(row => row[3] === '-10.00 USD'))
    assert.ok(JSON.stringify(report).includes('Cancelled item'))
    assert.ok(!JSON.stringify(report).includes('Hidden AFN charge'))
    assert.ok(!JSON.stringify(report).includes('never print'))
  }
})
