import { test } from 'node:test'
import assert from 'node:assert/strict'
import { driverFormFromRow, driverFormPayload } from '../src/lib/driverForm.js'

test('new driver form saves separate names, two mobile numbers and structured address', () => {
  const form = { ...driverFormFromRow(null, 'branch'), first_name: ' Ahmad ', surname: ' Ahmadi ', phone: ' 0700000000 ', phone_secondary: ' 0700000001 ', province: ' Kabul ', district: 'District', village: 'Village' }
  const payload = driverFormPayload(form)
  assert.equal(payload.full_name, 'Ahmad Ahmadi')
  assert.equal(payload.phone, '0700000000')
  assert.equal(payload.phone_secondary, '0700000001')
  assert.equal(payload.address, 'Kabul، District، Village')
  const restored = driverFormFromRow(payload)
  assert.equal(restored.first_name, 'Ahmad')
  assert.equal(restored.surname, 'Ahmadi')
  assert.equal(restored.district, 'District')
  assert.equal(restored.branch_id, 'branch')
})

test('editing legacy driver data preserves names and removed fields without guessing a surname', () => {
  const old = { full_name: 'Name With Several Words', national_id: 'original-id', license_number: 'original-licence', previous_company: 'Previous employer', address: 'Original home address', phone: '0700000000', branch_id: 'original-branch' }
  const form = driverFormFromRow(old, 'another-branch')
  const payload = driverFormPayload(form)
  for (const key of Object.keys(old)) assert.equal(payload[key], old[key], key)
  assert.equal(payload.surname, '')
  assert.equal(payload.phone_secondary, '')
  assert.ok(!('legacy_address' in payload))
})

test('structured driver address can be cleared without resurrecting a stale address', () => {
  const form = driverFormFromRow({ province: 'Kabul', address: 'Kabul', phone: '0700000000' })
  assert.equal(driverFormPayload({ ...form, province: '' }).address, '')
})
