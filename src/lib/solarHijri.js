import { isValidJalaaliDate, jalaaliMonthLength, toGregorian, toJalaali } from 'jalaali-js'

const isoPattern = /^(\d{4})-(\d{2})-(\d{2})$/
const solarPattern = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/

function pad(value) { return String(value).padStart(2, '0') }

export function todayISO() {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Kabul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const part = type => parts.find(item => item.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function formatSolarHijri(value, fallback = '—') {
  if (!value) return fallback
  const match = String(value).slice(0, 10).match(isoPattern)
  if (!match) return fallback
  const j = toJalaali(Number(match[1]), Number(match[2]), Number(match[3]))
  return `${j.jy}/${pad(j.jm)}/${pad(j.jd)}`
}

export function solarHijriToISO(value) {
  const match = String(value || '').trim().match(solarPattern)
  if (!match) return null
  const [jy, jm, jd] = match.slice(1).map(Number)
  if (!isValidJalaaliDate(jy, jm, jd)) return null
  const g = toGregorian(jy, jm, jd)
  return `${g.gy}-${pad(g.gm)}-${pad(g.gd)}`
}

export function solarHijriToday() {
  const match = todayISO().match(isoPattern)
  const j = toJalaali(Number(match[1]), Number(match[2]), Number(match[3]))
  return { year: j.jy, month: j.jm, day: j.jd }
}

export function solarHijriMonthLength(year, month) { return jalaaliMonthLength(year, month) }

export function solarHijriWeekday(year, month, day) {
  const g = toGregorian(year, month, day)
  return (new Date(Date.UTC(g.gy, g.gm - 1, g.gd)).getUTCDay() + 1) % 7
}

export function solarHijriToISODate(year, month, day) {
  if (!isValidJalaaliDate(year, month, day)) return null
  const g = toGregorian(year, month, day)
  return `${g.gy}-${pad(g.gm)}-${pad(g.gd)}`
}
