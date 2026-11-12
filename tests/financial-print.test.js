import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { cashbookReceipt, personStatement, traderPortalStatement } from '../src/lib/financialReports.js'

test('all financial reports use safe text, RTL and the working Print / Save PDF flow', async () => {
  const server = await createServer({ server:{ middlewareMode:true, hmr:false }, appType:'custom' })
  const previousWindow = globalThis.window
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.style = {} }
    append(child) { this.children.push(child) }
    decode() { return Promise.resolve() }
  }
  const flatten = node => [node, ...node.children.flatMap(flatten)]
  try {
    const { printRecord } = await server.ssrLoadModule('/src/lib/recordExports.js')
    globalThis.window = { open:() => null }
    assert.equal(printRecord({language:'en'}), false)
    const unsafe = '<img src=x onerror=alert(1)>'
    for (const language of ['en','fa']) {
      const person = { language, name:unsafe, transactions:[] }
      const reports = [
        personStatement({...person, kind:'employee'}), personStatement({...person, kind:'driver'}),
        cashbookReceipt({language, account:'Kabul', row:{id:'a', entry_date:'2026-11-12', amount:10, currency:'USD', direction:'in', description:unsafe}}),
        traderPortalStatement({language, currency:'AFN', data:{trader:{name:unsafe}, bookings:[], charges:[], payments:[]}}),
      ]
      for (const report of reports) {
        let printed = 0, focused = 0
        const doc = { documentElement:{}, head:new Element('head'), body:new Element('body'), createElement:tag => new Element(tag), fonts:{ready:Promise.resolve()} }
        const popup = { document:doc, focus:() => focused++, print:() => printed++ }
        globalThis.window = { open:() => popup, location:{href:'http://localhost/'} }
        assert.equal(printRecord(report), true)
        await new Promise(resolve => setImmediate(resolve))
        assert.equal(doc.documentElement.dir, language === 'fa' ? 'rtl' : 'ltr')
        assert.equal(popup.opener, null)
        assert.equal(printed, 1)
        assert.equal(focused, 1)
        assert.equal(doc.title, report.title)
        const elements = flatten(doc.body)
        assert.equal(elements.filter(node => node.tag === 'img').length, 1, 'only the company logo is an image')
        assert.ok(elements.some(node => String(node.textContent).includes(unsafe)))
        elements.find(node => node.tag === 'button').onclick()
        await new Promise(resolve => setImmediate(resolve))
        assert.equal(printed, 2)
        popup.closed = true
        elements.find(node => node.tag === 'button').onclick()
        await new Promise(resolve => setImmediate(resolve))
        assert.equal(printed, 2)
      }
    }
  } finally {
    globalThis.window = previousWindow
    await server.close()
  }
})
