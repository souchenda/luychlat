import { addMonths, format, startOfMonth } from "date-fns"

/** "YYYY-MM" for a local month. */
export type MonthKey = string

export function monthKey(date: Date = new Date()): MonthKey {
  return format(date, "yyyy-MM")
}

export function monthStart(key: MonthKey): Date {
  const [y, m] = key.split("-").map(Number)
  return new Date(y, m - 1, 1)
}

/** ISO bounds [from, to) of a local calendar month, for transaction filters. */
export function monthRange(key: MonthKey): { from: string; to: string } {
  const start = monthStart(key)
  return { from: start.toISOString(), to: addMonths(start, 1).toISOString() }
}

/** The last `count` months ending with `key`, oldest first. */
export function recentMonths(count: number, key: MonthKey = monthKey()): MonthKey[] {
  const end = startOfMonth(monthStart(key))
  return Array.from({ length: count }, (_, i) => monthKey(addMonths(end, i - count + 1)))
}

/** Value for <input type="date"> from an ISO timestamp (local date). */
export function toDateInput(iso: string): string {
  return format(new Date(iso), "yyyy-MM-dd")
}

/**
 * ISO timestamp for a picked date. Today keeps the current time (so the
 * newest entry sorts first); other days get local noon, away from midnight
 * edges when crossing time zones.
 */
export function fromDateInput(value: string, previousIso?: string): string {
  const [y, m, d] = value.split("-").map(Number)
  if (previousIso && toDateInput(previousIso) === value) return previousIso
  const now = new Date()
  if (now.getFullYear() === y && now.getMonth() === m - 1 && now.getDate() === d) return now.toISOString()
  return new Date(y, m - 1, d, 12).toISOString()
}
