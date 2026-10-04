import { addMonths, differenceInCalendarDays, differenceInCalendarMonths, differenceInMonths, format, parseISO } from "date-fns"

import type { Debt, DebtStatus } from "@/lib/data/types"
import { roundMoney } from "@/lib/money"

/** Days within which a due date counts as "due soon". */
export const DUE_SOON_DAYS = 7

export function todayDate(): string {
  return format(new Date(), "yyyy-MM-dd")
}

export function remaining(debt: Pick<Debt, "total_amount" | "paid_amount" | "currency">): number {
  return Math.max(0, roundMoney(debt.total_amount - debt.paid_amount, debt.currency))
}

/** 0..100 */
export function progressPercent(debt: Pick<Debt, "total_amount" | "paid_amount">): number {
  if (debt.total_amount <= 0) return 0
  return Math.min(100, Math.round((debt.paid_amount / debt.total_amount) * 100))
}

/** Mirrors public.debt_status_for(); OVERDUE is evaluated against today, so stored values may be stale. */
export function debtStatus(
  debt: Pick<Debt, "total_amount" | "paid_amount" | "due_date">,
  today: string = todayDate(),
): DebtStatus {
  if (debt.paid_amount >= debt.total_amount) return "SETTLED"
  if (debt.due_date && debt.due_date < today) return "OVERDUE"
  if (debt.paid_amount > 0) return "PARTIALLY_PAID"
  return "ACTIVE"
}

/** Calendar days until the due date (negative when overdue), or null without a due date. */
export function daysLeft(debt: Pick<Debt, "due_date">, today: string = todayDate()): number | null {
  if (!debt.due_date) return null
  return differenceInCalendarDays(parseISO(debt.due_date), parseISO(today))
}

/**
 * How long a debt has been overdue as whole months plus leftover days
 * (due 2026-01-10, today 2026-08-16: 7 months 6 days, 218 days in all).
 * Null when it isn't overdue.
 */
export function overdueSpan(
  debt: Pick<Debt, "due_date">,
  today: string = todayDate(),
): { months: number; days: number; total: number } | null {
  const left = daysLeft(debt, today)
  if (left === null || left >= 0) return null
  const due = parseISO(debt.due_date!)
  const now = parseISO(today)
  const months = differenceInMonths(now, due)
  return { months, days: differenceInCalendarDays(now, addMonths(due, months)), total: -left }
}

/**
 * Urgency bands: green > 7 days, amber 1–7 days, red due today or overdue.
 * Settled debts and debts without a due date are neutral.
 */
export type Urgency = "safe" | "soon" | "due" | "settled" | "none"

export function urgency(debt: Pick<Debt, "total_amount" | "paid_amount" | "due_date">, today = todayDate()): Urgency {
  if (debtStatus(debt, today) === "SETTLED") return "settled"
  const days = daysLeft(debt, today)
  if (days === null) return "none"
  if (days <= 0) return "due"
  if (days <= DUE_SOON_DAYS) return "soon"
  return "safe"
}

const URGENCY_RANK: Record<Urgency, number> = { due: 0, soon: 1, safe: 2, none: 3, settled: 4 }

/** Most urgent first: overdue/due today, due soon, later, no due date, settled. */
export function byUrgency(a: Debt, b: Debt): number {
  const rank = URGENCY_RANK[urgency(a)] - URGENCY_RANK[urgency(b)]
  if (rank !== 0) return rank
  if (a.due_date && b.due_date && a.due_date !== b.due_date) return a.due_date.localeCompare(b.due_date)
  return b.created_at.localeCompare(a.created_at)
}

/**
 * Simple interest on the remaining balance from the start date to the due
 * date (informational only; the debt total is what has to be repaid).
 */
export function estimatedInterest(debt: Debt): number {
  if (!debt.interest_rate || !debt.due_date) return 0
  const start = parseISO(debt.start_date)
  const due = parseISO(debt.due_date)
  const periods =
    debt.interest_period === "MONTH"
      ? Math.max(0, differenceInCalendarMonths(due, start))
      : Math.max(0, differenceInCalendarDays(due, start)) / 365
  return roundMoney(remaining(debt) * (debt.interest_rate / 100) * periods, debt.currency)
}
