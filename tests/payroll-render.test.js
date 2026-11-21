import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

test('the payroll table shows balances and history, and prevents payments to settled or archived employees', async () => {
  const server = await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'})
  try {
    const {PayrollCards} = await server.ssrLoadModule('/src/components/EmployeePayroll.jsx')
    const row = {id:'one',name:'Employee One',phone:'0700000000',salary:15000,advances:3000,paid:10000,remaining:2000,payments:[{id:'payment',date:'2026-11-16',kind:'advance',amount:3000,account:'Kabul',reversed:true}]}
    for (const language of ['en','fa']) {
      const render = rows => renderToStaticMarkup(React.createElement(PayrollCards,{rows,language,onPay(){},onPrint(){}}))
      const html = render([row])
      for (const text of ['Employee One','0700000000','15,000.00 AFN','3,000.00 AFN','10,000.00 AFN','2,000.00 AFN','Kabul']) assert.ok(html.includes(text),text)
      assert.match(html,/<table class="compact-table"/)
      assert.match(html,/Print payslip|چاپ برگه معاش/)
      assert.match(html,/Reversed|معکوس‌شده/)
      assert.doesNotMatch(html, /<button[^>]*disabled/)
      for (const blocked of [{...row,remaining:0},{...row,archived:true}]) assert.match(render([blocked]),/<button[^>]*disabled/)
    }
  } finally { await server.close() }
})
