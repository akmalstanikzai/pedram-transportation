export const PRINT_CREDIT = 'rayan-tech-solution.tech'
const display = value => value == null || value === '' ? '—' : String(value)

// Shared table geometry for the browser/PDF preview and Android receipt images.
export function receiptSections(sections, paper = '80') {
  return sections.map(section => {
    const tables = []
    if (!section.headers) {
      const columns = paper === '80' && section.receiptColumns === 4 ? 4 : 2
      for (let index = 0; index < section.rows.length; index += columns) {
        const fields = section.rows.slice(index,index+columns)
        tables.push({headers:fields.map(row => display(row[0])),rows:[fields.map(row => display(row[1]))],widths:fields.map(() => 100/fields.length)})
      }
    } else {
      const count = section.headers.length
      const maxColumns = paper === '58' ? 2 : count === 5 || count === 6 ? 3 : 4
      if (count <= maxColumns) {
        const widths = count === 4 ? [26,34,20,20] : section.widths || section.headers.map(() => 100/count)
        tables.push({headers:section.headers.map(display),rows:section.rows.map(row => section.headers.map((_,index) => display(row[index]))),widths})
      } else {
        // Keep every field; a wide record uses consecutive small tables.
        for (const row of section.rows) {
          for (let index = 0; index < count; index += maxColumns) {
            const headers = section.headers.slice(index,index+maxColumns)
            tables.push({headers:headers.map(display),rows:[headers.map((_,offset) => display(row[index+offset]))],widths:headers.map(() => 100/headers.length),recordEnd:index+maxColumns>=count})
          }
        }
      }
    }
    return {title:section.title,tables}
  })
}
