/**
 * «ប្រាក់ហោប៉ៅកូន» (founder, 9/11/2026 — migration 20270307000000_kids_allowance): which children's pocket money is due.
 * Pure. Due = the latest allowance day on or before today (Cambodia), not before the allowance was set up, and not yet
 * given on or after it — so a missed day is still asked (never skipped), and a given week never asked twice.
 */
export type Allowance = {
  id: string
  wallet_id: string
  from_wallet_id: string | null
  amount: number
  /** 0 Sunday … 6 Saturday. */
  weekday: number
  given_on: string | null
  created_at: string
}

const WEEKDAY_NAMES = {
  km: ["អាទិត្យ", "ច័ន្ទ", "អង្គារ", "ពុធ", "ព្រហស្បតិ៍", "សុក្រ", "សៅរ៍"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  zh: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"],
} as const
export const weekdayName = (weekday: number, locale: "km" | "en" | "zh") => WEEKDAY_NAMES[locale][weekday] ?? ""

/** Today's weekday for a YYYY-MM-DD date. */
export const weekdayOf = (ymd: string) => new Date(`${ymd}T12:00:00Z`).getUTCDay()

/** The latest date (YYYY-MM-DD) on or before `today` that falls on `weekday`. */
export function lastOccurrence(weekday: number, today: string): string {
  const back = (weekdayOf(today) - weekday + 7) % 7
  return new Date(Date.parse(`${today}T12:00:00Z`) - back * 86_400_000).toISOString().slice(0, 10)
}

/** Cambodian date of a stored time. */
const cambodiaDate = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3_600_000).toISOString().slice(0, 10)

export function allowanceDue(a: Pick<Allowance, "weekday" | "given_on" | "created_at">, today: string): string | null {
  const day = lastOccurrence(a.weekday, today)
  if (day < cambodiaDate(a.created_at)) return null
  if (a.given_on && a.given_on >= day) return null
  return day
}
