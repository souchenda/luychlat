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
  { code: "1", km: "សងយឺត ១-២៩ ថ្ងៃ", en: "1–29 days late", tier: "warn" },
  { code: "2", km: "សងយឺត ៣០-៥៩ ថ្ងៃ", en: "30–59 days late", tier: "warn" },
  { code: "3 – L", km: "សងយឺត ៦០ ថ្ងៃ ដល់ ៣៦០ ថ្ងៃឡើងទៅ", en: "60 to 360+ days late", tier: "bad" },
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
  if (known.some((c) => c.tier === "bad")) return { tier: "bad", km: "🔴 សុខភាពក្រេឌីត៖ គ្រោះថ្នាក់ (យឺត ៦០ ថ្ងៃ ឡើងទៅ)", en: "🔴 Credit health: at risk (60+ days late)" }
  if (known.some((c) => c.tier === "warn")) return { tier: "warn", km: "🟡 សុខភាពក្រេឌីត៖ ត្រូវប្រុងប្រយ័ត្ន (មានការសងយឺត)", en: "🟡 Credit health: careful (late payments)" }
  const run = cells.length - [...cells].reverse().findIndex((c) => c.code !== "0") - 1
  const streak = run === cells.length ? cells.length : cells.length - 1 - run
  const kmN = String(streak).replace(/\d/g, (d) => "០១២៣៤៥៦៧៨៩"[Number(d)])
  return { tier: "good", km: `🟢 សុខភាពក្រេឌីត៖ ល្អឥតខ្ចោះ (កូដ ០ ជាប់គ្នា ${kmN} ខែ)`, en: `🟢 Credit health: excellent (code 0, ${streak} in a row)` }
}

/** Under every strip: what it is and is not. */
export const CBC_ESTIMATE_NOTE = "ការប៉ាន់ស្មានពីការបង់ដែលបានកត់ត្រាក្នុង អេប លុយឆ្លាត — មិនមែនរបាយការណ៍ផ្លូវការរបស់ CBC ទេ។"
