import { cloneElement, useEffect, useId, useRef } from 'react'
import { AlertCircle, ChevronLeft, ChevronRight, Inbox, RefreshCw, Search, X } from 'lucide-react'
import { errorText } from '../lib/operations'

export function Modal({ title, children, onClose, busy = false, wide = false, language = 'en' }) {
  const ref = useRef(null)
  const titleId = useId()
  useEffect(() => {
    const dialog = ref.current
    const previous = document.activeElement
    const overflow = document.body.style.overflow
    dialog.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      dialog.close()
      document.body.style.overflow = overflow
      previous?.focus?.()
    }
  }, [])
  return (
    <dialog
      ref={ref}
      className={`workspace-dialog ${wide ? 'dialog-wide' : ''}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
    >
      <div className="dialog-heading">
        <div>
          <span className="eyebrow-label">
            {language === 'fa' ? 'مدیریت پدرام' : 'PEDRAM WORKSPACE'}
          </span>
          <h2 id={titleId}>{title}</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          disabled={busy}
          aria-label={language === 'fa' ? 'بستن' : 'Close'}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  )
}
export function FormField({ label, wide, children, ...props }) {
  const id = useId()
  return (
    <div className={`form-field ${wide ? 'span-full' : ''}`}>
      <label htmlFor={id}>
        {label}
        {props.required ? ' *' : ''}
      </label>
      {children ? (
        cloneElement(children, { id })
      ) : (
        <input {...props} id={id} value={props.value ?? ''} />
      )}
    </div>
  )
}
export function FormSection({ title, children }) {
  return (
    <section className="form-section">
      <h3>{title}</h3>
      <div className="form-grid">{children}</div>
    </section>
  )
}
export function FormActions({ busy, onClose, language, label, busyLabel }) {
  return (
    <div className="form-actions">
      <button type="button" className="registry-secondary" disabled={busy} onClick={onClose}>
        {language === 'fa' ? 'انصراف' : 'Cancel'}
      </button>
      <button className="registry-primary" disabled={busy}>
        {busyLabel && busy
          ? busyLabel
          : busy
            ? language === 'fa'
              ? 'در حال ثبت…'
              : 'Saving…'
            : label || (language === 'fa' ? 'ثبت تغییرات' : 'Save changes')}
      </button>
    </div>
  )
}
export function Notice({ error, message, language }) {
  return !error && !message ? null : (
    <div
      className={`registry-notice ${error ? 'error' : 'success'}`}
      role={error ? 'alert' : 'status'}
    >
      {error && <AlertCircle size={18} />}
      <span>{error ? errorText(error, language) : message}</span>
    </div>
  )
}
export function PageHeading({ title, description, children }) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="page-heading-actions">{children}</div>
    </div>
  )
}
export function SearchBox({ value, onChange, label }) {
  return (
    <label className="registry-search">
      <Search size={18} />
      <input
        aria-label={label}
        placeholder={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}
export function EmptyState({ title, description, children }) {
  return (
    <div className="workspace-empty">
      <span>
        <Inbox size={28} />
      </span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {children}
    </div>
  )
}
export function Loading({ language }) {
  return (
    <div className="workspace-loading" role="status">
      <span className="spinner dark" />
      {language === 'fa' ? 'در حال بارگیری…' : 'Loading records…'}
    </div>
  )
}
export function RefreshButton({ loading, onClick, language }) {
  return (
    <button
      className="registry-secondary"
      disabled={loading}
      onClick={onClick}
      aria-label={language === 'fa' ? 'تازه‌سازی' : 'Refresh'}
    >
      <RefreshCw size={16} />
    </button>
  )
}
export function Pagination({ page, setPage, count, language, size = 15 }) {
  const pages = Math.max(1, Math.ceil(count / size))
  return (
    <div className="pagination">
      <span>
        {count.toLocaleString('en-US')} {language === 'fa' ? 'سابقه' : 'records'}
      </span>
      <div>
        <button
          className="icon-button"
          aria-label={language === 'fa' ? 'صفحه قبلی' : 'Previous page'}
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
        >
          <ChevronLeft size={17} />
        </button>
        <span>
          {page} / {pages}
        </span>
        <button
          className="icon-button"
          aria-label={language === 'fa' ? 'صفحه بعدی' : 'Next page'}
          disabled={page >= pages}
          onClick={() => setPage(page + 1)}
        >
          <ChevronRight size={17} />
        </button>
      </div>
    </div>
  )
}
