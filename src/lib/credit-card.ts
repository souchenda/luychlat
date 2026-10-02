/**
 * Credit-card wallets: the balance is what you owe (negative), the limit and
 * billing days live on the wallet. Paying the bill is a transfer into the card,
 * so it never counts as spending twice. Same due-date rule as the database's
 * public.card_next_due (used for the reminders).
 */

import type { Wallet } from "@/lib/data/types"

export const isCard = (w: Pick<Wallet, "kind">) => w.kind === "CREDIT_CARD"

/** A warning shows above this share of the limit. */
export const HIGH_UTILIZATION = 0.7

const pad = (n: number) => String(n).padStart(2, "0")

/** yyyy-MM-dd for day `day` of month `month` (0-based, may overflow), clamped to the month's last day. */
function cardDay(year: number, month: number, day: number): string {
  const first = new Date(Date.UTC(year, month, 1))
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  return `${first.getUTCFullYear()}-${pad(first.getUTCMonth() + 1)}-${pad(Math.min(day, last))}`
}

/**
 * The next payment due date on or after `today` (yyyy-MM-dd). The bill closes
 * on statementDay and is due on dueDay of the same month when dueDay comes
 * later, otherwise of the next month.
 */
export function nextDueDate(statementDay: number, dueDay: number, today: string): string | null {
  const [y, m] = today.split("-").map(Number)
  for (let k = -1; k <= 2; k++) {
    const stmt = cardDay(y, m - 1 + k, statementDay)
    const [sy, sm] = stmt.split("-").map(Number)
    const due = cardDay(sy, sm - 1 + (dueDay > statementDay ? 0 : 1), dueDay)
    if (due >= today) return due
  }
  return null
}

/** The most recent statement (bill closing) date on or before `today`. */
export function lastStatementDate(statementDay: number, today: string): string {
  const [y, m] = today.split("-").map(Number)
  const thisMonth = cardDay(y, m - 1, statementDay)
  return thisMonth <= today ? thisMonth : cardDay(y, m - 2, statementDay)
}

export type CardSummary = {
  /** What you owe now (≥ 0). */
  owed: number
  limit: number
  available: number
  /** 0..1+ */
  utilization: number
  high: boolean
  dueDate: string | null
  daysLeft: number | null
}

export function cardSummary(w: Wallet, today: string): CardSummary | null {
  if (!isCard(w) || !w.credit_limit || !w.statement_day || !w.due_day) return null
  const owed = Math.max(0, -w.balance)
  const limit = w.credit_limit
  const utilization = owed / limit
  const dueDate = owed > 0 ? nextDueDate(w.statement_day, w.due_day, today) : null
  const daysLeft = dueDate ? Math.round((Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000) : null
  return { owed, limit, available: limit - owed, utilization, high: utilization > HIGH_UTILIZATION, dueDate, daysLeft }
}
