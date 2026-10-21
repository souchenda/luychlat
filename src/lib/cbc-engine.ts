/**
 * The credit health assessment (founder, 21/10/2026 — «users should know their standing without buying a CBC report»):
 * from every loan recorded here — its 24 months of codes (lib/loans/cbc › cbcMonthStrip), what it costs a month, and the
 * income recorded — a grade, the on-time rate, the debt-to-income ratio (DTI) and a verdict with the way back to green.
 *
 * It is the app's own estimate from what the person recorded, never the official CBC report: loans kept elsewhere are not
 * in it, and it says so (no silent guessing). Every rule below is stated, including the ones the brief left open:
 *   - a month's code is the worst code of the loans due that month (CBC reports each loan; one late loan is a late month);
 *   - the on-time rate counts the months with a recorded payment date — «✓» (paid, date not recorded) is not counted;
 *   - income = the average of the last 3 complete months recorded as income, not loans, capital or tontine pots;
 *   - grades: D any 60+ days late · C any 30–59 days late, 3+ minor lates, or DTI over 50% · B 1–2 minor lates (under
 *     30 days) or DTI 40–50% · A otherwise; without recorded income the grade is the history's alone, and says so.
 * Pure (cbc-engine.test.ts).
 */
import { NON_OPERATING_KEYS } from "@/lib/categories/presets"
import type { MonthCell } from "@/lib/loans/cbc"

export type CbcGrade = "A" | "B" | "C" | "D"

/** One loan, as the assessment needs it. */
export type LoanHistory = {
  /** Its last 24 calendar months, oldest first (cbcMonthStrip). */
  months: MonthCell[]
  /** What it costs a month now, in USD (null: no schedule, or paid off). */
  monthlyPaymentUsd: number | null
}

export type CbcAssessment = {
  grade: CbcGrade | null
  /** The 24 months, every loan together: the worst code due each month. */
  months: { month: string; label: string; code: string }[]
  /** Months with a recorded on-time payment, and every month with a recorded payment (or still unpaid and late). */
  onTime: number
  counted: number
  /** The on-time rate in whole percent (null: nothing counted yet). */
  rate: number | null
  /** Paid, date not recorded («✓»): not counted. */
  unknownPaid: number
  late: { minor: number; serious: number; severe: number }
  /** On-time months in a row, back from now (months with nothing due neither count nor break it). */
  streak: number
  monthlyDebtUsd: number
  monthlyIncomeUsd: number | null
  /** Debt payments ÷ income, percent with one decimal (null without income). */
  dti: number | null
  /** The most recent late month, and how many on-time months it takes to roll out of the 24. */
  lastLate: { month: string; label: string; code: string } | null
  monthsToClear: number
  /** An installment is unpaid past its date right now. */
  overdueNow: boolean
  loans: number
}

const LATE = ["1", "2", "3+"]
const SEVERITY = ["0", "1", "2", "3+"]

/** The worst code of a month across the loans: a late code over an on-time one, else what the month shows. */
function worstOf(cells: MonthCell[]): string {
  const coded = cells.map((c) => c.code).filter((c) => SEVERITY.includes(c))
  if (coded.length) return coded.reduce((a, b) => (SEVERITY.indexOf(b) > SEVERITY.indexOf(a) ? b : a))
  for (const c of ["✓", "…", "Q", "C"]) if (cells.some((x) => x.code === c)) return c
  return "X"
}

/** The average monthly income from what was recorded (null: none in the last 3 complete months). */
export function averageMonthlyIncome(monthTotalsUsd: number[]): number | null {
  const total = monthTotalsUsd.reduce((a, b) => a + b, 0)
  return total > 0 ? Math.round((total / monthTotalsUsd.length) * 100) / 100 : null
}

