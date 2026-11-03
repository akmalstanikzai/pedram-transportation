import { kabulToday } from './cashbook'

export function telephoneHref(value) {
  const number = String(value || '').trim().replace(/[\s().-]/g, '')
  return /^\+?[0-9]{5,18}$/.test(number) ? `tel:${number}` : null
}

export function mapHref(location, address) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([address, location].filter(Boolean).join(', '))}`
}

export function licenceWarning(expiry, today = kabulToday()) {
  if (!expiry) return 'missing'
  const days = (Date.parse(`${expiry}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000
  return days < 0 ? 'expired' : days <= 30 ? 'soon' : null
}
