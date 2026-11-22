export const bookingAttention = {
  deliveries: ['Deliveries awaiting confirmation', 'تحویل‌های منتظر تأیید'],
  departures: ['Departures due', 'حرکت‌های موعدرسیده'],
}

export function attentionForBooking(row, today) {
  if (row.archived_at || row.deleted_at) return null
  if (row.status === 'in_transit' && row.driver_delivered_at) return 'deliveries'
  const departure = row.departure_date || row.booking_date
  if (row.status === 'confirmed' && departure && departure <= today) return 'departures'
  return null
}
