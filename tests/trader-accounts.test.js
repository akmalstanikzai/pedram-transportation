import {test} from 'node:test'
import assert from 'node:assert/strict'
import {traderBalance} from '../src/lib/traderAccounts.js'
test('trader balances subtract receipts and keep currencies separate',()=>{
 const s=traderBalance([{currency:'AFN',amount:100},{currency:'USD',amount:500}],[{currency:'AFN',direction:'in',amount:60},{currency:'USD',direction:'in',amount:500}],'AFN')
 assert.deepEqual(s,{charged:10000,received:6000,owed:4000,credit:0})
})
test('overpayments, refunds and cancelled fares retain correct credit',()=>{
 const charges=[{currency:'AFN',amount:100},{currency:'AFN',amount:500,voided_at:'2026-11-02'}]
 const payments=[{currency:'AFN',amount:120,direction:'in'},{currency:'AFN',amount:10,direction:'out'}]
 assert.deepEqual(traderBalance(charges,payments,'AFN'),{charged:10000,received:11000,owed:0,credit:1000})
})