export function assessCredit(loans: LoanHistory[], monthlyIncomeUsd: number | null, overdueNow = false): CbcAssessment {
  const base = loans[0]?.months ?? []
  const months = base.map((m, i) => ({ month: m.month, label: m.label, code: worstOf(loans.map((l) => l.months[i]).filter(Boolean)) }))
  const codes = months.map((m) => m.code)
  const onTime = codes.filter((c) => c === "0").length
  const late = { minor: codes.filter((c) => c === "1").length, serious: codes.filter((c) => c === "2").length, severe: codes.filter((c) => c === "3+").length }
  const counted = onTime + late.minor + late.serious + late.severe

  let streak = 0
  for (let i = codes.length - 1; i >= 0; i--) {
    if (codes[i] === "0") streak++
    else if (LATE.includes(codes[i])) break
  }

  const lastIndex = codes.map((c, i) => (LATE.includes(c) ? i : -1)).reduce((a, b) => Math.max(a, b), -1)
  // A month at position i (0 = the oldest of the 24) leaves the window after i + 1 more months.
  const monthsToClear = lastIndex < 0 ? 0 : lastIndex + 1

  const monthlyDebtUsd = Math.round(loans.reduce((a, l) => a + (l.monthlyPaymentUsd ?? 0), 0) * 100) / 100
  const dti = monthlyIncomeUsd && monthlyIncomeUsd > 0 ? Math.round((monthlyDebtUsd / monthlyIncomeUsd) * 1000) / 10 : null

  let grade: CbcGrade | null = null
  if (counted > 0) {
    if (late.severe > 0) grade = "D"
    else if (late.serious > 0 || late.minor >= 3 || (dti !== null && dti > 50)) grade = "C"
    else if (late.minor > 0 || (dti !== null && dti >= 40)) grade = "B"
    else grade = "A"
  }

  return {
    grade,
    months,
    onTime,
    counted,
    rate: counted ? Math.round((onTime / counted) * 100) : null,
    unknownPaid: codes.filter((c) => c === "✓").length,
    late,
    streak,
    monthlyDebtUsd,
    monthlyIncomeUsd,
    dti,
    lastLate: lastIndex < 0 ? null : months[lastIndex],
    monthsToClear,
    overdueNow,
    loans: loans.length,
  }
}

/** The grade's badge, in the founder's words. */
export const GRADE_BADGE: Record<CbcGrade, { emoji: string; km: string; tone: "good" | "fine" | "warn" | "bad" }> = {
  A: { emoji: "🟢", km: "ល្អឥតខ្ចោះ", tone: "good" },
  B: { emoji: "🟡", km: "ល្អ — ត្រូវប្រុងប្រយ័ត្ន", tone: "fine" },
  C: { emoji: "🟠", km: "មធ្យម — ហានិភ័យមធ្យម", tone: "warn" },
  D: { emoji: "🔴", km: "ខ្សោយ — ហានិភ័យខ្ពស់", tone: "bad" },
}

/** «🟢 សុខភាពឥណទាន៖ ល្អឥតខ្ចោះ (Grade A)». */
export const gradeBadge = (g: CbcGrade) => `${GRADE_BADGE[g].emoji} សុខភាពឥណទាន៖ ${GRADE_BADGE[g].km} (Grade ${g})`

/** The founder's verdict for a clean history. */
export const VERDICT_A = "ប្រវត្តិឥណទានរបស់លោកអ្នកស្អាតឥតខ្ចោះ។ ធនាគារ និងគ្រឹះស្ថានហិរញ្ញវត្ថុនឹងផ្តល់ទំនុកចិត្តខ្ពស់បំផុត និងងាយស្រួលអនុម័តកម្ចីថ្មី!"

