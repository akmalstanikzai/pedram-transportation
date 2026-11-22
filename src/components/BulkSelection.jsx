import { Children, cloneElement, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Modal } from './RecordTools'
import { explain } from '../lib/operations'
import './BulkSelection.css'

export function useBulkSelection({ bulk, children }) {
  const [checked, setChecked] = useState([])
  const [action, setAction] = useState(null)
  const [value, setValue] = useState('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState(null)
  const lock = useRef(false)
  const t = (en, fa) => bulk?.language === 'fa' ? fa : en
  if (!bulk) return { rows: children }

  const eligible = new Map(bulk.rows.map(row => [String(row.id), row]))
  const selected = checked.filter(id => eligible.has(id))
  const allChecked = eligible.size > 0 && selected.length === eligible.size
  const disabled = running || bulk.disabled
  const visible = eligible.size > 0
  const chosen = selected.map(id => eligible.get(id)).filter(row => !action?.eligible || action.eligible(row))

  function toggle(id) {
    setResult(null)
    setChecked(current => current.includes(id) ? current.filter(key => key !== id) : [...selected, id])
  }

  async function apply(event) {
    event.preventDefault()
    if (lock.current || disabled || !chosen.length || (action.field && !value.trim())) return
    lock.current = true
    setRunning(true)
    const completed = new Set()
    const failures = []
    const byOperation = new Map()
    for (const row of chosen) {
      const key = action.operationKey?.(row) ?? row.id
      const group = byOperation.get(key) || []
      group.push(row)
      byOperation.set(key, group)
    }
    for (const group of byOperation.values()) {
      try {
        await action.run(group[0], value.trim())
        group.forEach(row => completed.add(String(row.id)))
      } catch (error) {
        failures.push({ id:group[0].id, label:bulk.name?.(group[0]) || group[0].name || group[0].full_name, message:explain(error,bulk.language) })
      }
    }
    setChecked(selected.filter(id => !completed.has(id)))
    let refreshFailed = false
    try { await bulk.refresh?.() } catch { refreshFailed = true }
    setResult({ count:completed.size, failures, refreshFailed })
    setAction(null)
    setRunning(false)
    lock.current = false
  }

  return {
    visible,
    heading: <label><input type="checkbox" aria-label={t('Select all visible records','انتخاب همه موارد نمایان')}
      checked={allChecked} disabled={disabled} onChange={() => { setChecked(allChecked ? [] : [...eligible.keys()]); setResult(null) }}/></label>,
    rows: visible ? Children.map(children, row => {
      if (row?.type !== 'tr') return row
      const id = String(row.key)
      if (!eligible.has(id)) {
        const cells = Children.toArray(row.props.children)
        if (cells.length === 1 && cells[0]?.props.colSpan) return cloneElement(row, {}, cloneElement(cells[0], { colSpan:cells[0].props.colSpan + 1 }))
      }
      const record = eligible.get(id)
      return cloneElement(row, {}, <td className="bulk-check">{record && <label>
        <input type="checkbox" checked={selected.includes(id)} disabled={disabled}
          aria-label={[t('Select record','انتخاب ریکارد'), bulk.name?.(record) || record.full_name || record.name].filter(Boolean).join(' · ')}
          onChange={() => toggle(id)}/>
      </label>}</td>, row.props.children)
    }) : children,
    controls: <>
      {selected.length > 0 && <div className="bulk-actions">
        <strong aria-live="polite">{selected.length} {t('selected','انتخاب‌شده')}</strong>
        {bulk.actions.map(next => <button key={next.label} type="button" className="registry-secondary"
          disabled={disabled || (next.eligible && !selected.some(id => next.eligible(eligible.get(id))))}
          onClick={() => { setValue(''); setAction(next) }}>{next.label}</button>)}
        <button type="button" className="registry-secondary" disabled={disabled} onClick={() => setChecked([])}>{t('Clear','پاک کردن')}</button>
      </div>}
      {result && <div className="bulk-result" role="status">
        {result.count} {t('updated','به‌روز شد')} · {result.failures.length} {t('failed','ناموفق')}
        {!!result.failures.length && <ul>{result.failures.map(item => <li key={item.id}>{item.label && <strong>{item.label} · </strong>}{item.message}</li>)}</ul>}
        {result.refreshFailed && <p>{t('Refresh to see the latest records.','برای دیدن تازه‌ترین ریکاردها صفحه را تازه کنید.')}</p>}
      </div>}
    </>,
    dialog: action && createPortal(<div onKeyDown={event => event.stopPropagation()}><Modal title={action.label} onClose={() => setAction(null)} busy={running}>
      <form className="registry-form" onSubmit={apply}>
        <p className="wide">{t('Apply this action to the selected records?','این عمل بالای موارد انتخاب‌شده اجرا شود؟')} <strong>({chosen.length})</strong></p>
        {action.field && <label className="wide"><span>{action.field} *</span>
          <input required maxLength={action.maxLength || 500} value={value} disabled={running} onChange={event => setValue(event.target.value)}/>
        </label>}
        <div className="registry-form-actions">
          <button type="button" disabled={running} onClick={() => setAction(null)}>{t('Cancel','انصراف')}</button>
          <button className="registry-primary" disabled={disabled || !chosen.length}>{running ? t('Working…','در حال اجرا…') : action.label}</button>
        </div>
      </form>
    </Modal></div>, document.body),
  }
}
