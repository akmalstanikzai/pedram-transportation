export function capacityEntry(value) {
  const empty = { mode: 'fraction', number: '', numerator: '', denominator: '' }
  if (value == null || value === '') return empty
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0 || amount >= 1000000) throw new Error('INVALID_CAPACITY')
  // Stored capacities have six decimal places. Restore them exactly rather
  // than clearing or rounding an existing capacity when editing a vehicle.
  const numerator = Math.round(amount * 1000000)
  const gcd = (a, b) => b ? gcd(b, a % b) : a
  const divisor = gcd(numerator, 1000000)
  return { ...empty, numerator: String(numerator / divisor), denominator: String(1000000 / divisor) }
}

export function capacityFromEntry({ mode, number, numerator, denominator }) {
  if (mode === 'number') {
    const input = String(number).trim()
    if (!input) return null
    if (!/^\d+(?:\.\d+)?$/.test(input)) throw new Error('INVALID_CAPACITY')
    const amount = Number(input)
    if (!Number.isFinite(amount) || amount <= 0 || amount >= 1000000 || Number(amount.toFixed(6)) !== amount) throw new Error('INVALID_CAPACITY')
    return amount.toString()
  }
  if (mode !== 'fraction') throw new Error('INVALID_CAPACITY')
  const top = String(numerator).trim()
  const bottom = String(denominator).trim()
  if (!top && !bottom) return null
  if (!/^\d+$/.test(top) || !/^\d+$/.test(bottom)) throw new Error('INVALID_CAPACITY')
  const amount = Number(top) / Number(bottom)
  if (!Number.isFinite(amount) || amount <= 0 || amount >= 1000000) throw new Error('INVALID_CAPACITY')
  const rounded = Number(amount.toFixed(6))
  if (rounded <= 0) throw new Error('INVALID_CAPACITY')
  return rounded.toString()
}
