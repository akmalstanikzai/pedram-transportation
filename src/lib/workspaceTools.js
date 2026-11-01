export const defaultPreferences = {
  theme: 'light',
  density: 'comfortable',
  documentAlerts: true,
  bookingAlerts: true,
  notificationDays: 14,
  unreadOnly: false,
  readAlerts: [],
  archivedAlerts: [],
}

export function normalizePreferences(value) {
  const source = value && typeof value === 'object' ? value : {}
  return {
    theme: ['light', 'dark', 'system'].includes(source.theme) ? source.theme : 'light',
    density: source.density === 'compact' ? 'compact' : 'comfortable',
    documentAlerts: source.documentAlerts !== false,
    bookingAlerts: source.bookingAlerts !== false,
    notificationDays: [7, 14, 30].includes(source.notificationDays) ? source.notificationDays : 14,
    unreadOnly: source.unreadOnly === true,
    readAlerts: Array.isArray(source.readAlerts)
      ? source.readAlerts
          .filter((item) => typeof item === 'string' && item.length < 150)
          .slice(-500)
      : [],
    archivedAlerts: Array.isArray(source.archivedAlerts)
      ? source.archivedAlerts
          .filter((item) => typeof item === 'string' && item.length < 150)
          .slice(-500)
      : [],
  }
}
export function readPreferences(userId) {
  try {
    return normalizePreferences(JSON.parse(localStorage.getItem(`pedram-preferences:${userId}`)))
  } catch {
    return { ...defaultPreferences, readAlerts: [] }
  }
}
export function writePreferences(userId, preferences) {
  localStorage.setItem(
    `pedram-preferences:${userId}`,
    JSON.stringify(normalizePreferences(preferences)),
  )
}
export function parseWorkspaceRoute(hash) {
  const [pathname, query = ''] = hash.replace(/^#\/?/, '').split('?')
  return { segments: pathname.split('/').filter(Boolean), params: new URLSearchParams(query) }
}
export function searchCategories(role) {
  if (role === 'driver') return ['all', 'bookings']
  if (!['president', 'vice_president', 'branch_manager'].includes(role)) return ['all']
  const categories = [
    'all',
    'vehicles',
    'owners',
    'drivers',
    'branches',
    'bookings',
    'traders',
    'documents',
  ]
  return ['president', 'branch_manager'].includes(role) ? [...categories, 'cashbook'] : categories
}
export const categoryLabel = (category, language) =>
  ({
    all: ['All', 'همه'],
    vehicles: ['Vehicles', 'وسایط'],
    owners: ['Owners', 'مالکان'],
    drivers: ['Drivers', 'رانندگان'],
    branches: ['Branches', 'شعبات'],
    bookings: ['Bookings', 'بوکینگ‌ها'],
    traders: ['Traders', 'تاجران'],
    documents: ['Documents', 'اسناد'],
    cashbook: ['Cashbook', 'روزنامچه'],
  })[category]?.[language === 'fa' ? 1 : 0] || category
export const alertKey = (item) => `${item.category}:${item.id}:${item.event_date}`
export function visibleAlerts(items, preferences, { archived = false, category = 'all' } = {}) {
  return items.filter(
    (item) =>
      (item.category === 'documents' ? preferences.documentAlerts : preferences.bookingAlerts) &&
      (category === 'all' || item.category === category) &&
      (preferences.archivedAlerts || []).includes(alertKey(item)) === archived &&
      (!preferences.unreadOnly || !preferences.readAlerts.includes(alertKey(item))),
  )
}
export function alertSeverity(item, today) {
  return item.category === 'documents' ? (item.event_date < today ? 'danger' : 'warning') : 'info'
}
