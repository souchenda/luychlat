import { addMonths, addWeeks, format, parseISO } from "date-fns"

import type { Currency, InterestPeriod } from "@/lib/data/types"
import { roundMoney } from "@/lib/money"

/** BANK: a bank loan — broken first period, a monthly fee, interest booked as an expense (see bank_loan_rows in SQL). */
export type LoanMethod = "FLAT" | "REDUCING" | "BANK"
export type LoanFrequency = "MONTHLY" | "WEEKLY"

export type LoanInput = {
  principal: number
  currency: Currency
  /** Percent per `ratePeriod`. */
  rate: number
  ratePeriod: InterestPeriod
  /** Number of installments (months, or weeks when `frequency` is WEEKLY). */
  months: number
  method: LoanMethod
  frequency?: LoanFrequency
  /** yyyy-MM-dd of the first installment. */
  firstPaymentDate: string
  /** BANK: yyyy-MM-dd the money was disbursed (first interest = days ÷ 360). */
  startDate?: string
  /** BANK: fixed monthly fee / insurance added to every installment. */
  fee?: number
  /**
   * BANK: the installment the lender states (schedule_payment). Some round the EMI up (CLC: $244 for
   * $242.72); a stated amount within 10% but more than 0.5% off the formula is used as the EMI.
   */
  payment?: number | null
}

export type ScheduleRow = {
  n: number
  date: string
  payment: number
  principal: number
  interest: number
  /** Monthly fee / insurance (BANK only, else 0). */
  fee: number
  balance: number
}

export type LoanSchedule = {
  /** Regular installment (the last one may differ by rounding). BANK: includes the fee. */
  monthlyPayment: number
  /** BANK: the installment without the fee (EMI) — what's stored as schedule_payment. */
  basePayment: number
  totalInterest: number
  totalFees: number
  totalPayment: number
  rows: ScheduleRow[]
  lastPaymentDate: string
}

export const MAX_MONTHS = 600

/** Monthly rate as a fraction. */
export function monthlyRate(rate: number, period: InterestPeriod): number {
  return period === "MONTH" ? rate / 100 : rate / 100 / 12
}

/** Rate per installment period as a fraction (weekly = yearly ÷ 52). */
export function periodRate(rate: number, period: InterestPeriod, frequency: LoanFrequency = "MONTHLY"): number {
  const yearly = period === "MONTH" ? (rate / 100) * 12 : rate / 100
  return frequency === "WEEKLY" ? yearly / 52 : yearly / 12
}

/**
 * - FLAT: interest on the original principal every month (common for MFI and
 *   informal loans in Cambodia): payment = P/n + P·r.
 * - REDUCING: interest on the remaining balance (annuity / amortization):
 *   payment = P·r / (1 − (1+r)^−n).
 * Amounts are rounded to the currency (cents / whole riel); the final row
 * absorbs rounding so the balance ends at exactly 0.
 */
export function computeSchedule(input: LoanInput): LoanSchedule {
  if (input.method === "BANK") return computeBankSchedule(input)
  const { principal: P, currency, months: n, method } = input
  const frequency = input.frequency ?? "MONTHLY"
  const r = periodRate(input.rate, input.ratePeriod, frequency)
  const step = frequency === "WEEKLY" ? addWeeks : addMonths
  const round = (x: number) => roundMoney(x, currency)

  const regular =
    method === "FLAT" ? round(P / n + P * r) : r === 0 ? round(P / n) : round((P * r) / (1 - Math.pow(1 + r, -n)))

  const rows: ScheduleRow[] = []
  let balance = P
  for (let i = 1; i <= n; i++) {
    const interest = round(method === "FLAT" ? P * r : balance * r)
    let principalPart = round(regular - interest)
    if (i === n || principalPart > balance) principalPart = round(balance)
    balance = round(balance - principalPart)
    rows.push({
      n: i,
      date: format(step(parseISO(input.firstPaymentDate), i - 1), "yyyy-MM-dd"),
      payment: round(principalPart + interest),
      principal: principalPart,
      interest,
      fee: 0,
      balance,
    })
  }

  const totalInterest = round(rows.reduce((a, row) => a + row.interest, 0))
  return {
    monthlyPayment: regular,
    basePayment: regular,
    totalInterest,
    totalFees: 0,
    totalPayment: round(P + totalInterest),
    rows,
    lastPaymentDate: rows[rows.length - 1]?.date ?? input.firstPaymentDate,
  }
}

const dayCount = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)

/** The lender's stated installment when it is a rounded EMI (more than 0.5%, at most 10% off the formula); else null. */
export function statedEmi(payment: number | null | undefined, formula: number): number | null {
  if (!payment || !(formula > 0)) return null
  const off = Math.abs(payment - formula) / formula
  return off > 0.005 && off <= 0.1 ? payment : null
}

/**
 * Bank loan (កម្ចីបង់រំលស់ធនាគារ), the same arithmetic as public.bank_loan_rows:
 * - EMI = P·r / (1 − (1+r)^−n), r = yearly ÷ 12 — or the lender's stated, rounded installment (statedEmi).
 * - #1: interest = P · yearly · days ÷ 360 (disbursement → first due date);
 *   principal = EMI − P·r with the exact EMI.
 * - #2…: interest = balance · r; principal = EMI − interest (equal installments).
 * - Every installment adds the fixed monthly fee; the last clears the balance.
 * e.g. $38,000 · 7.99% · 120 months · $2.50, 30/09 → 20/10: #1 $379.01, then $463.34.
 */
function computeBankSchedule(input: LoanInput): LoanSchedule {
  const { principal: P, currency, months: n } = input
  const round = (x: number) => roundMoney(x, currency)
  const yearly = input.ratePeriod === "MONTH" ? (input.rate / 100) * 12 : input.rate / 100
  const r = yearly / 12
  const fee = round(input.fee ?? 0)
  const emiExact = r === 0 ? P / n : (P * r) / (1 - Math.pow(1 + r, -n))
  const stated = statedEmi(input.payment, round(emiExact))
  const emi = stated ?? round(emiExact)
  const days = input.startDate ? dayCount(input.startDate, input.firstPaymentDate) : 0

  const rows: ScheduleRow[] = []
  let balance = P
  for (let i = 1; i <= n; i++) {
    let interest: number
    let principalPart: number
    if (i === 1) {
      interest = round(days > 0 ? (P * yearly * days) / 360 : P * r)
      principalPart = round((stated ?? emiExact) - P * r)
    } else {
      interest = round(balance * r)
      principalPart = round(emi - interest)
    }
    if (i === n || principalPart > balance) principalPart = round(balance)
    if (principalPart < 0) principalPart = 0
    balance = round(balance - principalPart)
    rows.push({
      n: i,
      date: format(addMonths(parseISO(input.firstPaymentDate), i - 1), "yyyy-MM-dd"),
      payment: round(principalPart + interest + fee),
      principal: principalPart,
      interest,
      fee,
      balance,
    })
  }

  const totalInterest = round(rows.reduce((a, row) => a + row.interest, 0))
  const totalFees = round(fee * rows.length)
  return {
    monthlyPayment: round(emi + fee),
    basePayment: emi,
    totalInterest,
    totalFees,
    totalPayment: round(P + totalInterest + totalFees),
    rows,
    lastPaymentDate: rows[rows.length - 1]?.date ?? input.firstPaymentDate,
  }
}
