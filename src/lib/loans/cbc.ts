/**
 * Credit Bureau Cambodia (CBC) — the 24-month repayment history codes (founder, 20/10/2026): the guide's table, and an
 * in-app strip of a loan's last 24 cycles from what the member recorded here. The strip is the app's own estimate, never
 * the official CBC report — it says so wherever it shows (no silent guessing). Pure (cbc.test.ts).
 *
 * A cycle's code: paid with its date recorded (the 1-tap installment) → days late = paid − due: 0 on time, 1 for 1–29
 * days, 2 for 30–59, «3+» from 60 (the CBC's further letters, 3 to L, are not computed here); unpaid and past due → days
 * late until today; paid without a date (imported history) → «✓» (paid, timing unknown); not due yet → not shown.
 */

export type CbcTier = "good" | "warn" | "bad"
export type CbcCode = { code: string; km: string; en: string; tier: CbcTier }

/** The guide's table, in the founder's order and colours. */
export const CBC_CODES: CbcCode[] = [
  { code: "0", km: "សងទាន់ពេល", en: "On time", tier: "good" },
  { code: "C", km: "ឥណទានបិទ", en: "Closed", tier: "good" },
  { code: "Q", km: "គ្មានប្រតិបត្តិការក្នុងវដ្ដនេះ", en: "No transaction this cycle", tier: "good" },
  { code: "1", km: "សងយឺត 1-29 ថ្ងៃ", en: "1–29 days late", tier: "warn" },
  { code: "2", km: "សងយឺត 30-59 ថ្ងៃ", en: "30–59 days late", tier: "warn" },
  { code: "3 – L", km: "សងយឺត 60 ថ្ងៃ ដល់ 360 ថ្ងៃឡើងទៅ", en: "60 to 360+ days late", tier: "bad" },
  { code: "D", km: "ពន្យារពេលនៃការសង", en: "Restructured", tier: "bad" },
  { code: "W", km: "ឥណទានខូច", en: "Write-off (bad debt)", tier: "bad" },
  { code: "R", km: "ឥណទានបដិសេធ", en: "Rejected", tier: "bad" },
  { code: "N", km: "ឥណទានមិនទាន់មានដំណើរការ", en: "Not active", tier: "bad" },
  { code: "V", km: "ឥណទានសងតាមរដូវកាល", en: "Seasonal", tier: "bad" },
  { code: "M", km: "មិនមានព័ត៌មានពីស្ថាប័ន", en: "Missing data", tier: "bad" },
]

/** The code for a number of days late (0 on time; «3+» from 60 days — see above). */
export function cbcCodeForDaysLate(daysLate: number): { code: string; tier: CbcTier } {
  if (daysLate <= 0) return { code: "0", tier: "good" }
  if (daysLate < 30) return { code: "1", tier: "warn" }
  if (daysLate < 60) return { code: "2", tier: "warn" }
  return { code: "3+", tier: "bad" }
}

export type StripCell = { n: number; due: string; code: string; tier: CbcTier | "unknown" }

const DAY = 86_400_000
const days = (a: string, b: string) => Math.round((Date.parse(`${a.slice(0, 10)}T00:00:00Z`) - Date.parse(`${b.slice(0, 10)}T00:00:00Z`)) / DAY)

/**
 * The last 24 cycles due by today, oldest first. `rows`: each installment's number, due date and whether it is paid
 * (by amount, oldest first — lib/loans/installments); `paidOn`: the recorded payment date by installment number.
 */
export function cbcStrip(rows: { n: number; date: string; paid: boolean }[], paidOn: Map<number, string>, today: string): StripCell[] {
  return rows
    .filter((r) => r.date <= today)
    .slice(-24)
    .map((r) => {
      const at = paidOn.get(r.n)
      if (at) return { n: r.n, due: r.date, ...cbcCodeForDaysLate(days(at, r.date)) }
      if (r.paid) return { n: r.n, due: r.date, code: "✓", tier: "unknown" as const }
      return { n: r.n, due: r.date, ...cbcCodeForDaysLate(days(today, r.date)) }
    })
}

