import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { cashbookReceipt, personStatement, traderPortalStatement } from '../src/lib/financialReports.js'
import { payrollPayslip } from '../src/lib/payroll.js'

test('all financial reports use safe text, RTL and the working Print / Save PDF flow', async () => {
  const server = await createServer({ server:{ middlewareMode:true, hmr:false }, appType:'custom' })
  const previousWindow = globalThis.window
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.style = {setProperty(key,value) { this[key] = value }} }
    append(child) { this.children.push(child) }
    setAttribute(key,value) { this[key] = value }
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
        payrollPayslip({name:unsafe,phone:'0700000000',salary:15000,advances:3000,paid:10000,remaining:2000,payments:[]},1405,8,language),
        {language,title:unsafe,sections:[{title:'Booking',rows:[['Route','Kabul → Herat']]},{headers:['Date','Description','In','Out'],rows:[['1405/08/28',unsafe,'100','']]}]},
      ]
      for (const report of reports) {
        let printed = 0, focused = 0, receiptHeight = 290
        const events = {}
        const doc = { documentElement:{}, head:new Element('head'), body:new Element('body'), createElement:tag => {
          const node = new Element(tag)
          if (tag === 'main') node.getBoundingClientRect = () => {
            assert.equal(node.style.maxWidth,'none','measure at print width, not the phone preview width')
            return {height:receiptHeight}
          }
          return node
        }, fonts:{ready:Promise.resolve()} }
        const popup = { document:doc, focus:() => focused++, print:() => printed++, addEventListener:(name,callback) => { events[name] = callback } }
        globalThis.window = { open:() => popup, location:{href:'http://localhost/'}, navigator:{userAgent:language === 'fa' ? 'Android' : 'Desktop'} }
        assert.equal(printRecord(report), true)
        await new Promise(resolve => setImmediate(resolve))
        assert.equal(doc.documentElement.dir, language === 'fa' ? 'rtl' : 'ltr')
        assert.equal(popup.opener, null)
        assert.equal(printed, 0, 'the receipt preview opens before the OS print dialog')
        assert.equal(focused, 0)
        assert.equal(doc.title, report.title)
        const elements = flatten(doc.body)
        const cleanterButton = elements.find(node=>node.textContent === 'چاپ رسید (Cleanter)')
        assert.equal(Boolean(cleanterButton),language === 'fa')
        assert.equal(elements.filter(node => node.tag === 'img').length, 1, 'only the company logo is an image')
        assert.ok(elements.some(node => String(node.textContent).includes(unsafe)))
        assert.equal(elements.filter(node => node.tag === 'footer' && node.textContent === 'rayan-tech-solution.tech').length,1)
        const closing = elements.find(node => node.className === 'report-closing')
        assert.ok(closing.children.some(node => node.tag === 'footer'))
        if (report.note) assert.ok(closing.children.some(node => node.textContent === report.note))
        assert.ok(elements.some(node => node.className?.includes('receipt-table')))
        assert.equal(typeof events.beforeprint,'function')
        receiptHeight = 650
        events.beforeprint()
        assert.ok(flatten(doc.head).some(node => String(node.textContent).includes(language === 'fa' ? 'size: auto; margin: 0;' : 'size: 80mm 174mm; margin: 0;')),'Android uses the service sheet; desktop printing remeasures after font/layout changes')
        elements.find(node => node.tag === 'button').onclick()
        await new Promise(resolve => setImmediate(resolve))
        assert.equal(printed, 1)
        assert.equal(focused, 1)
        const paper = elements.find(node => node.tag === 'select')
        assert.equal(paper.value,'80')
        paper.value = '58'; paper.onchange()
        assert.equal(doc.body.className,'receipt')
        assert.ok(flatten(doc.head).some(node => String(node.textContent).includes(language === 'fa' ? 'size: auto;' : 'size: 58mm')))
        paper.value = 'a4'; paper.onchange()
        assert.equal(doc.body.className,'a4')
        if (cleanterButton) assert.equal(cleanterButton.disabled,false,'Cleanter remains actionable in PDF mode and selects receipt paper when tapped')
        assert.ok(flatten(doc.head).some(node => String(node.textContent).includes('size: A4')))
        popup.closed = true
        elements.find(node => node.tag === 'button').onclick()
        await new Promise(resolve => setImmediate(resolve))
        assert.equal(printed, 1)
      }
    }
  } finally {
    globalThis.window = previousWindow
    await server.close()
  }
})
