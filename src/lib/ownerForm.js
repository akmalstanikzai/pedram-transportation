export function ownerFormFromRow(row, branchId = null) {
  return {
    branch_id: branchId, ...row,
    first_name: row?.first_name ?? row?.full_name ?? '', surname: row?.surname || '',
    phone: row?.phone || '', province: row?.province || '', district: row?.district || '', village: row?.village || '',
    legacy_address: row?.address || '',
    original_address_fields: { province: row?.province || '', district: row?.district || '', village: row?.village || '' },
  }
}

export function ownerFormPayload({ legacy_address, original_address_fields, ...form }) {
  const address = Object.fromEntries(['province','district','village'].map(key => [key, form[key].trim()]))
  const changed = Object.keys(address).some(key => address[key] !== (original_address_fields?.[key] || '').trim())
  const composed = Object.values(address).filter(Boolean).join('، ')
  return {
    ...form, ...address,
    first_name: form.first_name.trim(), surname: form.surname.trim(),
    full_name: [form.first_name.trim(), form.surname.trim()].filter(Boolean).join(' '),
    phone: form.phone.trim(), address: changed ? composed : legacy_address || composed,
  }
}
