import { test } from 'node:test'
import assert from 'node:assert/strict'
import { simpleLedger, ledgerPeriod } from '../src/lib/cashbook.js'
const accounts=[{id:'a',branch_id:null,currency:'AFN',opening_balance:0},{id:'b',branch_id:'branch',currency:'AFN',opening_balance:100,opening_date:'2026-01-01'},{id:'c',branch_id:'branch',currency:'USD',opening_balance:0}]
const entries=[{id:'1',account_id:'a',entry_date:'2026-01-02',direction:'in',amount:'50.10'},{id:'2',account_id:'b',entry_date:'2026-01-02',direction:'out',amount:'20.05'},{id:'3',account_id:'c',entry_date:'2026-01-02',direction:'in',amount:500}]
test('President sees totals across admin and branches without mixing currencies',()=>{
 const s=simpleLedger(accounts,entries,'all','AFN')
 assert.equal(s.incoming,15010);assert.equal(s.outgoing,2005);assert.equal(s.balance,13005);assert.equal(s.rows.length,3)
})
test('admin and branch ledgers are separate',()=>{
 assert.equal(simpleLedger(accounts,entries,'admin','AFN').balance,5010)
 assert.equal(simpleLedger(accounts,entries,'branch','AFN').balance,7995)
})
test('new ledger needs no opening setup and can record a deficit',()=>{
 const s=simpleLedger([{id:'x',branch_id:'branch',currency:'AFN',opening_balance:0}],[{id:'x',account_id:'x',entry_date:'2026-01-01',direction:'out',amount:10}],'branch','AFN')
 assert.equal(s.balance,-1000)
})
test('empty account starts at zero',()=>{
 assert.deepEqual(simpleLedger([],[],'admin','AFN'),{rows:[],incoming:0,outgoing:0,balance:0})
})
test('a selected period includes prior activity only in its opening balance',()=>{
 const ledger=simpleLedger(accounts,entries,'branch','AFN')
 const day=ledgerPeriod(ledger,'2026-01-02','2026-01-02')
 assert.equal(day.opening,10000)
 assert.equal(day.incoming,0)
 assert.equal(day.outgoing,2005)
 assert.equal(day.balance,7995)
 assert.equal(day.rows.length,1)
})
