import { cents } from './cashbook.js'

export const managedChargeLabels = {
  foreign_freight: ['Foreign freight', 'کرایه موتر خارجی'],
  customs: ['Customs', 'گمرک'],
  afghan_freight: ['Afghan freight', 'کرایه موتر افغانی'],
  commission: ['Commission', 'کمیشن'],
  terminal: ['Terminal', 'پایانه'],
  labour: ['Labour', 'کاریگر'],
}

export function managedChargeLabel(charge, language) {
  return managedChargeLabels[charge.key ?? charge.managed_charge_key]?.[language === 'fa' ? 1 : 0] ?? charge.description
}

export function managedBookingTotals(charges, payments = []) {
  const balances = new Map()
  function row(currency) {
    if (!balances.has(currency)) balances.set(currency, { currency, charged: 0, paid: 0 })
    return balances.get(currency)
  }
  for (const charge of charges) {
    if (!charge.voided_at && cents(charge.amount)>0) row(charge.currency).charged += cents(charge.amount)
  }
  for (const payment of payments) {
    row(payment.currency).paid += cents(payment.amount) * (payment.direction === 'out' ? -1 : 1)
  }
  return [...balances.values()].sort((a,b)=>a.currency.localeCompare(b.currency))
    .map(item=>({...item, charged:item.charged/100, paid:item.paid/100}))
}

export function managedBookingStatement(data, bookingId) {
  const charges = data.charges.filter(row=>row.booking_id===bookingId && !row.voided_at)
  const payments = data.payments.filter(row=>row.booking_id===bookingId)
  return { charges, payments, balances: managedBookingTotals(charges,payments) }
}
