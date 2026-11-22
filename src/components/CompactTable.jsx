import { useBulkSelection } from './BulkSelection'

export default function CompactTable({ label, columns, children, className = '', bulk }) {
  const selection = useBulkSelection({ bulk, children })
  return <>{selection.controls}<div className={`compact-table-frame ${className}`}>
    <table className="compact-table" aria-label={label}>
      <colgroup>{selection.visible && <col style={{width:'34px'}}/>}{columns.map(({ label, width }) => <col key={label} style={width ? { width } : undefined} />)}</colgroup>
      <thead><tr>{selection.visible && <th scope="col" className="bulk-check">{selection.heading}</th>}{columns.map(({ label }) => <th key={label} scope="col">{label}</th>)}</tr></thead>
      <tbody>{selection.rows}</tbody>
    </table>
  </div>{selection.dialog}</>
}
