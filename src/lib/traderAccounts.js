import { cents } from './cashbook.js'
export function traderBalance(charges,payments,currency){
 const charged=charges.filter(c=>c.currency===currency&&!c.voided_at).reduce((sum,c)=>sum+cents(c.amount),0)
 const received=payments.filter(p=>p.currency===currency).reduce((sum,p)=>sum+(p.direction==='in'?cents(p.amount):-cents(p.amount)),0)
 return {charged,received,owed:Math.max(0,charged-received),credit:Math.max(0,received-charged)}
}

export function bookingBalances({ bookings, charges, payments }, currency) {
  const amounts = new Map(bookings.map(booking => [booking.id, { charged: 0, paid: 0 }]))
  for (const charge of charges) {
    const booking = amounts.get(charge.booking_id)
    if (booking && charge.currency === currency && !charge.voided_at) booking.charged += cents(charge.amount)
  }
  for (const payment of payments) {
    const booking = amounts.get(payment.booking_id)
    if (booking && payment.currency === currency) booking.paid += (payment.direction === 'in' ? 1 : -1) * cents(payment.amount)
  }
  return bookings.map(booking => {
    const { charged, paid } = amounts.get(booking.id)
    return { ...booking, charged, paid, remaining: Math.max(0, charged - paid) }
  })
}
