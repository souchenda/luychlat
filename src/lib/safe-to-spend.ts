import { goalProgress, isGoal } from "@/lib/goals"
import { convert, roundMoney, roundRiel } from "@/lib/money"
import type { Currency, Transaction, Wallet } from "@/lib/data/types"

/**
 * «ថ្ងៃនេះចាយបានប៉ុន្មាន?» — safe to spend today (founder, 9/11/2026). One number on Home: the money in hand, less what
 * must still be paid this month, shared over the days left in the month. Nothing is guessed (guardrail 1) — the card
 * lists every part of the sum:
 *
 *  - In hand: every open ordinary wallet (cash, bank, e-wallet). Savings goals and credit cards are not spending money
 *    (a negative ordinary balance — an overdraft — counts as the minus it is).
 *  - Still to pay before the month ends: every active bill (a loan's instalment included) whose next unpaid date is on
 *    or before the last day of this month — overdue ones too. A fixed-deposit maturity (DEPOSIT) is money coming in.
 *  - Set aside for goals: a dated goal's monthly need, less what was already moved into it this month.
 *
 * Amounts are in dollars; the riel line is a conversion, rounded to 100 ៛ (guardrail 2).
 */

export type SafeBill = { id: string; title: string; amount: number; currency: Currency; due: string; kind?: string; is_active: boolean }

export type SafeToSpend = {
  /** Money in hand (USD). */
  cash: number
  /** Bills still to pay this month (USD), and which. */
  bills: number
  billItems: { id: string; title: string; usd: number; due: string }[]
  /** Set aside for dated goals this month (USD). */
  goals: number
  /** cash − bills − goals (USD, may be negative). */
  free: number
  /** Days left in the month, today included (≥ 1). */
  daysLeft: number
  /** Safe to spend today (USD, never below 0) and its riel conversion (100 ៛ rounding). */
  perDay: number
  perDayKhr: number
  /** "short": bills and goals are more than the money in hand. */
  status: "ok" | "short"
}

const pad = (n: number) => String(n).padStart(2, "0")

/** The last day of the month of a Cambodian date (YYYY-MM-DD). */
export function monthEnd(today: string): string {
  const [y, m] = today.split("-").map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${y}-${pad(m)}-${pad(last)}`
}

/** Days from today to the month's end, both included. */
export function daysLeftInMonth(today: string): number {
  return Number(monthEnd(today).slice(8, 10)) - Number(today.slice(8, 10)) + 1
}

export const isSpendingWallet = (w: Pick<Wallet, "archived_at" | "goal_target" | "kind">) =>
  !w.archived_at && !isGoal(w) && w.kind !== "CREDIT_CARD"

export function safeToSpend(input: {
  wallets: Wallet[]
  /** Active bills with their next unpaid date already worked out (lib/bills nextDue). */
  bills: SafeBill[]
  /** This month's entries (for what was already moved into a goal). */
  transactions: Transaction[]
  khrPerUsd: number
  /** Today in Cambodia (YYYY-MM-DD). */
  today: string
}): SafeToSpend {
  const { wallets, bills, transactions, khrPerUsd, today } = input
  const usd = (amount: number, currency: Currency) => convert(amount, currency, "USD", khrPerUsd)
  const end = monthEnd(today)
  const month = today.slice(0, 7)

  const cash = roundMoney(wallets.filter(isSpendingWallet).reduce((s, w) => s + usd(w.balance, w.currency), 0), "USD")

  const billItems = bills
    .filter((b) => b.is_active && b.kind !== "DEPOSIT" && b.due <= end && b.amount > 0)
    .map((b) => ({ id: b.id, title: b.title, usd: usd(b.amount, b.currency), due: b.due }))
    .sort((a, b) => a.due.localeCompare(b.due))
  const billsTotal = roundMoney(billItems.reduce((s, b) => s + b.usd, 0), "USD")

  const goalWallets = wallets.filter((w) => !w.archived_at && isGoal(w))
  const goals = roundMoney(
    goalWallets.reduce((s, g) => {
      const need = goalProgress(g, new Date(`${today}T12:00:00+07:00`)).perMonth
      if (!need) return s
      const moved = transactions
        .filter((t) => t.type === "TRANSFER" && t.to_wallet_id === g.id && t.transaction_date.slice(0, 7) === month)
        .reduce((m, t) => m + (t.to_amount ?? t.amount), 0)
      return s + usd(Math.max(0, need - moved), g.currency)
    }, 0),
    "USD",
  )

  const free = roundMoney(cash - billsTotal - goals, "USD")
  const daysLeft = Math.max(1, daysLeftInMonth(today))
  const perDay = free > 0 ? Math.floor((free / daysLeft) * 100) / 100 : 0
  return {
    cash,
    bills: billsTotal,
    billItems,
    goals,
    free,
    daysLeft,
    perDay,
    perDayKhr: roundRiel(perDay * khrPerUsd),
    status: free > 0 ? "ok" : "short",
  }
}