/** The health line under the strip. */
export function cbcHealth(cells: StripCell[]): { tier: CbcTier | "unknown"; km: string; en: string } {
  const known = cells.filter((c) => c.tier !== "unknown")
  if (!known.length) return { tier: "unknown", km: "⚪ សុខភាពក្រេឌីត៖ មិនទាន់មានទិន្នន័យគ្រប់គ្រាន់ (ចុចបង់តាមអេប ដើម្បីកត់ត្រាថ្ងៃបង់)", en: "⚪ Credit health: not enough data yet (pay through the app to record the dates)" }
  if (known.some((c) => c.tier === "bad")) return { tier: "bad", km: "🔴 សុខភាពក្រេឌីត៖ គ្រោះថ្នាក់ (យឺត 60 ថ្ងៃ ឡើងទៅ)", en: "🔴 Credit health: at risk (60+ days late)" }
  if (known.some((c) => c.tier === "warn")) return { tier: "warn", km: "🟡 សុខភាពក្រេឌីត៖ ត្រូវប្រុងប្រយ័ត្ន (មានការសងយឺត)", en: "🟡 Credit health: careful (late payments)" }
  const run = cells.length - [...cells].reverse().findIndex((c) => c.code !== "0") - 1
  const streak = run === cells.length ? cells.length : cells.length - 1 - run
  return { tier: "good", km: `🟢 សុខភាពក្រេឌីត៖ ល្អឥតខ្ចោះ (កូដ 0 ជាប់គ្នា ${streak} ខែ)`, en: `🟢 Credit health: excellent (code 0, ${streak} in a row)` }
}

/** Under every strip: what it is and is not. */
export const CBC_ESTIMATE_NOTE = "ការប៉ាន់ស្មានពីការបង់ដែលបានកត់ត្រាក្នុង អេប លុយឆ្លាត — មិនមែនរបាយការណ៍ផ្លូវការរបស់ CBC ទេ។"

// ─── The 24-month calendar strip (founder, 21/10/2026) ───────────────────────────────────────────────────────────────

const KM_MONTHS = ["មករា", "កុម្ភៈ", "មីនា", "មេសា", "ឧសភា", "មិថុនា", "កក្កដា", "សីហា", "កញ្ញា", "តុលា", "វិច្ឆិកា", "ធ្នូ"]

/** «តុលា 26» for "2026-10". */
export const kmMonthLabel = (ym: string) => `${KM_MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(2, 4)}`

/** The month's cell: a CBC code from the loan's own record, or X (before the loan), Q (nothing due), C (paid off), «…» (due later this month). */
export type MonthCell = { month: string; label: string; code: string; tier: CbcTier | "unknown"; due: string | null }

const SEVERITY = ["…", "0", "✓", "1", "2", "3+"]
const worse = (a: MonthCell, b: MonthCell) => (SEVERITY.indexOf(b.code) > SEVERITY.indexOf(a.code) ? b : a)
const addMonths = (ym: string, k: number) => {
  const d = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + k, 1))
  return d.toISOString().slice(0, 7)
}

/**
 * The last 24 calendar months up to this one, oldest first (CBC reports the last 24 cycles): each month's installment
 * coded as in `cbcStrip` (the worst one when a month has two); X before the loan's start, Q when nothing fell due (CBC's
 * own «no transaction this cycle»), C from the month it was paid off, «…» for an installment due later this month.
 */
export function cbcMonthStrip(rows: { n: number; date: string; paid: boolean }[], paidOn: Map<number, string>, today: string, start: string, closedOn: string | null): MonthCell[] {
  const now = today.slice(0, 7)
  const startMonth = start.slice(0, 7)
  const closedMonth = closedOn?.slice(0, 7) ?? null
  return Array.from({ length: 24 }, (_, i) => addMonths(now, i - 23)).map((month) => {
    const base = { month, label: kmMonthLabel(month) }
    if (month < startMonth) return { ...base, code: "X", tier: "unknown" as const, due: null }
    if (closedMonth && month > closedMonth) return { ...base, code: "C", tier: "good" as const, due: null }
    const dues = rows.filter((r) => r.date.slice(0, 7) === month)
    if (!dues.length) return closedMonth && month === closedMonth ? { ...base, code: "C", tier: "good" as const, due: null } : { ...base, code: "Q", tier: "good" as const, due: null }
    return dues
      .map((r): MonthCell => {
        if (r.date > today && !paidOn.get(r.n) && !r.paid) return { ...base, code: "…", tier: "unknown", due: r.date }
        const at = paidOn.get(r.n)
        if (at) return { ...base, due: r.date, ...cbcCodeForDaysLate(days(at, r.date)) }
        if (r.paid) return { ...base, due: r.date, code: "✓", tier: "unknown" }
        return { ...base, due: r.date, ...cbcCodeForDaysLate(days(today, r.date)) }
      })
      .reduce(worse)
  })
}

/** When the loan was paid off: every installment paid — the last recorded payment date, else the last due date. */
export function cbcClosedOn(rows: { n: number; date: string; paid: boolean }[], paidOn: Map<number, string>): string | null {
  if (!rows.length || !rows.every((r) => r.paid)) return null
  const dates = rows.map((r) => paidOn.get(r.n)).filter((d): d is string => Boolean(d)).sort()
  return (dates.at(-1) ?? rows.at(-1)!.date).slice(0, 10)
}
