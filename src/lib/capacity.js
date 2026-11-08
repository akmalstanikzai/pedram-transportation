// Accept whole numbers, decimal values and simple or mixed fractions.
export function parseCapacity(value) {
  const input = String(value ?? '').trim()
  if (!input) return null
  const mixed = input.match(/^(\d+)\s+(\d+)\/(\d+)$/)
  const fraction = input.match(/^(\d+)\/(\d+)$/)
  const decimal = /^(?:\d+)(?:\.\d+)?$/.test(input)
  let amount
  if (mixed) amount = Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3])
  else if (fraction) amount = Number(fraction[1]) / Number(fraction[2])
  else if (decimal) amount = Number(input)
  else throw new Error('INVALID_CAPACITY')
  if (!Number.isFinite(amount) || amount <= 0 || amount >= 1000000) throw new Error('INVALID_CAPACITY')
  const rounded = Number(amount.toFixed(6))
  if (rounded <= 0) throw new Error('INVALID_CAPACITY')
  return rounded.toString()
}
