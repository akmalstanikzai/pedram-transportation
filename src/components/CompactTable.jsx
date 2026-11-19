export default function CompactTable({ label, columns, children, className = '' }) {
  return <div className={`compact-table-frame ${className}`}>
    <table className="compact-table" aria-label={label}>
      <colgroup>{columns.map(({ label, width }) => <col key={label} style={width ? { width } : undefined} />)}</colgroup>
      <thead><tr>{columns.map(({ label }) => <th key={label} scope="col">{label}</th>)}</tr></thead>
      <tbody>{children}</tbody>
    </table>
  </div>
}
