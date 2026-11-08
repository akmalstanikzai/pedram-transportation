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

export function capacityParts(value) {
  const input = String(value ?? '').trim()
  if (!input) return { whole: '', numerator: '', denominator: '' }
  const [whole, decimal = ''] = input.split('.')
  if (!decimal || Number(decimal) === 0) return { whole, numerator: '', denominator: '' }
  let numerator = Number(decimal)
  let denominator = 10 ** decimal.length
  const gcd = (a, b) => b ? gcd(b, a % b) : a
  const divisor = gcd(numerator, denominator)
  numerator /= divisor
  denominator /= divisor
  return { whole, numerator: String(numerator), denominator: String(denominator) }
}

export function capacityFromParts({ whole, numerator, denominator }) {
  const cleanWhole = String(whole).trim()
  const cleanNumerator = String(numerator).trim()
  const cleanDenominator = String(denominator).trim()
  if (!cleanWhole && !cleanNumerator && !cleanDenominator) return null
  if ((cleanWhole && !/^\d+$/.test(cleanWhole)) || (cleanNumerator && !/^\d+$/.test(cleanNumerator)) || (cleanDenominator && !/^\d+$/.test(cleanDenominator))) throw new Error('INVALID_CAPACITY')
  if (!!cleanNumerator !== !!cleanDenominator) throw new Error('INVALID_CAPACITY')
  const amount = Number(cleanWhole || 0) + (cleanNumerator ? Number(cleanNumerator) / Number(cleanDenominator) : 0)
  if (cleanDenominator && Number(cleanDenominator) === 0) throw new Error('INVALID_CAPACITY')
  if (!Number.isFinite(amount) || amount <= 0 || amount >= 1000000) throw new Error('INVALID_CAPACITY')
  return Number(amount.toFixed(6)).toString()
}
