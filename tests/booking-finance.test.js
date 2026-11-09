import test from 'node:test'
import assert from 'node:assert/strict'
import { bookingDue, bookingTotal } from '../src/lib/bookingFinance.js'

test('vehicle arrangement charges commission only', () => {
  assert.equal(bookingTotal({service_type:'arrangement',commission_amount:'120.50',freight_amount:'900',carrier_cost:'200',other_expenses:[{amount:'30'}]}),12050)
})

test('company-managed transport charges freight, vehicle and extra expenses to trader', () => {
  assert.equal(bookingTotal({service_type:'managed',commission_amount:'100',freight_amount:'500',carrier_cost:'75.25',other_expenses:[{amount:'10.10'},{amount:'2.15'}]}),68750)
  assert.equal(bookingDue('687.50','250.00'),43750)
  assert.equal(bookingDue('687.50','700.00'),0)
})
