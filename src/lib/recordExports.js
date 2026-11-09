const printStyles = `
  @page { size: A4; margin: 13mm; }
  * { box-sizing: border-box; }
  body { color: #1b2b3c; font: 10pt/1.45 system-ui, sans-serif; margin: 0; }
  .document { max-width: 184mm; margin: 0 auto; }
  .print-toolbar { max-width: 184mm; margin: 16px auto; text-align: end; }
  button { font: inherit; padding: 7px 12px; cursor: pointer; }
  header { display: flex; gap: 16px; align-items: center; border-bottom: 2px solid #194a64; padding-bottom: 12px; margin-bottom: 14px; }
  .logo { width: 70px; height: 66px; object-fit: contain; flex: none; }
  .company { color: #194a64; font-size: 10pt; font-weight: 700; }
  h1 { margin: 2px 0 0; font-size: 20pt; line-height: 1.25; }
  .subtitle { margin: 3px 0 0; color: #43586a; }
  h2 { margin: 14px 0 5px; font-size: 11pt; color: #194a64; break-after: avoid; }
  table { border-collapse: collapse; width: 100%; table-layout: fixed; }
  th, td { border: 1px solid #ccd7e0; padding: 5px 8px; text-align: start; vertical-align: top; overflow-wrap: anywhere; }
  th { background: #edf3f7; color: #213a4c; font-weight: 650; }
  .details th { width: 33%; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  .numeric { text-align: end; font-variant-numeric: tabular-nums; }
  .report-note { margin: 10px 0; color: #43586a; }
  @media screen { body { padding: 0 16px 24px; } }
  @media print {
    body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .print-toolbar { display: none; }
  }
`

export function printRecord({ language, title, subtitle, sections, note }) {
  const printWindow = window.open('', '_blank')
  if (!printWindow) return false
  printWindow.opener = null
  const doc = printWindow.document
  const dari = language === 'fa'
  const company = dari ? 'شرکت ترانسپورتی بین‌المللی پدرام' : 'Pedram International Transport'
  doc.documentElement.lang = dari ? 'fa' : 'en'
  doc.documentElement.dir = dari ? 'rtl' : 'ltr'
  doc.title = title

  function append(parent, tag, value, className) {
    const node = doc.createElement(tag)
    if (value != null) node.textContent = value
    if (className) node.className = className
    parent.append(node)
    return node
  }

  append(doc.head, 'style', printStyles)
  const toolbar = append(doc.body, 'div', null, 'print-toolbar')
  const button = append(toolbar, 'button', dari ? 'چاپ / ذخیره PDF' : 'Print / Save PDF')
  const document = append(doc.body, 'main', null, 'document')
  const header = append(document, 'header')
  const logo = append(header, 'img', null, 'logo')
  logo.alt = 'Pedram'
  logo.src = new URL(`${import.meta.env.BASE_URL}pedram-logo.jpeg`, window.location.href).href
  const heading = append(header, 'div')
  append(heading, 'div', company, 'company')
  append(heading, 'h1', title)
  if (subtitle) append(heading, 'p', subtitle, 'subtitle')

  for (const section of sections) {
    if (section.title) append(document, 'h2', section.title)
    const table = append(document, 'table', null, section.headers ? '' : 'details')
    if (section.widths) {
      const columns = append(table, 'colgroup')
      section.widths.forEach(width => { append(columns, 'col').style.width = `${width}%` })
    }
    if (section.headers) {
      const row = append(append(table, 'thead'), 'tr')
      section.headers.forEach((value, index) => {
        append(row, 'th', value, section.numeric?.includes(index) ? 'numeric' : '').scope = 'col'
      })
    }
    const body = append(table, 'tbody')
    for (const values of section.rows) {
      const row = append(body, 'tr')
      values.forEach((value, index) => {
        const tag = !section.headers && index === 0 ? 'th' : 'td'
        const cell = append(row, tag, value === '' || value == null ? '—' : value,
          section.numeric?.includes(index) ? 'numeric' : '')
        if (tag === 'th') cell.scope = 'row'
      })
    }
  }
  if (note) append(document, 'p', note, 'report-note')

  const ready = Promise.all([logo.decode().catch(() => {}), doc.fonts.ready])
  const print = () => void ready.then(() => {
    if (!printWindow.closed) {
      printWindow.focus()
      printWindow.print()
    }
  })
  button.onclick = print
  print()
  return true
}
