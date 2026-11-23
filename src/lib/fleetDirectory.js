import { allRows } from './cashbook'
import { rpc } from './operations'
import { supabase } from './supabase'

const directory = {
  driver: {
    table: 'drivers',
    columns: 'id,owner_id,full_name,father_name,phone,license_expiry,address,status,created_at,updated_at,branch_id,archived_at,user_id,previous_company,destination_company,left_company_at,first_name,surname,phone_secondary,province,district,village',
    identifiers: 'national_id,license_number',
  },
  owner: {
    table: 'vehicle_owners',
    columns: 'id,full_name,father_name,phone,address,notes,created_at,updated_at,province,branch_id,archived_at,first_name,surname,district,village',
    identifiers: 'national_id',
  },
}

export async function fleetDirectoryRows(kind, president) {
  const { table, columns, identifiers } = directory[kind]
  const rows = await allRows(supabase, table, columns)
  if (!president) return rows

  const privateRows = new Map()
  for (let start = 0; start < rows.length; start += 250) {
    const ids = rows.slice(start, start + 250).map(row => row.id)
    let batch
    try {
      batch = await rpc('get_fleet_identifiers', { p_kind: kind, p_ids: ids })
    } catch (error) {
      // A President can still load complete records before the SQL is deployed.
      // Once column permissions are in effect this fallback fails closed.
      if (error.code === 'PGRST202') return allRows(supabase, table, `${columns},${identifiers}`)
      throw error
    }
    for (const row of batch ?? []) privateRows.set(row.id, row)
  }
  return rows.map(row => ({ ...row, ...privateRows.get(row.id) }))
}
