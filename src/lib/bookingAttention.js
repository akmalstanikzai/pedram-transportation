export const bookingAttention = {
  deliveries: ['Deliveries awaiting confirmation', 'تحویل‌های منتظر تأیید'],
  departures: ['Departures due', 'حرکت‌های موعدرسیده'],
}

export function driverReportForCurrentLeg(row) {
  return row.handoff_confirmed_at
    ? { accepted: row.onward_driver_accepted_at, delivered: row.onward_driver_delivered_at }
    : { accepted: row.driver_accepted_at, delivered: row.driver_delivered_at }
}

export function attentionForBooking(row, today) {
  if (row.archived_at || row.deleted_at) return null
  if (row.status === 'in_transit' && driverReportForCurrentLeg(row).delivered) return 'deliveries'
  const departure = row.departure_date || row.booking_date
  if (row.status === 'confirmed' && departure && departure <= today) return 'departures'
  return null
}
