import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ownerFormFromRow, ownerFormPayload } from '../src/lib/ownerForm.js'

test('new owner saves separate names and structured address while retaining notes', () => {
  const payload = ownerFormPayload({ ...ownerFormFromRow(null, 'branch'), first_name: ' Ahmad ', surname: ' Ahmadi ', phone: '0700000000', province: 'Kabul', district: 'District', village: 'Village', notes: 'Original notes' })
  assert.equal(payload.full_name, 'Ahmad Ahmadi')
  assert.equal(payload.address, 'Kabul، District، Village')
  assert.equal(payload.notes, 'Original notes')
  const roundTrip = ownerFormPayload(ownerFormFromRow(payload))
  for (const key of ['first_name','surname','address','province','district','village','notes','branch_id']) assert.equal(roundTrip[key], payload[key], key)
})

test('legacy owner province must not overwrite the original free-text address on repeated edits', () => {
  const old = { full_name: 'Name With Several Words', phone: '0700000000', province: 'Kabul', address: 'Original full address', national_id: 'original-id', notes: 'Keep notes' }
  let saved = old
  for (let attempt = 0; attempt < 3; attempt++) {
    saved = ownerFormPayload(ownerFormFromRow(saved))
    for (const key of Object.keys(old)) assert.equal(saved[key], old[key], key)
    assert.equal(saved.surname, '')
    assert.ok(!('original_address_fields' in saved))
    assert.ok(!('legacy_address' in saved))
  }
})

test('changing and clearing address fields replaces the old address intentionally', () => {
  const old = { province: 'Kabul', address: 'Original address' }
  const form = ownerFormFromRow(old)
  assert.equal(ownerFormPayload({ ...form, district: 'District' }).address, 'Kabul، District')
  assert.equal(ownerFormPayload({ ...form, province: '' }).address, '')
})
