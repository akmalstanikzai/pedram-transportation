import { test } from 'node:test'
import assert from 'node:assert/strict'
import { persistVehicleOwner } from '../src/lib/vehicleOwnerCreation.js'
import { ownerFormFromRow } from '../src/lib/ownerForm.js'

const form = { ...ownerFormFromRow(null,'vehicle-branch'), first_name: 'Ahmad', surname: 'Ahmadi', phone: '0700000000' }
const progress = () => ({ saved: null, completed: new Set(), request: null })

test('owner is selected immediately and a failed upload resumes without creating another owner', async () => {
  const state = progress(), calls = [], selected = []
  let fail = true
  const args = {
    form, files: { profile_photo: { name: 'person.jpg', size: 100 }, identity: { name: 'id.pdf', size: 100 } },
    makeRequestId: () => 'request',
    async saveOwner(request) { calls.push('save'); assert.equal(request.p_data.branch_id,'vehicle-branch'); assert.equal(request.p_data.full_name,'Ahmad Ahmadi'); return 'new-owner' },
    onCreated(owner) { selected.push(owner.id) },
    async uploadPhoto(id) { assert.equal(id,'new-owner'); calls.push('photo') },
    async uploadIdentity() { calls.push('identity'); if (fail) throw new Error('connection lost') },
  }
  await assert.rejects(persistVehicleOwner(state,args), /connection lost/)
  assert.deepEqual(selected,['new-owner'])
  fail = false
  await persistVehicleOwner(state,args)
  assert.deepEqual(calls,['save','photo','identity','identity'])
  assert.deepEqual(selected,['new-owner'])
})

test('a lost save response reuses the same request ID', async () => {
  const state = progress(), requests = []
  const args = { form, files: {}, makeRequestId: () => 'original-request', onCreated() {},
    async saveOwner(request) { requests.push(request.p_request); if (requests.length === 1) throw new Error('connection lost'); return 'existing-owner' },
  }
  await assert.rejects(persistVehicleOwner(state,args), /connection lost/)
  await persistVehicleOwner(state,args)
  assert.deepEqual(requests,['original-request','original-request'])
})

test('invalid files fail before creating an owner', async () => {
  await assert.rejects(persistVehicleOwner(progress(), {
    form, files: { profile_photo: { name: 'too-large.jpg', size: 5242881 } },
    saveOwner() { assert.fail('must not save before validating files') },
  }), /INVALID_FILE/)
})
