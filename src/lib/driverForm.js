export function driverFormFromRow(row, branchId = null) {
  const structuredAddress = row?.province || row?.district || row?.village
  return {
    status: 'available', branch_id: branchId, ...row,
    first_name: row?.first_name ?? row?.full_name ?? '', surname: row?.surname || '',
    phone: row?.phone || '', phone_secondary: row?.phone_secondary || '',
    province: row?.province || '', district: row?.district || '', village: row?.village || '',
    legacy_address: structuredAddress ? '' : row?.address || '',
  }
}

export function driverFormPayload({ legacy_address, ...form }) {
  return {
    ...form,
    first_name: form.first_name.trim(), surname: form.surname.trim(),
    full_name: [form.first_name.trim(), form.surname.trim()].filter(Boolean).join(' '),
    phone: form.phone.trim(), phone_secondary: form.phone_secondary.trim(),
    province: form.province.trim(), district: form.district.trim(), village: form.village.trim(),
    address: [form.province.trim(), form.district.trim(), form.village.trim()].filter(Boolean).join('، ') || legacy_address || '',
  }
}
