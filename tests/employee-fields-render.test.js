import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

test('employee registration places occupation before salary and groups contact, address and uploads', async () => {
  const server = await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'})
  try {
    const {default:Fields} = await server.ssrLoadModule('/src/components/EmployeeRegistrationFields.jsx')
    for (const language of ['en','fa']) {
      const html = renderToStaticMarkup(React.createElement(Fields,{language,form:{first_name:'First',last_name:'Last',father_name:'Father',phone:'0700000000',province:'Kabul',district:'District',village:'Village',salary:'10000',occupation:'Dispatcher'},files:{},existing:[{document_type:'identity',state:'ready',created_at:'2026-11-15',file_name:'saved-id.pdf'}]}))
      assert.ok(html.indexOf('First') < html.indexOf('Last'))
      assert.ok(html.indexOf('Father') < html.indexOf('0700000000'))
      assert.match(html, /employee-address-row wide/)
      assert.match(html, /<span>(Occupation|وظیفه)<\/span><input type="text" value="Dispatcher"\/><\/label><label><span>(Salary|معاش)[^<]+<\/span><input[^>]+value="10000"\/>/)
      assert.equal((html.match(/type="file"/g)||[]).length,3)
      assert.match(html,/saved-id.pdf/)
      assert.match(html,/Employee photo|عکس کارمند/)
      assert.match(html,/National ID \/ Tazkira|تذکره/)
      assert.match(html,/Other document|سند دیگر/)
      assert.doesNotMatch(html,/Optional|اختیاری|undefined/)
    }
  } finally { await server.close() }
})
