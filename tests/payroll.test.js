import { test } from 'node:test'
import assert from 'node:assert/strict'
import { payrollTotals, payrollStatus, payrollPayslip, payrollMonthLabel } from '../src/lib/payroll.js'

test('payroll totals use cents and keep advances separate from salary payments', () => {
  const rows = [{salary:'15000.10',advances:'3000.05',paid:'10000.02',remaining:'2000.03'}, {salary:'20000.20',advances:0,paid:0,remaining:'20000.20'}]
  assert.deepEqual(payrollTotals(rows),{salary:3500030,advances:300005,paid:1000002,remaining:2200023})
  assert.deepEqual(payrollTotals([]),{salary:0,advances:0,paid:0,remaining:0})
  assert.equal(payrollStatus(rows[0],'en'),'Partly paid')
  assert.equal(payrollStatus(rows[1],'en'),'Unpaid')
  assert.equal(payrollStatus({...rows[0],remaining:0},'en'),'Paid')
})

test('payslips distinguish reversed history from current salary balances in English and Dari', () => {
  const row = {name:'Employee One',phone:'0700000000',salary:15000,advances:3000,paid:0,remaining:12000,payments:[{date:'2026-11-16',kind:'advance',amount:3000,account:'Admin',reversed:false},{date:'2026-11-16',kind:'salary',amount:12000,account:'Branch',reversed:true}]}
  for (const language of ['en','fa']) {
    const report = payrollPayslip(row,1405,8,language)
    assert.equal(report.subtitle,payrollMonthLabel(1405,8,language))
    assert.equal(report.sections[0].rows[5][1],'12,000.00 AFN')
    assert.equal(report.sections[1].rows.length,2)
    assert.equal(report.sections[1].rows[1][4],language === 'fa' ? 'معکوس‌شده' : 'Reversed')
    assert.ok(JSON.stringify(report).includes('0700000000'))
    assert.doesNotMatch(JSON.stringify(report),/NaN|undefined/)
  }
})
