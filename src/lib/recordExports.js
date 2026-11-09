export function printRecord({ language, title, subtitle, sections }) {
  const printWindow = window.open('', '_blank')
  if (!printWindow) return false
  printWindow.opener = null
  const doc = printWindow.document
  doc.documentElement.lang = language === 'fa' ? 'fa' : 'en'
  doc.documentElement.dir = language === 'fa' ? 'rtl' : 'ltr'
  doc.title = title

  function append(parent, tag, value) {
    const node = doc.createElement(tag)
    if (value != null) node.textContent = value
    parent.append(node)
    return node
  }

  append(doc.head, 'style', `
    body { font: 14px/1.5 system-ui, sans-serif; color: #172033; margin: 24px; }
    h1 { margin: 0; } h2 { font-size: 16px; margin-block: 24px 8px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #d5dbe4; padding: 7px 10px; text-align: start; overflow-wrap: anywhere; }
    th { background: #edf2f7; } tr { break-inside: avoid; }
    @media print { button { display: none; } }
  `)
  append(doc.body, 'h1', title)
  if (subtitle) append(doc.body, 'p', subtitle)
  const button = append(doc.body, 'button', language === 'fa' ? 'چاپ / ذخیره PDF' : 'Print / Save PDF')
  button.onclick = () => printWindow.print()
  for (const section of sections) {
    if (section.title) append(doc.body, 'h2', section.title)
    const table = append(doc.body, 'table')
    if (section.headers) {
      const header = append(append(table, 'thead'), 'tr')
      section.headers.forEach(value => append(header, 'th', value))
    }
    const body = append(table, 'tbody')
    for (const values of section.rows) {
      const row = append(body, 'tr')
      values.forEach(value => append(row, 'td', value ?? '—'))
    }
  }
  printWindow.focus()
  printWindow.print()
  return true
}

export function downloadCsv(filename, rows) {
  const cell = value => {
    let content = String(value ?? '')
    // Treat text beginning with spreadsheet formula characters as literal text.
    if (typeof value === 'string' && /^(?:\s*[=+@-]|[\t\r\n])/.test(content)) content = "'" + content
    return '"' + content.replaceAll('"', '""') + '"'
  }
  const csv = rows.map(row => row.map(cell).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
