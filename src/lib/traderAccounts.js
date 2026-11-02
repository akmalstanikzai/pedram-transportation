import { cents } from './cashbook.js'
export function traderBalance(charges,payments,currency){
 const charged=charges.filter(c=>c.currency===currency&&!c.voided_at).reduce((sum,c)=>sum+cents(c.amount),0)
 const received=payments.filter(p=>p.currency===currency).reduce((sum,p)=>sum+(p.direction==='in'?cents(p.amount):-cents(p.amount)),0)
 return {charged,received,owed:Math.max(0,charged-received),credit:Math.max(0,received-charged)}
}
