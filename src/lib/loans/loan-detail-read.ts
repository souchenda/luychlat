/**
 * A mobile-banking LOAN DETAIL screen (any Cambodian bank or MFI — PPCBank, Canadia, ABA, ACLEDA, Sathapana,
 * Wing, KB Prasac, Chip Mong, FTB, Prince, PPCBank, Amret, LOLC…) read by Vision AI from its meaning,
 * not one bank's layout: original principal, outstanding balance, rate, term (open / end date), next
 * repayment date. It becomes the same loan a printed schedule does (schedule-read.ts → bot_import_loan):
 * the debt, the installments already paid, and a monthly LOAN reminder on /bills (and /car for a car
 * loan).
 *
 * No silent guessing: the monthly installment is the screen's own when printed; otherwise it is the
 * bank's standard amortization of the printed principal, rate and term (said so in the reply), and the
 * installments already paid are the ones that bring that schedule to the printed outstanding balance.
 * Pure (loan-detail-read.test.ts).
 */
import { addMonths, differenceInCalendarMonths, format, parseISO } from "date-fns"

import { roundMoney } from "@/lib/money"

import type { ScheduleRead } from "./schedule-read"

export type LoanDetailRead = {
  bank: string
  product: string | null
  account: string | null
  currency: "USD" | "KHR"
  principal: number
  outstanding: number
  /** Percent per year. */
  annualRate: number
  openDate: string | null
  endDate: string | null
  /** Installments in the whole term (from the dates, or printed). */
  months: number
  nextDue: string
  /** The installment printed on the screen, if any. */
  installment: number | null
  method: "ANNUITY" | "FLAT"
}

/** Canonical names, matched anywhere in what the screen shows (logo text, app name, header). */
const BANKS: [RegExp, string][] = [
  [/canadia/i, "Canadia Bank"],
  [/\baba\b|advanced bank of asia/i, "ABA Bank"],
  [/acleda|អេស៊ីលីដា/i, "ACLEDA Bank"],
  [/sathapana|សថាបនា/i, "Sathapana Bank"],
  [/\bwing\b/i, "Wing Bank"],
  [/prasac|ប្រាសាក់/i, "KB PRASAC Bank"],
  [/chip\s*mong/i, "Chip Mong Bank"],
  [/\bftb\b|foreign trade bank/i, "FTB"],
  [/prince/i, "Prince Bank"],
  [/ppc\s*bank|phnom penh commercial/i, "PPCBank"],
  [/amret|អំរ៉េត/i, "Amret"],
  [/\blolc\b/i, "LOLC"],
  [/hattha|ហត្ថា/i, "Hattha Bank"],
  [/vattanac/i, "Vattanac Bank"],
  [/\bcimb\b/i, "CIMB Bank"],
  [/maybank/i, "Maybank"],
]
/** No bank named on the screen: a plain label, never a failure. */
export const UNKNOWN_BANK = "កម្ចីធនាគារ (Bank Loan)"

/**
 * Account-number shapes that name the bank for certain — more reliable than a logo read from a dark
 * screen. PPCBank loan accounts: 1-22X-XXXXXXXX-X (1-223-00004253-8 car loan, 1-224-00006341-4 house
 * loan — founder, 12/10/2026).
 */
const ACCOUNT_BANKS: [RegExp, string][] = [[/^1-22\d-\d{8}-\d$/, "PPCBank"]]

/** The bank: from the account number's shape when it is certain, else the name on the screen, else «កម្ចីធនាគារ (Bank Loan)». */
export function canonicalBank(raw: string | null | undefined, account?: string | null): string {
  const byAccount = account ? ACCOUNT_BANKS.find(([re]) => re.test(account.replace(/\s+/g, "")))?.[1] : undefined
  if (byAccount) return byAccount
  const s = raw?.trim() ?? ""
  return BANKS.find(([re]) => re.test(s))?.[1] ?? (s ? s.slice(0, 40) : UNKNOWN_BANK)
}

/** A car / motorbike loan (shown on /car too). */
export const isVehicleLoan = (text: string | null | undefined) => /\b(car|auto|vehicle|motor\w*)\b|ឡាន|រថយន្ត|ម៉ូតូ|យានយន្ត/i.test(text ?? "")

export function loanDetailPrompt(today: string): string {
  return [
    `Today is ${today}. This photo should be a LOAN DETAIL screen of a Cambodian mobile-banking app (any bank or microfinance; light or dark mode; Khmer or English).`,
    "Recognise it by meaning, not by one bank's layout. Typical labels:",
    '- header: "Loan Detail", "Loan Account", "Credit Detail", "Loan Summary", "Facility Detail", "Installment Loan", «ព័ត៌មានឥណទាន», «ព័ត៌មានកម្ចី», «គណនីឥណទាន», «សេចក្តីសង្ខេបកម្ចី», «ឥណទាន»;',
    '- outstanding: "Outstanding Balance", "Current Balance", "Remaining Principal", "Principal Outstanding", "Balance", «សមតុល្យនៅសល់», «សមតុល្យឥណទាន», «ប្រាក់ដើមនៅសល់»;',
    '- original principal: "Loan Principle", "Loan Principal", "Original Amount", "Disbursed Amount", "Approved Amount", "Facility Limit", «ប្រាក់ដើមកម្ចី», «ទំហំឥណទាន», «ទឹកប្រាក់អនុម័ត»;',
    '- next repayment: "Next Repayment Schedule", "Next Due Date", "Payment Due Date", "Repayment Date", «កាលបរិច្ឆេទទូទាត់បន្ទាប់», «ថ្ងៃត្រូវបង់បន្ទាប់»;',
    '- the interest rate (a percentage) and the term ("Open Date" / "End Date", "Maturity Date", «កាលបរិច្ឆេទ»).',
    "Answer only JSON:",
    '{"is_loan_detail": boolean, "bank": string | null, "product": string | null, "account": string | null, "currency": "USD" | "KHR", "principal": number | null, "outstanding": number | null, "rate": number | null, "rate_period": "YEAR" | "MONTH", "open_date": "YYYY-MM-DD" | null, "end_date": "YYYY-MM-DD" | null, "months": number | null, "next_due": "YYYY-MM-DD" | null, "installment": number | null, "method": "AMORTIZATION" | "FLAT" | null}',
    "- PPCBank Mobile (Phnom Penh Commercial Bank) screens are dark with green accents; their loan accounts look like 1-223-00004253-8.",
    "- bank: the bank / MFI name as shown (logo text, app name) or null; product: the loan's product name (e.g. «New Car Loan to Individual-USD»); account: the loan account number exactly as printed.",
    "- installment: ONLY a monthly repayment amount printed on the screen — never computed. months: only a printed term in months.",
    "- Never invent a value: null when it is not on the screen. Personal names are not needed.",
    'If it is not a loan detail screen, answer {"is_loan_detail": false}.',
  ].join("\n")
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : typeof v === "string" && Number(v.replace(/[,\s$៛]/g, "")) > 0 ? Number(v.replace(/[,\s$៛]/g, "")) : null)
const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null)
const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().replace(/\s+/g, " ").slice(0, max) : null)

