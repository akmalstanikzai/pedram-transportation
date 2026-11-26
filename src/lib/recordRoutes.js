export function recordQuery() {
  return new URLSearchParams(globalThis.window?.location?.hash?.split('?')[1])
}

export function recordLink(page, params = {}) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== '') query.set(key, value)
  }
  return '#/' + page + (query.size ? '?' + query : '')
}

export function cashbookRecordLink(row, currency = row.currency) {
  return recordLink('cashbook', {
    account: row.branch_id || 'admin',
    currency,
    date: row.entry_date || row.date,
    receipt: (row.receipt_number ?? row.number) || null,
  })
}
