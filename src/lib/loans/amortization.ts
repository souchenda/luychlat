import { addMonths, format, parseISO } from "date-fns"

import type { Currency, InterestPeriod } from "@/lib/data/types"
import { roundMoney } from "@/lib/money"

export type LoanMethod = "FLAT" | "REDUCING"

export type LoanInput = {
  principal: number
  currency: Currency
  /** Percent per `ratePeriod`. */
  rate: number
  ratePeriod: InterestPeriod
  months: number
  method: LoanMethod
  /** yyyy-MM-dd of the first installment. */
  firstPaymentDate: string
}

export type ScheduleRow = {
  n: number
  date: string
  payment: number
  principal: number
  interest: number
  balance: number
}

export type LoanSchedule = {
  /** Regular installment (the last one may differ by rounding). */
  monthlyPayment: number
  totalInterest: number
  totalPayment: number
  rows: ScheduleRow[]
  lastPaymentDate: string
}

export const MAX_MONTHS = 600

/** Monthly rate as a fraction. */
export function monthlyRate(rate: number, period: InterestPeriod): number {
  return period === "MONTH" ? rate / 100 : rate / 100 / 12
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
  const { principal: P, currency, months: n, method } = input
  const r = monthlyRate(input.rate, input.ratePeriod)
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
      date: format(addMonths(parseISO(input.firstPaymentDate), i - 1), "yyyy-MM-dd"),
      payment: round(principalPart + interest),
      principal: principalPart,
      interest,
      balance,
    })
  }

  const totalInterest = round(rows.reduce((a, row) => a + row.interest, 0))
  return {
    monthlyPayment: regular,
    totalInterest,
    totalPayment: round(P + totalInterest),
    rows,
    lastPaymentDate: rows[rows.length - 1]?.date ?? input.firstPaymentDate,
  }
}
