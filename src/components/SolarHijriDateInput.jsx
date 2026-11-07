import { useEffect, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { formatSolarHijri, solarHijriMonthLength, solarHijriToday, solarHijriToISODate, solarHijriWeekday } from '../lib/solarHijri'

const months = { en: ['Hamal', 'Sawr', 'Jawza', 'Saratan', 'Asad', 'Sunbula', 'Mizan', 'Aqrab', 'Qaws', 'Jadi', 'Dalwa', 'Hut'], fa: ['حمل', 'ثور', 'جوزا', 'سرطان', 'اسد', 'سنبله', 'میزان', 'عقرب', 'قوس', 'جدی', 'دلو', 'حوت'] }
const weekdays = { en: ['Sa', 'Su', 'Mo', 'Tu', 'We', 'Th', 'Fr'], fa: ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'] }

function monthFromValue(value) {
  if (!value) return solarHijriToday()
  const parts = formatSolarHijri(value, '').split('/').map(Number)
  return parts.length === 3 ? { year: parts[0], month: parts[1], day: parts[2] } : solarHijriToday()
}

export default function SolarHijriDateInput({ value = '', onChange, min, max, required = false, disabled = false, ariaLabel, language = 'en' }) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => monthFromValue(value))
  const root = useRef(null)
  const chosen = formatSolarHijri(value, '')
  const selected = chosen.split('/').map(Number)
  const isDari = language === 'fa'
  useEffect(() => {
    const close = event => { if (!root.current?.contains(event.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  function move(delta) { setView(current => { const month = current.month + delta; return month < 1 ? { ...current, year: current.year - 1, month: 12 } : month > 12 ? { ...current, year: current.year + 1, month: 1 } : { ...current, month } }) }
  function select(day) { const iso = solarHijriToISODate(view.year, view.month, day); if (!iso || (min && iso < min) || (max && iso > max)) return; onChange(iso); setOpen(false) }
  const blanks = Array.from({ length: solarHijriWeekday(view.year, view.month, 1) }, (_, index) => <span key={`blank-${index}`} />)
  const days = Array.from({ length: solarHijriMonthLength(view.year, view.month) }, (_, index) => { const day = index + 1; const iso = solarHijriToISODate(view.year, view.month, day); const unavailable = !!((min && iso < min) || (max && iso > max)); const active = selected[0] === view.year && selected[1] === view.month && selected[2] === day; return <button key={day} type="button" disabled={unavailable} className={active ? 'selected' : ''} onClick={() => select(day)}>{day}</button> })
  return <span className="solar-date-picker" ref={root}>
    <button type="button" className="solar-date-trigger" disabled={disabled} aria-label={ariaLabel} aria-haspopup="dialog" aria-expanded={open} onClick={() => { setView(monthFromValue(value)); setOpen(current => !current) }}><CalendarDays size={16} /><bdi dir="ltr">{chosen || '—'}</bdi></button>
    {!required && value && <button type="button" className="solar-date-clear" disabled={disabled} aria-label={isDari ? 'پاک کردن تاریخ' : 'Clear date'} onClick={() => onChange('')}><X size={14} /></button>}
    {open && <span className="solar-date-popover" role="dialog" aria-label={ariaLabel} dir={isDari ? 'rtl' : 'ltr'}><span className="solar-date-toolbar"><button type="button" aria-label={isDari ? 'ماه قبل' : 'Previous month'} onClick={() => move(-1)}><ChevronLeft size={18} /></button><strong><bdi dir="ltr">{view.year}</bdi> {months[isDari ? 'fa' : 'en'][view.month - 1]}</strong><button type="button" aria-label={isDari ? 'ماه بعد' : 'Next month'} onClick={() => move(1)}><ChevronRight size={18} /></button></span><span className="solar-date-weekdays">{weekdays[isDari ? 'fa' : 'en'].map(day => <b key={day}>{day}</b>)}</span><span className="solar-date-days">{blanks}{days}</span></span>}
  </span>
}
