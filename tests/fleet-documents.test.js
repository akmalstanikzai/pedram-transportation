import { test } from 'node:test'
import assert from 'node:assert/strict'
import { documentCategories, uploadFleetDocument } from '../src/lib/fleetDocuments.js'

const job = {
  id: 'stable-document-id',
  category: 'permit',
  expiry: '2030-12-31',
  file: { name: 'permit.pdf', size: 100, type: 'application/pdf' },
}
function fixture({ uploadError, completeError, reserveError } = {}) {
  const calls = []
  return {
    calls,
    rpc: async (name, args) => {
      calls.push({ name, args })
      if (name === 'reserve_fleet_document') {
        if (reserveError) throw reserveError
        return `vehicle/parent/permit/${args.p_id}.pdf`
      }
      if (completeError) throw completeError
    },
    storage: {
      upload: async (path, file, options) => {
        calls.push({ name: 'upload', path, file, options })
        return { error: uploadError || null }
      },
    },
  }
}

test('document upload links metadata to the saved parent before storing and completing the file', async () => {
  const api = fixture()
  await uploadFleetDocument('vehicle', 'parent', job, api)
  assert.deepEqual(
    api.calls.map((call) => call.name),
    ['reserve_fleet_document', 'upload', 'complete_fleet_document'],
  )
  assert.equal(api.calls[0].args.p_parent, 'parent')
  assert.equal(api.calls[0].args.p_type, 'permit')
  assert.equal(api.calls[0].args.p_expires, '2030-12-31')
  assert.deepEqual(api.calls[1].options, { contentType: 'application/pdf', upsert: false })
  assert.equal(api.calls[2].args.p_id, job.id)
})

test('invalid files and failed reservations never write to storage', async () => {
  const invalid = fixture()
  await assert.rejects(
    uploadFleetDocument(
      'vehicle',
      'parent',
      { ...job, file: { name: 'malware.exe', size: 100, type: '' } },
      invalid,
    ),
    /INVALID_FILE/,
  )
  assert.equal(invalid.calls.length, 0)
  const denied = fixture({ reserveError: new Error('ACCESS_DENIED') })
  await assert.rejects(uploadFleetDocument('vehicle', 'parent', job, denied), /ACCESS_DENIED/)
  assert.deepEqual(
    denied.calls.map((call) => call.name),
    ['reserve_fleet_document'],
  )
})

test('failed uploads are not marked complete and retries keep the original document ID', async () => {
  const failed = fixture({ uploadError: new Error('network interrupted') })
  await assert.rejects(uploadFleetDocument('vehicle', 'parent', job, failed), /network interrupted/)
  assert.equal(
    failed.calls.some((call) => call.name === 'complete_fleet_document'),
    false,
  )
  const retried = fixture()
  await uploadFleetDocument('vehicle', 'parent', job, retried)
  assert.equal(failed.calls[0].args.p_id, retried.calls[0].args.p_id)
  assert.equal(failed.calls[1].path, retried.calls[1].path)
})

test('an uploaded object can be completed again after an interrupted completion response', async () => {
  const failed = fixture({ completeError: new Error('completion response lost') })
  await assert.rejects(
    uploadFleetDocument('vehicle', 'parent', job, failed),
    /completion response lost/,
  )
  const retry = fixture({
    uploadError: { statusCode: '409', message: 'The resource already exists' },
  })
  await uploadFleetDocument('vehicle', 'parent', job, retry)
  assert.equal(retry.calls.at(-1).name, 'complete_fleet_document')
  assert.equal(retry.calls.at(-1).args.p_id, job.id)
})

test('document guidance covers the existing supported categories for every fleet record', () => {
  assert.deepEqual(
    documentCategories.vehicle.map((item) => item[0]),
    ['photos', 'permit', 'card', 'booklet', 'international'],
  )
  assert.deepEqual(
    documentCategories.owner.map((item) => item[0]),
    ['identity'],
  )
  assert.deepEqual(
    documentCategories.driver.map((item) => item[0]),
    ['identity', 'licence', 'health', 'contract'],
  )
  for (const item of Object.values(documentCategories).flat())
    assert.ok(item.every((value) => typeof value === 'string' && value.length > 0))
})
