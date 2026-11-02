export const roleLabels = {
  president: 'President',
  vice_president: 'Vice-president',
  departmental_manager: 'Departmental manager',
  branch_manager: 'Branch manager',
  driver: 'Driver',
}

export const branchModuleIds = ['cashbook','vehicles','bookings','traders']

export function getDashboardTitle(role) {
  return `${roleLabels[role] || 'Driver'} Dashboard`
}
