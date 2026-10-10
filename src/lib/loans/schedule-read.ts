/**
 * A photo of a bank / MFI loan repayment schedule (តារាងកាលវិភាគសងប្រាក់ — CLC, ACLEDA, ABA, PRASAC, …)
 * read by Vision AI, turned into the loan the app keeps: a debt with an installment schedule (BANK:
 * interest booked per installment; FLAT: interest in the total), the installments already paid as a
 * record-only repayment, and a monthly LOAN bill. Pure (schedule-read.test.ts) — the reading is
 * src/lib/server/loan-schedule-bot.ts.
 */

import { addMonths, format, parseISO } from "date-fns"

import { roundMoney } from "@/lib/money"

import { computeSchedule, type LoanInput, type LoanSchedule, type ScheduleRow } from "./amortization"
import { scheduleToSave } from "./installments"

export type ScheduleRead = {
  lender: string
  account: string | null
  currency: "USD" | "KHR"
  principal: number
  /** Percent per month (a yearly rate is converted). Null when not printed: solved from the installment. */
  monthlyRate: number | null
  months: number
  installment: number
  method: "ANNUITY" | "FLAT"
  disbursed: string | null
  firstDue: string
  nextNo: number | null
  nextDue: string | null
  nextAmount: number | null
  outstanding: number | null
}

/** The vision prompt; today's date lets it pick the next installment and the current balance. */
export function schedulePrompt(today: string): string {
  return [
    "This photo should be a Cambodian bank or microfinance LOAN REPAYMENT SCHEDULE (តារាងកាលវិភាគសងប្រាក់ / Repayment Schedule): a header with the loan's terms and a table of installments (No., date, principal, interest, total, balance).",
    "Read it and answer JSON only:",
    '{"is_schedule": boolean, "lender": string, "account": string | null, "currency": "USD" | "KHR", "principal": number, "rate": number | null, "rate_period": "MONTH" | "YEAR", "months": number, "installment": number, "method": "ANNUITY" | "FLAT" | null, "disbursed": "YYYY-MM-DD" | null, "first_due": "YYYY-MM-DD", "next_no": number | null, "next_due": "YYYY-MM-DD" | null, "next_amount": number | null, "outstanding": number | null}',
    "lender: the institution's name as printed (e.g. \"Cambodian Labor Care PLC\"). account: the loan account number as printed (e.g. \"994-005084-01-4\").",
    "principal: the amount disbursed / loan amount. rate: the interest rate as printed (0.82 for \"0.82%\"); rate_period: MONTH for a monthly rate, YEAR for a yearly one. months: the number of installments (term).",
    "installment: the regular total installment (principal + interest) — the amount repeated on most rows. method: ANNUITY when the total installment is equal every month (declining balance), FLAT when the interest is the same every month; null if unclear.",
    "disbursed: the disbursement / loan date. first_due: the date of installment No. 1.",
    `Today is ${today}. next_no / next_due / next_amount: the first row dated on or after today (its number, date and total). outstanding: the remaining principal balance after the last row dated before today (the principal itself when no row is before today).`,
    "Amounts are numbers without separators (\"9,599.00\" → 9599). Riel has no decimals. Dates as YYYY-MM-DD (read dd/mm/yyyy as day first).",
    'If it is not a loan repayment schedule, or the principal, term or installment is unreadable, answer {"is_schedule": false}.',
  ].join("\n")
}

const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null)
const num = (v: unknown) => {
  const n = typeof v === "string" ? Number(v.replace(/[,\s$៛]/g, "")) : Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}
const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().replace(/\s+/g, " ").slice(0, max) : null)

/** The model's JSON → a schedule, or null when it isn't one or the essentials are missing / implausible. */
export function cleanScheduleRead(raw: unknown): ScheduleRead | null {
  const r = (raw ?? {}) as Record<string, unknown>
  if (r.is_schedule !== true) return null
  const currency = r.currency === "KHR" ? "KHR" : "USD"
  const principal = num(r.principal)
  const months = num(r.months)
  const installment = num(r.installment)
  const firstDue = date(r.first_due)
  if (!principal || !months || !installment || !firstDue || !Number.isInteger(months) || months > 600) return null
  // The installment must lie between principal ÷ months and the whole principal.
  if (installment * months < principal * 0.98 || installment > principal) return null
  const rate = num(r.rate)
  const monthlyRate = rate === null ? null : r.rate_period === "YEAR" ? rate / 12 : rate
  if (monthlyRate !== null && monthlyRate > 10) return null
  const nextNo = num(r.next_no)
  return {
    lender: text(r.lender, 80) ?? "Loan",
    account: text(r.account, 40),
    currency,
    principal: roundMoney(principal, currency),
    monthlyRate,
    months,
    installment: roundMoney(installment, currency),
    method: r.method === "FLAT" ? "FLAT" : "ANNUITY",
    disbursed: date(r.disbursed),
    firstDue,
    nextNo: nextNo && Number.isInteger(nextNo) && nextNo <= months + 1 ? nextNo : null,
    nextDue: date(r.next_due),
    nextAmount: num(r.next_amount),
    outstanding: num(r.outstanding),
  }
}

/** The monthly rate (percent) whose annuity on `principal` over `months` is `installment` (bisection). */
export function solveMonthlyRate(principal: number, months: number, installment: number): number {
  if (installment * months <= principal) return 0
  let lo = 0
  let hi = 0.2
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2
    const pay = (principal * mid) / (1 - Math.pow(1 + mid, -months))
    if (pay > installment) hi = mid
    else lo = mid
  }
  return Math.round(((lo + hi) / 2) * 100 * 10_000) / 10_000
}

