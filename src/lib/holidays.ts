import type { MessageKey } from "@/lib/i18n/dictionaries"

/**
 * One-line greeting on Home, from the real festival dates.
 *
 * Pchum Ben: the main day is 15 rorch of Photrobot (ភ្ជុំធំ), the middle day of
 * the 3-day public holiday (14 rorch, 15 rorch, 1 kert). The 14 days before it
 * are Kan Ben 1–14 (from 1 rorch). The lunar date moves every year and some
 * years add a leap month, so the dates are listed per year from the official
 * holiday calendar instead of being computed: add each new year here (the
 * holiday list is published in advance). Years without an entry simply show
 * the everyday greeting.
 */
const PCHUM_BEN: Record<number, string> = {
  2026: "2026-10-11", // holiday 10–12 Oct 2026
  2027: "2027-09-30", // holiday 29 Sep – 1 Oct 2027
}

/** Other festivals, by exact date range (inclusive, YYYY-MM-DD or every year MM-DD). */
const FESTIVALS: [MessageKey, string, string][] = [
  ["holiday.new_year", "01-01", "01-01"],
  ["holiday.khmer_new_year", "04-14", "04-16"],
  ["holiday.water_festival", "2026-11-23", "2026-11-25"],
  ["holiday.water_festival", "2027-11-12", "2027-11-14"],
  ["holiday.chinese_new_year", "2027-02-06", "2027-02-06"],
  ["holiday.christmas", "12-25", "12-25"],
]

export type Greeting = { key: MessageKey; params?: Record<string, string | number> }

const pad = (n: number) => String(n).padStart(2, "0")
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
/** Whole days from `a` to `b` (local calendar dates). */
const daysBetween = (a: Date, b: Date) =>
  Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 864e5)

export function homeGreeting(date = new Date()): Greeting {
  const pchum = PCHUM_BEN[date.getFullYear()]
  if (pchum) {
    const [y, m, d] = pchum.split("-").map(Number)
    const until = daysBetween(date, new Date(y, m - 1, d))
    // 14 days before the main day = Ben 1, … 1 day before = Ben 14.
    if (until >= 1 && until <= 14) return { key: "holiday.kan_ben", params: { day: 15 - until } }
    // Pchum day itself and the holiday after it (1 kert).
    if (until === 0 || until === -1) return { key: "holiday.pchum_ben" }
  }
  const full = ymd(date)
  const monthDay = full.slice(5)
  for (const [key, from, to] of FESTIVALS) {
    const value = from.length === 5 ? monthDay : full
    if (value >= from && value <= to) return { key }
  }
  return { key: "holiday.everyday" }
}
