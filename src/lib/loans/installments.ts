/**
 * Installment schedules attached to a debt (PRO). The schedule is rebuilt from
 * the debt's schedule_* fields with the loan calculator; payments already
 * logged cover installments oldest first, which gives each one its status.
 * Same rule as public.debt_next_installment (used for the reminders).
 */

import type { Debt } from "@/lib/data/types"
import { roundMoney } from "@/lib/money"

import { computeSchedule, type LoanFrequency, type LoanMethod, type LoanSchedule, type ScheduleRow } from "./amortization"

export type InstallmentStatus = "PAID" | "PARTIAL" | "DUE" | "OVERDUE" | "PENDING"

export type Installment = ScheduleRow & {
  status: InstallmentStatus
  /** Paid towards this installment so far. */
  paid: number
}

/** Days before an installment's date when it counts as due. */
export const DUE_WINDOW_DAYS = 7

export type ScheduleFields = {
  schedule_frequency: LoanFrequency
  schedule_count: number
  schedule_method: LoanMethod
  schedule_first_due: string
  schedule_payment: number
  schedule_principal: number
}

export const hasSchedule = (d: Pick<Debt, "schedule_frequency">) => Boolean(d.schedule_frequency)

/** The schedule a debt was saved with (null without one). */
export function debtSchedule(d: Debt): LoanSchedule | null {
  if (!d.schedule_frequency || !d.schedule_count || !d.schedule_method || !d.schedule_first_due || !d.schedule_principal) return null
  return computeSchedule({
    principal: d.schedule_principal,
    currency: d.currency,
    rate: d.interest_rate,
    ratePeriod: d.interest_period,
    months: d.schedule_count,
    method: d.schedule_method,
    frequency: d.schedule_frequency,
    firstPaymentDate: d.schedule_first_due,
    startDate: d.start_date,
    fee: d.schedule_fee ?? 0,
    payment: d.schedule_payment,
  })
}

/** Bank loan: the debt holds the principal only; interest and fee are expenses paid with each installment. */
export const isBankLoan = (d: Pick<Debt, "schedule_method">) => d.schedule_method === "BANK"


const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000)

/**
 * Each installment with what's been paid on it and its status today. With
 * `byPrincipal` (bank loans) the debt's paid amount is principal only, so it
 * covers each installment's principal part.
 */
export function installments(schedule: LoanSchedule, paidTotal: number, today: string, currency: Debt["currency"], byPrincipal = false): Installment[] {
  let left = paidTotal
  return schedule.rows.map((row) => {
    const due = byPrincipal ? row.principal : row.payment
    const paid = roundMoney(Math.min(due, Math.max(0, left)), currency)
    left = roundMoney(left - paid, currency)
    const full = paid >= due - (currency === "KHR" ? 0.5 : 0.005)
    const days = dayDiff(row.date, today)
    const status: InstallmentStatus = full ? "PAID" : days < 0 ? "OVERDUE" : days <= DUE_WINDOW_DAYS ? "DUE" : paid > 0 ? "PARTIAL" : "PENDING"
    return { ...row, paid, status }
  })
}

/** The first installment not fully paid, or null when all are. */
export const nextInstallment = (list: Installment[]) => list.find((i) => i.status !== "PAID") ?? null

/**
 * The schedule fields and debt totals to save: total = everything to repay
 * (principal + interest), due date = the last installment. A bank loan keeps
 * the principal as its total (interest is booked as an expense per installment).
 */
export function scheduleToSave(
  schedule: LoanSchedule,
  input: { frequency: LoanFrequency; count: number; method: LoanMethod; firstDue: string; principal: number; fee?: number },
) {
  const bank = input.method === "BANK"
  return {
    total_amount: bank ? input.principal : schedule.totalPayment,
    schedule_fee: bank ? (input.fee ?? 0) : null,
    due_date: schedule.lastPaymentDate,
    schedule_frequency: input.frequency,
    schedule_count: input.count,
    schedule_method: input.method,
    schedule_first_due: input.firstDue,
    schedule_payment: schedule.basePayment,
    schedule_principal: input.principal,
  }
}

/** The next unpaid installment of a scheduled debt (number and date), or null without a schedule / when all are paid. */
export function nextScheduledDue(d: Debt, today: string): { n: number; date: string } | null {
  const schedule = debtSchedule(d)
  if (!schedule) return null
  const next = nextInstallment(installments(schedule, d.paid_amount, today, d.currency, isBankLoan(d)))
  return next ? { n: next.n, date: next.date } : null
}
