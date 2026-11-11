import { test } from 'node:test'
import assert from 'node:assert/strict'
import { capacityEntry, capacityFromEntry } from '../src/lib/capacity.js'

test('capacity opens as blank fraction inputs for a new vehicle', () => {
  const entry = capacityEntry(null)
  assert.equal(entry.mode, 'fraction')
  assert.equal(entry.numerator, '')
  assert.equal(entry.denominator, '')
  assert.equal(capacityFromEntry(entry), null)
})

test('fraction-only editing preserves existing decimal and whole capacities', () => {
  for (const value of ['1','25','12.5','0.125','0.000001','0.333333','999999.999999']) {
    const entry = capacityEntry(value)
    assert.equal(entry.mode, 'fraction')
    assert.equal(Number(capacityFromEntry(entry)), Number(value))
  }
  assert.deepEqual([capacityEntry('12.5').numerator, capacityEntry('12.5').denominator], ['25','2'])
})

test('capacity rejects zero, incomplete fractions and a zero denominator', () => {
  for (const [numerator,denominator] of [['1','0'],['0','2'],['1',''],['','2'],['1.5','2'],['-1','2']]) {
    assert.throws(() => capacityFromEntry({ mode: 'fraction', numerator, denominator }), /INVALID_CAPACITY/)
  }
})
