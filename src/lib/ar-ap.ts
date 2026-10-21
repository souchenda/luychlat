/**
 * The business's money owed, both ways (founder, 22/10/2026 — Task #453): «អតិថិជនជំពាក់» (AR — customers owe us,
 * RECEIVABLE debts) at /business/ar and «ជំពាក់គេ» (AP — we owe suppliers, PAYABLE debts) at /business/ap. The same debts
 * as /debts, seen the way a shop sees them: the totals at a glance, then who owes / is owed, the most urgent first. A
 * payment is the debt's own repayment (record_debt_repayment: the wallet moves, the debt drops, never past what is left).
 * Pure — the page is components/business/ar-ap-view.tsx.
 */
import type { Debt } from "@/lib/data/types"
import { byUrgency, daysLeft, remaining, todayDate } from "@/lib/debts"
import { convert, formatMoney } from "@/lib/money"

export type ArApKind = "RECEIVABLE" | "PAYABLE"

/** The open debts of one side, the most urgent first (overdue, then due soonest). */
export function openDebts(debts: Debt[], kind: ArApKind): Debt[] {
  return debts.filter((d) => d.type === kind && remaining(d) > 0).sort(byUrgency)
}

export type ArApSummary = {
  /** Everything still owed, in dollars at the rate (riel debts converted — an estimate, shown with ≈). */
  totalUsd: number
  /** Past their due date. */
  overdueUsd: number
  overdueCount: number
  /** Due from today to 7 days ahead (not yet overdue). */
  dueWeekUsd: number
  /** How many customers / suppliers still have something open. */
  count: number
}

export function arApSummary(debts: Debt[], kind: ArApKind, khrPerUsd: number, today: string = todayDate()): ArApSummary {
  const open = openDebts(debts, kind)
  const usd = (d: Debt) => convert(remaining(d), d.currency, "USD", khrPerUsd)
  const s: ArApSummary = { totalUsd: 0, overdueUsd: 0, overdueCount: 0, dueWeekUsd: 0, count: new Set(open.map((d) => d.party_name.trim().toLowerCase())).size }
  for (const d of open) {
    const left = daysLeft(d, today)
    s.totalUsd += usd(d)
    if (left !== null && left < 0) {
      s.overdueUsd += usd(d)
      s.overdueCount++
    } else if (left !== null && left <= 7) s.dueWeekUsd += usd(d)
  }
  const cents = (n: number) => Math.round(n * 100) / 100
  return { ...s, totalUsd: cents(s.totalUsd), overdueUsd: cents(s.overdueUsd), dueWeekUsd: cents(s.dueWeekUsd) }
}

/** «ហួសកំណត់ 5 ថ្ងៃ» — how late a debt is, or null when it is not. */
export function overdueDays(d: Pick<Debt, "due_date">, today: string = todayDate()): number | null {
  const left = daysLeft(d, today)
  return left !== null && left < 0 ? -left : null
}

/**
 * The polite reminder to a customer (the founder's words, Task #453) — what is left of this debt, in its own currency
 * («$25.00», «51,500 ៛»); sent by the owner (the share sheet / Telegram), never by the app. Islamic Mode greets with
 * «អាស្សាឡាមុអាឡៃកុម» (founder, 20/10/2026).
 */
export function arReminderText(o: { customer: string; business: string; debt: Pick<Debt, "total_amount" | "paid_amount" | "currency">; islamic?: boolean }): string {
  const greeting = o.islamic ? "អាស្សាឡាមុអាឡៃកុម" : "ជម្រាបសួរ"
  return `${greeting} ${o.customer.trim()}! ពីហាង ${o.business.trim()}។ នេះជាការរំលឹកអំពីវិក្កយបត្រថ្លៃទំនិញសរុប ${formatMoney(remaining(o.debt), o.debt.currency)} ដែលដល់ថ្ងៃទូទាត់។ បងអាចផ្ញើវិក្កយបត្រ ឬទូទាត់តាមគណនីបានដោយងាយស្រួល។ អរគុណច្រើនបង! 🙏`
}
