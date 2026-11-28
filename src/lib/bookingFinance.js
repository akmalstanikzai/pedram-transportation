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

export function hasSeparateTripDates(booking) {
  const departure = booking.departure_date || booking.booking_date
  return departure !== booking.booking_date || (booking.arrival_date || departure) !== departure
}

export const bookingTypeLabels = {
  arrangement: ['Vehicle arrangement','معرفی واسطه'],
  managed: ['Company-managed transport','انتقال توسط شرکت (خارجی)'],
  domestic: ['Domestic company transport','انتقال توسط شرکت (داخلی)'],
}
