export const initialBranchForm = {
  name: '', code: '', province: '', city: '', address: '', branchPhone: '',
  managerName: '', managerSurname: '', fatherName: '', managerPhone: '', nationalId: '',
  managerAddress: '', homeProvince: '', homeDistrict: '', homeVillage: '',
  login: '', password: '', confirm: '',
}

export function branchFormFromRow(row) {
  const manager = row.manager || {}
  const structuredHome = manager.home_province || manager.home_district || manager.home_village
  return {
    ...initialBranchForm,
    name: row.name || '', code: row.code || '', province: row.province || '', city: row.city || '',
    address: row.address || '', branchPhone: row.phone || '',
    // Keep legacy full names intact; do not guess where an existing surname starts.
    managerName: manager.first_name ?? manager.full_name ?? '', managerSurname: manager.surname || '',
    fatherName: manager.father_name || '', managerPhone: manager.phone || '', nationalId: manager.national_id || '',
    managerAddress: structuredHome ? '' : manager.address || '',
    homeProvince: manager.home_province || '', homeDistrict: manager.home_district || '', homeVillage: manager.home_village || '',
    login: manager.username || '',
  }
}

export function branchFormPayload(form) {
  return {
    name: form.name, code: form.code.trim(), province: form.province, city: form.city,
    address: form.address, phone: form.branchPhone,
    manager_name: [form.managerName.trim(), form.managerSurname.trim()].filter(Boolean).join(' '),
    manager_first_name: form.managerName.trim(), manager_surname: form.managerSurname.trim(),
    manager_phone: form.managerPhone, father_name: form.fatherName, national_id: form.nationalId,
    manager_address: [form.homeProvince.trim(), form.homeDistrict.trim(), form.homeVillage.trim()].filter(Boolean).join('، ') || form.managerAddress,
    home_province: form.homeProvince.trim(), home_district: form.homeDistrict.trim(), home_village: form.homeVillage.trim(),
  }
}
