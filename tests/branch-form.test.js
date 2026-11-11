import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initialBranchForm, branchFormFromRow, branchFormPayload } from '../src/lib/branchForm.js'

test('separate manager names and home address survive a save/edit round trip', () => {
  const form = { ...initialBranchForm, name: 'Kabul', code: ' KBL-01 ', province: 'Kabul', city: 'District 1',
    managerName: 'Ahmad', managerSurname: 'Ahmadi', managerPhone: '0700000000',
    homeProvince: 'Bamyan', homeDistrict: 'Yakawlang', homeVillage: 'Village' }
  const payload = branchFormPayload(form)
  assert.equal(payload.code, 'KBL-01')
  assert.equal(payload.manager_name, 'Ahmad Ahmadi')
  const restored = branchFormFromRow({ ...payload, manager: { first_name: payload.manager_first_name,
    surname: payload.manager_surname, full_name: payload.manager_name, phone: payload.manager_phone,
    address: payload.manager_address, home_province: payload.home_province, home_district: payload.home_district, home_village: payload.home_village } })
  assert.equal(restored.managerName, 'Ahmad')
  assert.equal(restored.managerSurname, 'Ahmadi')
  assert.equal(restored.homeDistrict, 'Yakawlang')
  assert.equal(branchFormPayload(restored).manager_address, 'Bamyan، Yakawlang، Village')
})

test('editing legacy records preserves hidden phone, national ID, full name and home address', () => {
  const form = branchFormFromRow({ name: 'Branch', phone: 'old-branch-phone', manager: {
    full_name: 'A Name With Several Words', phone: 'old-mobile', national_id: 'old-id', address: 'Original free-text address',
  } })
  const payload = branchFormPayload({ ...form, code: 'New code' })
  assert.equal(payload.manager_name, 'A Name With Several Words')
  assert.equal(payload.manager_surname, '')
  assert.equal(payload.phone, 'old-branch-phone')
  assert.equal(payload.national_id, 'old-id')
  assert.equal(payload.manager_address, 'Original free-text address')
})

test('a structured home address can be cleared without restoring stale address text', () => {
  const form = branchFormFromRow({ manager: { home_province: 'Kabul', address: 'Kabul' } })
  assert.equal(branchFormPayload({ ...form, homeProvince: '' }).manager_address, '')
})
