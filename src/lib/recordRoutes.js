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

export function recordReturnRoute(value) {
  return /^#\/(?:company|expenses)(?:\?[^#]*)?$/.test(value ?? '') ? value : null
}

export function withRecordReturn(href, source) {
  if (!recordReturnRoute(source)) return href
  const [page, search] = href.split('?')
  const query = new URLSearchParams(search)
  query.set('return', source)
  return page + '?' + query
}

export function followRecordLink(event, source) {
  if (!recordReturnRoute(source) || event.defaultPrevented || event.button!==0 ||
      event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  window.history.replaceState(window.history.state,'',source)
  window.history.pushState({recordBackTo:source},'',event.currentTarget.hash)
  window.dispatchEvent(new Event('hashchange'))
}
