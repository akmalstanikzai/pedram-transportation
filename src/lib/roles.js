export const roleLabels = {
  president: 'President',
  vice_president: 'Vice-president',
  departmental_manager: 'Departmental manager',
  branch_manager: 'Branch manager',
  driver: 'Driver',
}

export const branchModuleIds = Object.freeze(['cashbook','vehicles','bookings','traders'])
const presidentModuleIds = Object.freeze(['cashbook','branches','vehicles','bookings','traders'])

// Use the same explicit permissions for navigation and page rendering.
export function canAccessModule(role, moduleId) {
  if (role === 'president') return presidentModuleIds.includes(moduleId)
  if (role === 'branch_manager') return branchModuleIds.includes(moduleId)
  return false
}

export function getDashboardTitle(role) {
  return `${roleLabels[role] || 'Driver'} Dashboard`
}
