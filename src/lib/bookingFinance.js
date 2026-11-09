import { cents } from './cashbook.js'

export function bookingTotal(form) {
  const managed = form.service_type === 'managed'
  return cents(form.commission_amount) + (managed
    ? cents(form.freight_amount) + cents(form.carrier_cost) + (form.other_expenses || []).reduce((sum, item) => sum + cents(item.amount), 0)
    : 0)
}

export function bookingDue(charge, paid) {
  return Math.max(0, cents(charge) - cents(paid))
}