const monthIndex = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1

export type ImportPlan = {
  input: LoanInput
  schedule: LoanSchedule
  /** Installments already paid (before the next one). */
  paidCount: number
  /** What the record-only repayment books: principal (BANK) or installments (FLAT) of the paid rows. */
  paidAmount: number
  /** The day of the last paid installment (the repayment's date), or null with none paid. */
  paidUntil: string | null
  next: ScheduleRow | null
  /** Shown to the person: the schedule's own figures where printed, else ours. */
  shown: { installment: number; outstanding: number; nextDue: string | null; nextAmount: number | null }
}

/**
 * The loan to create. The installments before the next one count as paid: the printed next number,
 * else the months from the first due date to the printed next date, else the rows dated before today.
 */
export function importPlan(read: ScheduleRead, today: string): ImportPlan {
  const flat = read.method === "FLAT"
  const rate = read.monthlyRate ?? (flat ? roundMoney(((read.installment * read.months - read.principal) / read.principal / read.months) * 100, "USD") : solveMonthlyRate(read.principal, read.months, read.installment))
  const input: LoanInput = {
    principal: read.principal,
    currency: read.currency,
    rate,
    ratePeriod: "MONTH",
    months: read.months,
    method: flat ? "FLAT" : "BANK",
    frequency: "MONTHLY",
    firstPaymentDate: read.firstDue,
    startDate: read.disbursed ?? format(addMonths(parseISO(read.firstDue), -1), "yyyy-MM-dd"),
    fee: 0,
    payment: read.installment,
  }
  const schedule = computeSchedule(input)
  const byDate = schedule.rows.filter((row) => row.date < today).length
  const paidCount = Math.max(
    0,
    Math.min(read.months, read.nextNo !== null ? read.nextNo - 1 : read.nextDue ? monthIndex(read.nextDue) - monthIndex(read.firstDue) : byDate),
  )
  const paidRows = schedule.rows.slice(0, paidCount)
  const paidAmount = roundMoney(paidRows.reduce((a, row) => a + (flat ? row.payment : row.principal), 0), read.currency)
  const next = schedule.rows[paidCount] ?? null
  const ourOutstanding = paidCount ? schedule.rows[paidCount - 1].balance : read.principal
  return {
    input,
    schedule,
    paidCount,
    paidAmount,
    paidUntil: paidCount ? schedule.rows[paidCount - 1].date : null,
    next,
    shown: {
      installment: read.installment,
      outstanding: read.outstanding ?? ourOutstanding,
      nextDue: read.nextDue ?? next?.date ?? null,
      nextAmount: read.nextAmount ?? next?.payment ?? null,
    },
  }
}

const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
const money = (n: number, currency: "USD" | "KHR") =>
  currency === "KHR" ? `${Math.round(n).toLocaleString("en-US")}៛` : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** The bot's confirmation once the loan, its schedule and the reminder are saved. */
export function importedText(read: ScheduleRead, plan: ImportPlan): string {
  const c = read.currency
  return [
    `📑 តារាងកាលវិភាគកម្ចី ${read.lender} ត្រូវបានកត់ត្រាជោគជ័យ!`,
    `🏦 ស្ថាប័ន៖ ${read.lender}${read.account ? ` (កុង ${read.account})` : ""}`,
    `💵 ត្រូវបង់ប្រចាំខែ៖ ${money(plan.shown.installment, c)}`,
    `⏳ ប្រាក់ដើមនៅសល់៖ ${money(plan.shown.outstanding, c)}`,
    ...(plan.shown.nextDue ? [`📅 លើកបន្ទាប់៖ ${ddmmyyyy(plan.shown.nextDue)} (${money(plan.shown.nextAmount ?? plan.shown.installment, c)})`] : []),
    "",
    `ប្រព័ន្ធបានបង្កើតកាលវិភាគ ${read.months} ខែ និងកំណត់រំលឹកបង់ប្រាក់អូតូរួចរាល់!`,
  ].join("\n")
}

/** What bot_import_loan saves: the debt (as the app's form would), the paid installments and the bill. */
export function loanPayload(read: ScheduleRead, plan: ImportPlan) {
  const saved = scheduleToSave(plan.schedule, {
    frequency: "MONTHLY",
    count: read.months,
    method: plan.input.method,
    firstDue: read.firstDue,
    principal: read.principal,
    fee: 0,
  })
  return {
    party_name: read.lender,
    note: [read.account ? `កុង ${read.account}` : null, "📑 ពីរូបថតតារាងកាលវិភាគ"].filter(Boolean).join(" · "),
    currency: read.currency,
    principal: read.principal,
    interest_rate: plan.input.rate,
    start_date: plan.input.startDate,
    due_date: saved.due_date,
    method: plan.input.method,
    total_amount: saved.total_amount,
    count: read.months,
    first_due: read.firstDue,
    payment: saved.schedule_payment,
    paid_amount: plan.paidAmount,
    paid_date: plan.paidUntil,
    paid_note: plan.paidCount ? `លើកទី 1–${plan.paidCount} បង់រួចមុនពេលកត់ត្រា (តាមតារាងកាលវិភាគ)` : null,
    bill_amount: plan.schedule.monthlyPayment,
  }
}
