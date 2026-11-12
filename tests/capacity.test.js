import { test } from 'node:test'
import assert from 'node:assert/strict'
import { capacityEntry, capacityFromEntry, vehicleWeightsFromRow, vehicleWeightsPayload } from '../src/lib/capacity.js'

test('gross and empty weights are stored independently and derive cargo tons', () => {
  assert.deepEqual(vehicleWeightsPayload({ gross: '53000', empty: '15000' }), { gross_weight_kg: '53000', empty_weight_kg: '15000', capacity_tons: '38' })
  assert.equal(vehicleWeightsPayload({ gross: '53000.125', empty: '15000.025' }).capacity_tons, '38.0001')
  assert.equal(vehicleWeightsPayload({ gross: '1.5', empty: '0' }).capacity_tons, '0.0015')
})

test('legacy cargo capacities remain untouched until gross and empty weights are entered', () => {
  const value = vehicleWeightsFromRow({ capacity_tons: '12.5' })
  assert.equal(value.gross,'')
  assert.equal(value.empty,'')
  assert.equal(vehicleWeightsPayload(value).capacity_tons,'12.5')
  assert.equal(vehicleWeightsPayload(vehicleWeightsFromRow(null)).capacity_tons,null)
})

test('two weights reject missing values, invalid ranges and unsupported precision', () => {
  for (const [gross,empty] of [['53000',''],['','15000'],['1','2'],['0','0'],['1','-1'],['NaN','1'],['1000000000','0'],['1.0001','0']]) {
    assert.throws(() => vehicleWeightsPayload({ gross, empty }), /INVALID_VEHICLE_WEIGHTS/)
  }
})

test('legacy capacity conversion preserves an empty value', () => {
  const entry = capacityEntry(null)
  assert.equal(entry.mode, 'fraction')
  assert.equal(entry.numerator, '')
  assert.equal(entry.denominator, '')
  assert.equal(capacityFromEntry(entry), null)
})

test('legacy fraction conversion preserves existing decimal and whole capacities', () => {
  for (const value of ['1','25','12.5','0.125','0.000001','0.333333','999999.999999']) {
    const entry = capacityEntry(value)
    assert.equal(entry.mode, 'fraction')
    assert.equal(Number(capacityFromEntry(entry)), Number(value))
  }
  assert.deepEqual([capacityEntry('12.5').numerator, capacityEntry('12.5').denominator], ['25','2'])
})

test('legacy fraction validation rejects zero, incomplete fractions and a zero denominator', () => {
  for (const [numerator,denominator] of [['1','0'],['0','2'],['1',''],['','2'],['1.5','2'],['-1','2']]) {
    assert.throws(() => capacityFromEntry({ mode: 'fraction', numerator, denominator }), /INVALID_CAPACITY/)
  }
})
