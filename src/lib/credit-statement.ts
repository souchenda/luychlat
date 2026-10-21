/**
 * The pre-loan assessment statement (founder, 21/10/2026): one page a person can print, save as PDF or share before
 * talking to a loan officer — their recorded standing without anyone pulling an official CBC report (an enquiry on the
 * CBC system). Built from the credit assessment (lib/cbc-engine); every figure says where it comes from, and the page says
 * plainly that it is the app's estimate from what its owner recorded, not a CBC report (no silent guessing). Pure
 * (credit-statement.test.ts).
 */
import { GRADE_BADGE, type CbcAssessment, type CbcGrade } from "@/lib/cbc-engine"
import { formatMoney } from "@/lib/money"

export const STATEMENT_TITLE = "របាយការណ៍វាយតម្លៃសមត្ថភាពឥណទានបឋម · អេប លុយឆ្លាត"
export const STATEMENT_SUBTITLE = "Pre-Loan Assessment Statement"

/** The founder's soft-check disclaimer, word for word. */
export const SOFT_CHECK_DISCLAIMER =
  "របាយការណ៍នេះជាការវាយតម្លៃបឋមផ្អែកលើទិន្នន័យកត់ត្រាក្នុង អេប លុយឆ្លាត ដើម្បីជាជំនួយក្នុងការពិភាក្សាជាមួយមន្ត្រីឥណទានធនាគារ ដោយមិនប៉ះពាល់ដល់ពិន្ទុឆែក (Enquiry) លើប្រព័ន្ធ CBC ផ្លូវការឡើយ។"

/** Where the figures come from — the officer reads it too. */
export const DATA_NOTE =
  "ទិន្នន័យកត់ត្រាដោយម្ចាស់គណនីផ្ទាល់ក្នុង អេប លុយឆ្លាត — មិនមែនរបាយការណ៍ផ្លូវការរបស់ CBC ទេ ហើយកម្ចីដែលមិនបានកត់ក្នុងអេប មិនរាប់បញ្ចូលទេ។"

export type DtiBand = "safe" | "watch" | "high"

/** The safety benchmark: under 40% safe, 40–50% to watch, over 50% high (the grades' own thresholds). */
export function dtiBand(dti: number | null): DtiBand | null {
  if (dti === null) return null
  return dti < 40 ? "safe" : dti <= 50 ? "watch" : "high"
}

const BAND_LABEL: Record<DtiBand, string> = {
  safe: "ក្រោម 40% — សុវត្ថិភាព",
  watch: "40–50% — ត្រូវប្រុងប្រយ័ត្ន",
  high: "លើស 50% — ខ្ពស់",
}

/** «30%», «44.6%», with the benchmark — or why there is none. */
export function formatDti(dti: number | null): string {
  if (dti === null) return "— (គ្មានចំណូលកត់ត្រា 3 ខែចុងក្រោយ)"
  return `${dti}% · ${BAND_LABEL[dtiBand(dti)!]}`
}

const KM_MONTHS = ["មករា", "កុម្ភៈ", "មីនា", "មេសា", "ឧសភា", "មិថុនា", "កក្កដា", "សីហា", "កញ្ញា", "តុលា", "វិច្ឆិកា", "ធ្នូ"]
/** «21 តុលា 2026». */
export const statementDate = (iso: string) => `${Number(iso.slice(8, 10))} ${KM_MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`

export type Statement = {
  name: string
  workspace: string
  date: string
  grade: CbcGrade | null
  gradeLabel: string
  rate: string
  rateDetail: string
  activeLoans: number
  loans: number
  installments: string
  income: string
  dti: string
  band: DtiBand | null
  months: CbcAssessment["months"]
  streak: number
}

export function buildStatement(a: CbcAssessment, who: { name: string; workspace: string; today: string }): Statement {
  return {
    name: who.name,
    workspace: who.workspace,
    date: statementDate(who.today),
    grade: a.grade,
    gradeLabel: a.grade ? `Grade ${a.grade} · ${GRADE_BADGE[a.grade].km}` : "មិនទាន់មានទិន្នន័យគ្រប់គ្រាន់",
    rate: a.rate === null ? "—" : `${a.rate}%`,
    rateDetail: a.counted ? `${a.onTime}/${a.counted} ខែ បង់ទាន់ពេល` : "មិនទាន់មានថ្ងៃបង់កត់ត្រា",
    activeLoans: a.activeLoans,
    loans: a.loans,
    installments: `${formatMoney(a.monthlyDebtUsd, "USD")} / ខែ`,
    income: a.monthlyIncomeUsd === null ? "—" : `${formatMoney(a.monthlyIncomeUsd, "USD")} / ខែ`,
    dti: formatDti(a.dti),
    band: dtiBand(a.dti),
    months: a.months,
    streak: a.streak,
  }
}

/** A clean text summary to share (Telegram, Messenger…) — the same figures and the disclaimer. */
export function statementShareText(s: Statement): string {
  return [
    `📄 ${STATEMENT_TITLE}`,
    `${s.name} · ${s.date}`,
    "",
    `🛡️ ចំណាត់ថ្នាក់ឥណទាន (ប៉ាន់ស្មាន)៖ ${s.gradeLabel}`,
    `✅ អត្រាសងទៀងទាត់ 24 ខែ៖ ${s.rate} (${s.rateDetail})`,
    `🏦 កម្ចីកំពុងសង៖ ${s.activeLoans}`,
    `💳 ការបង់រំលស់សរុប៖ ${s.installments}`,
    `💵 ចំណូលជាមធ្យម៖ ${s.income}`,
    `📊 បន្ទុកបំណុល (DTI)៖ ${s.dti}`,
    "",
    `ℹ️ ${SOFT_CHECK_DISCLAIMER}`,
  ].join("\n")
}