/** The verdict (សេចក្តីសន្និដ្ឋានរបស់ធនាគារ), in short Khmer lines — what a bank would read, and the way back to green. */
export function cbcVerdict(a: CbcAssessment): string[] {
  if (!a.grade) return ["មិនទាន់មានទិន្នន័យគ្រប់គ្រាន់ — ចុច «បង់» ក្នុងអេបនៅថ្ងៃបង់នីមួយៗ ដើម្បីកត់ត្រាថ្ងៃបង់ពិតប្រាកដ។"]
  const lines: string[] = []
  const anyLate = a.late.minor + a.late.serious + a.late.severe > 0
  if (a.overdueNow) lines.push("⚠️ មានការបង់ហួសកំណត់ឥឡូវនេះ — សូមបង់ភ្លាម ព្រោះរាល់ថ្ងៃយឺតបន្ថែម ធ្វើឱ្យកូដកាន់តែធ្ងន់។")
  if (!anyLate) {
    if (a.grade === "A") lines.push(VERDICT_A)
    else lines.push("ប្រវត្តិសងប្រាក់របស់លោកអ្នកស្អាត — គ្មានការសងយឺតទេ។")
  } else {
    const parts = [
      a.late.minor && `យឺតក្រោម 30 ថ្ងៃ ${a.late.minor} ខែ`,
      a.late.serious && `យឺត 30–59 ថ្ងៃ ${a.late.serious} ខែ`,
      a.late.severe && `យឺត 60 ថ្ងៃឡើងទៅ ${a.late.severe} ខែ`,
    ].filter(Boolean)
    lines.push(`ក្នុង 24 ខែចុងក្រោយ មានការសងយឺត៖ ${parts.join(" · ")}។`)
    if (a.lastLate)
      lines.push(`បើបង់ទាន់ពេលជាប់គ្នា ${a.monthsToClear} ខែទៀត ការសងយឺតចុងក្រោយ (${a.lastLate.label}) នឹងរំកិលចេញពីប្រវត្តិ 24 ខែ ហើយប្រវត្តិនឹងក្លាយជាពណ៌បៃតងវិញ។`)
  }
  if (a.dti === null) lines.push("បន្ទុកបំណុល (DTI) មិនទាន់គណនាបាន — កត់ត្រាចំណូលក្នុងអេប ដើម្បីបញ្ចប់ការវាយតម្លៃ។")
  else if (a.dti > 50) lines.push(`បន្ទុកបំណុល ${a.dti}% នៃចំណូល — ខ្ពស់ពេក។ កុំខ្ចីថ្មី ហើយកាត់បន្ថយបំណុលឱ្យនៅក្រោម 40%។`)
  else if (a.dti >= 40) lines.push(`បន្ទុកបំណុល ${a.dti}% នៃចំណូល — ជិតដល់កម្រិត។ រក្សាឱ្យនៅក្រោម 40% មុនខ្ចីបន្ថែម។`)
  return lines
}

/** Income that is not earnings: a loan received, an adjustment, a transfer between workspaces, a tontine pot, capital put in. */
const NOT_EARNINGS = new Set([...NON_OPERATING_KEYS, "tontine_payout", "investment"])

/**
 * The income of the last 3 complete months (USD at the rate, one total per month, oldest first): what feeds the DTI.
 * Income entries only, not the categories in NOT_EARNINGS.
 */
export function incomeLastMonths(
  transactions: { type: string; amount: number; currency: string; category_id: string | null; transaction_date: string }[],
  categories: { id: string; preset_key: string | null }[],
  khrPerUsd: number,
  today: string,
  count = 3,
): number[] {
  const excluded = new Set(categories.filter((c) => c.preset_key && NOT_EARNINGS.has(c.preset_key)).map((c) => c.id))
  const month = (k: number) => new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - k, 1)).toISOString().slice(0, 7)
  const months = Array.from({ length: count }, (_, i) => month(count - i))
  const totals = new Map(months.map((m) => [m, 0]))
  for (const tx of transactions) {
    if (tx.type !== "INCOME" || (tx.category_id && excluded.has(tx.category_id))) continue
    const m = tx.transaction_date.slice(0, 7)
    if (!totals.has(m)) continue
    totals.set(m, totals.get(m)! + (tx.currency === "USD" ? tx.amount : tx.amount / khrPerUsd))
  }
  return months.map((m) => Math.round(totals.get(m)! * 100) / 100)
}

/**
 * What a loan costs a month now, in USD: its next unpaid installment (principal, interest and fee), a weekly one × 52 ÷ 12.
 * Null when every installment is paid.
 */
export function monthlyPaymentUsd(
  rows: { payment: number; status: string }[],
  frequency: "MONTHLY" | "WEEKLY",
  currency: "USD" | "KHR",
  khrPerUsd: number,
): number | null {
  const next = rows.find((r) => r.status !== "PAID")
  if (!next) return null
  const perMonth = frequency === "WEEKLY" ? (next.payment * 52) / 12 : next.payment
  return Math.round((currency === "USD" ? perMonth : perMonth / khrPerUsd) * 100) / 100
}
