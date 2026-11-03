import { daysUntil, nextDue, type Bill } from "./bills"
import { isCard } from "./credit-card"
import type { Currency, Transaction, Wallet } from "./data/types"
import { isGoal } from "./goals"
import { convert, roundMoney, roundRiel } from "./money"

/**
 * 14-day cash-flow forecast (founder, 3/11/2026 — ROADMAP Phase 2): the money in the wallets today, plus the average day
 * of the last 28 days, minus each bill and loan instalment on its date. «ថ្ងៃទី 5 ត្រូវបង់ PPCBank $320 — តាមចំណូលមធ្យម
 * បងនឹងខ្វះ $45». An ESTIMATE, labelled so on screen with its method (guardrail: no silent guessing). Pure.
 *
 *   balance   ordinary wallets only — no savings goal, no credit card, nothing archived
 *   average   income and spending of the last 28 days ÷ 28, without transfers, loan repayments (debt_id) and the bills'
 *             own payments (mark_bill_paid books the bill's amount in its category) — those come on their dates instead
 *   bills     every active bill due within the 14 days (an overdue one counts today); a monthly bill once
 *   currency  dollars, or riel when every wallet is in riel; computed riel rounded to 100 ៛ (roundRiel)
 */

export const FORECAST_DAYS = 14
export const HISTORY_DAYS = 28
/** Under a week of records the average says nothing: the bills alone are counted, and the screen says why. */
export const MIN_HISTORY_DAYS = 7

export type ForecastPayment = { date: string; inDays: number; title: string; kind: Bill["kind"]; amount: number; currency: Currency; overdue: boolean }
export type ForecastDay = { date: string; balance: number; payments: ForecastPayment[] }
export type CashForecast = {
  currency: Currency
  start: number
  /** Average per day of the last 28 days (in `currency`); 0 when the history is too short. */
  dailyIn: number
  dailyOut: number
  averaged: boolean
  days: ForecastDay[]
  payments: ForecastPayment[]
  lowest: { date: string; balance: number }
  /** The first payment the money would not cover, and by how much (positive). */
  short: { payment: ForecastPayment; by: number } | null
}

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

/** A bill's own payment, as mark_bill_paid books it: its category, its currency, its amount (±1%). */
const isBillPayment = (tx: Pick<Transaction, "category_id" | "currency" | "amount">, bills: Pick<Bill, "category_id" | "currency" | "amount">[]) =>
  bills.some((b) => b.category_id && b.category_id === tx.category_id && b.currency === tx.currency && Math.abs(tx.amount - b.amount) <= b.amount * 0.01)

export function cashForecast(o: {
  today: string
  wallets: Wallet[]
  bills: Bill[]
  transactions: Pick<Transaction, "type" | "amount" | "currency" | "transaction_date" | "category_id" | "debt_id">[]
  khrPerUsd: number
}): CashForecast | null {
  const { today, khrPerUsd } = o
  const wallets = o.wallets.filter((w) => !w.archived_at && !isGoal(w) && !isCard(w))
  if (wallets.length === 0) return null
  const currency: Currency = wallets.every((w) => w.currency === "KHR") ? "KHR" : "USD"
  const to = (amount: number, from: Currency) => convert(amount, from, currency, khrPerUsd)
  const round = (n: number) => (currency === "KHR" ? roundRiel(n) : roundMoney(n, "USD"))

  const start = wallets.reduce((s, w) => s + to(Number(w.balance), w.currency), 0)

  const bills = o.bills.filter((b) => b.is_active)
  const from = addDays(today, -HISTORY_DAYS)
  const history = o.transactions.filter((t) => t.transaction_date >= from && t.transaction_date < today && t.type !== "TRANSFER" && !t.debt_id)
  const firstDay = history.reduce<string | null>((m, t) => (!m || t.transaction_date < m ? t.transaction_date : m), null)
  const span = firstDay ? Math.min(HISTORY_DAYS, daysUntil(today, firstDay)) : 0
  const averaged = span >= MIN_HISTORY_DAYS
  let dailyIn = 0
  let dailyOut = 0
  if (averaged) {
    for (const t of history) {
      if (t.type === "INCOME") dailyIn += to(Number(t.amount), t.currency)
      else if (!isBillPayment({ ...t, amount: Number(t.amount) }, bills)) dailyOut += to(Number(t.amount), t.currency)
    }
    dailyIn /= span
    dailyOut /= span
  }

  const last = addDays(today, FORECAST_DAYS - 1)
  const payments: ForecastPayment[] = bills
    .map((b) => {
      const due = nextDue(b)
      const overdue = due < today
      return { date: overdue ? today : due, inDays: overdue ? 0 : daysUntil(due, today), title: b.title, kind: b.kind, amount: Number(b.amount), currency: b.currency, overdue }
    })
    .filter((p) => p.date <= last && p.amount > 0)
    .sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount)

  const days: ForecastDay[] = []
  let balance = start
  let lowest = { date: today, balance: round(start) }
  let short: CashForecast["short"] = null
  for (let i = 0; i < FORECAST_DAYS; i++) {
    const date = addDays(today, i)
    // Today's own income and spending are already in the wallets; the average starts tomorrow.
    if (i > 0) balance += dailyIn - dailyOut
    const due = payments.filter((p) => p.date === date)
    for (const p of due) {
      balance -= to(p.amount, p.currency)
      if (!short && balance < 0) short = { payment: p, by: round(-balance) }
    }
    const b = round(balance)
    days.push({ date, balance: b, payments: due })
    if (b < lowest.balance) lowest = { date, balance: b }
  }

  return { currency, start: round(start), dailyIn: round(dailyIn), dailyOut: round(dailyOut), averaged, days, payments, lowest, short }
}
