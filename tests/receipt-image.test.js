import { test } from 'node:test'
import assert from 'node:assert/strict'
import { wrapReceiptText, createReceiptImages } from '../src/lib/receiptImage.js'
import { receiptSections, PRINT_CREDIT } from '../src/lib/receiptLayout.js'

test('receipt layout preserves every field of wide tables and distinguishes blank amounts from zero', () => {
  for (const paper of ['80','58']) {
    const sections = receiptSections([{title:'History',headers:['Date','Description','In','Out','Currency','Branch'],rows:[['1405/08/28','Long description',0,'','AFN','Kabul']]},{rows:[['Balance',0],['Notes','']]}],paper)
    const values = sections.flatMap(section=>section.tables.flatMap(table=>table.rows.flat()))
    assert.deepEqual(values,['1405/08/28','Long description','0','—','AFN','Kabul','0','—'])
    assert.ok(sections[0].tables.every(table=>table.headers.length <= (paper==='58'?2:3)))
  }
})

test('80mm cash summaries put four amounts across; 58mm groups pairs and keeps four-column ledger records together on 80mm', () => {
  const summary = {receiptColumns:4,rows:[['Opening',78489],['In',0],['Out',0],['Closing',78489]]}
  const ledger = {headers:['Date','Description','In','Out'],rows:[['1405/08/28','Goods','10','20'],['1405/08/29','Next','30','40']]}
  assert.equal(receiptSections([summary],'80')[0].tables[0].headers.length,4)
  assert.equal(receiptSections([summary],'58')[0].tables.length,2)
  const wide = receiptSections([ledger],'80')[0].tables
  assert.equal(wide.length,1); assert.equal(wide[0].rows.length,2)
  const narrow = receiptSections([ledger],'58')[0].tables
  assert.equal(narrow.length,4)
  assert.deepEqual(narrow[1].rows,[['10','20']])
})

test('receipt wrapping handles long references, newlines, and Dari without clipping', () => {
  const context = {measureText:text => ({width:[...text].length * 10})}
  const lines = wrapReceiptText(context,'LongReferenceWithoutSpaces\nنام کارمند در کابل',70)
  assert.ok(lines.every(line => context.measureText(line).width <= 70))
  assert.ok(lines.join('').includes('LongReferenceWithoutSpaces'))
  assert.ok(lines.join('').includes('نام'))
})

test('long receipt images split into bounded parts with readable font sizes and correct paper width', async () => {
  const drawn = [], dimensions = []
  const canvas = {width:0,height:0,toBlob:callback => { dimensions.push([canvas.width,canvas.height]); callback(new Blob(['image'],{type:'image/png'})) }}
  const context = {measureText:text => ({width:[...text].length * 10}),fillRect(){},strokeRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fillText(text){drawn.push(text)}}
  canvas.getContext = () => context
  const doc = {createElement:() => canvas}
  const report = {language:'fa',title:'معاش',company:'پدرام',sections:[{headers:['تاریخ','شرح','مبلغ'],rows:Array.from({length:200},(_,index) => ['1405/08/28',`نام کارمند ${index}`,'15,000 AFN'])}]}
  for (const paper of ['80','58']) {
    drawn.length = 0; dimensions.length = 0
    const images = await createReceiptImages(doc,report,paper)
    assert.ok(images.length > 1)
    assert.ok(dimensions.every(([width,height]) => width === (paper === '58' ? 384 : 576) && height <= 6000))
    assert.ok(drawn.join(' ').includes('199'))
    assert.equal(drawn.filter(text=>text===PRINT_CREDIT).length,images.length)
    assert.ok(images.every(blob => blob.type === 'image/png'))
  }
})
