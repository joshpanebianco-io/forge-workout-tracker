import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatWeight(kg: number) {
  if (!Number.isFinite(kg)) return "—"
  return kg % 1 === 0 ? `${kg}` : kg.toFixed(1)
}

export function fmtMinutes(min: number) {
  const m = Math.round(min)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r === 0 ? `${h}h` : `${h}h ${r}m`
}

export function formatDate(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d
  return date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })
}

export function formatTime(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
}

export function relativeDay(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(date)
  target.setHours(0, 0, 0, 0)
  const diff = Math.round((today.getTime() - target.getTime()) / 86_400_000)
  if (diff === 0) return "Today"
  if (diff === 1) return "Yesterday"
  if (diff < 7) return `${diff}d ago`
  if (diff < 30) return `${Math.floor(diff / 7)}w ago`
  return `${Math.floor(diff / 30)}mo ago`
}

export function startOfWeek(d: Date) {
  const date = new Date(d)
  const day = date.getDay()
  const offset = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + offset)
  date.setHours(0, 0, 0, 0)
  return date
}

export function addDays(d: Date, n: number) {
  const date = new Date(d)
  date.setDate(date.getDate() + n)
  return date
}

export function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function formatWeekRange(start: Date) {
  const end = addDays(start, 6)
  const sameMonth = start.getMonth() === end.getMonth()
  const monthFmt: Intl.DateTimeFormatOptions = { month: "short" }
  if (sameMonth) {
    return `${start.toLocaleDateString(undefined, monthFmt)} ${start.getDate()} – ${end.getDate()}`
  }
  return `${start.toLocaleDateString(undefined, monthFmt)} ${start.getDate()} – ${end.toLocaleDateString(undefined, monthFmt)} ${end.getDate()}`
}

export function startOfMonth(d: Date) {
  const date = new Date(d.getFullYear(), d.getMonth(), 1)
  date.setHours(0, 0, 0, 0)
  return date
}

export function startOfDay(d: Date) {
  const date = new Date(d)
  date.setHours(0, 0, 0, 0)
  return date
}

// Local-timezone YYYY-MM-DD. Use as a Map/Set key when bucketing by day.
// Avoids `.toISOString().slice(0,10)`, which silently shifts to the UTC day.
export function localDayKey(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function localMonthKey(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  return `${y}-${m}`
}

export function addMonths(d: Date, n: number) {
  const date = new Date(d)
  date.setMonth(date.getMonth() + n)
  return date
}

export function weekLabel(start: Date, now = new Date()) {
  const thisWeek = startOfWeek(now)
  const lastWeek = addDays(thisWeek, -7)
  if (isSameDay(start, thisWeek)) return "This week"
  if (isSameDay(start, lastWeek)) return "Last week"
  const weeksAgo = Math.round((thisWeek.getTime() - start.getTime()) / (7 * 86_400_000))
  if (weeksAgo > 0 && weeksAgo < 8) return `${weeksAgo} weeks ago`
  return formatWeekRange(start)
}