/** The model's JSON → a loan detail, or null when it isn't one or the essentials are missing / implausible. */
export function cleanLoanDetail(raw: unknown): LoanDetailRead | null {
  const r = (raw ?? {}) as Record<string, unknown>
  if (r.is_loan_detail !== true) return null
  const currency = r.currency === "KHR" ? "KHR" : "USD"
  const principal = num(r.principal)
  const outstanding = typeof r.outstanding === "number" && r.outstanding >= 0 ? r.outstanding : num(r.outstanding)
  const rate = num(r.rate)
  const nextDue = date(r.next_due)
  if (!principal || outstanding === null || !rate || !nextDue) return null
  if (outstanding > principal * 1.05) return null
  const annualRate = r.rate_period === "MONTH" ? rate * 12 : rate
  if (annualRate > 60) return null
  const openDate = date(r.open_date)
  const endDate = date(r.end_date)
  const printedMonths = num(r.months)
  const months = printedMonths && Number.isInteger(printedMonths) ? printedMonths : openDate && endDate ? differenceInCalendarMonths(parseISO(endDate), parseISO(openDate)) : null
  const installment = num(r.installment)
  // A term is needed for the schedule — from the dates, a printed term, or a printed installment.
  if ((!months || months < 1 || months > 600) && !installment) return null
  return {
    bank: canonicalBank(text(r.bank, 60), text(r.account, 40)),
    product: text(r.product, 60),
    account: text(r.account, 40),
    currency,
    principal: roundMoney(principal, currency),
    outstanding: roundMoney(outstanding, currency),
    annualRate: Math.round(annualRate * 10_000) / 10_000,
    openDate,
    endDate,
    months: months && months >= 1 && months <= 600 ? months : 0,
    nextDue,
    installment: installment ? roundMoney(installment, currency) : null,
    method: r.method === "FLAT" ? "FLAT" : "ANNUITY",
  }
}

/** The standard amortized installment (annuity). */
export function annuity(principal: number, monthlyRate: number, months: number): number {
  if (monthlyRate === 0) return principal / months
  return (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months))
}

/** Installments already paid: the count whose remaining balance is closest to the printed outstanding. */
export function paidFromOutstanding(principal: number, monthlyRate: number, months: number, installment: number, outstanding: number): number {
  let best = 0
  let bestGap = Infinity
  let balance = principal
  for (let k = 0; k <= months; k++) {
    const gap = Math.abs(balance - outstanding)
    if (gap < bestGap) {
      best = k
      bestGap = gap
    }
    balance = balance * (1 + monthlyRate) - installment
  }
  return Math.min(best, Math.max(0, months - 1))
}

/** The loan detail as the schedule reading bot_import_loan already understands. */
export function detailToSchedule(d: LoanDetailRead): ScheduleRead & { installmentStated: boolean } {
  const r = d.annualRate / 12 / 100
  let months = d.months
  // No term on the screen but a printed installment: the months it takes to repay the principal.
  if (!months && d.installment) months = Math.max(1, Math.ceil(-Math.log(1 - (d.principal * r) / d.installment) / Math.log(1 + r)) || Math.ceil(d.principal / d.installment))
  const installment = d.installment ?? roundMoney(d.method === "FLAT" ? d.principal / months + d.principal * r : annuity(d.principal, r, months), d.currency)
  const paid = d.method === "FLAT" ? Math.min(months - 1, Math.max(0, Math.round((d.principal - d.outstanding) / (d.principal / months)))) : paidFromOutstanding(d.principal, r, months, installment, d.outstanding)
  const firstDue = format(addMonths(parseISO(d.nextDue), -paid), "yyyy-MM-dd")
  return {
    lender: [d.bank, d.product].filter(Boolean).join(" · ").slice(0, 80),
    account: d.account,
    currency: d.currency,
    principal: d.principal,
    monthlyRate: Math.round((d.annualRate / 12) * 10_000) / 10_000,
    months,
    installment,
    method: d.method,
    disbursed: d.openDate,
    firstDue,
    nextNo: paid + 1,
    nextDue: d.nextDue,
    nextAmount: d.installment,
    outstanding: d.outstanding,
    dueDates: null,
    paidThrough: paid,
    installmentStated: d.installment !== null,
  }
}
