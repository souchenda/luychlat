import type { Transaction } from "@/lib/data/types"
import { monthKey, type MonthKey } from "@/lib/dates"
import { roundMoney } from "@/lib/money"

/** A money total expressed in both currencies at the configured rate. */
export type DualTotal = { usd: number; khr: number }

/** USD-native and KHR-native sums combined into both currencies at the given rate. */
export function dualTotal(usdNative: number, khrNative: number, khrPerUsd: number): DualTotal {
  return {
    usd: roundMoney(usdNative + khrNative / khrPerUsd, "USD"),
    khr: roundMoney(khrNative + usdNative * khrPerUsd, "KHR"),
  }
}

/** Income, expense and net flow; transfers move money between wallets and are excluded. */
/** True for rows that count as income/expense (not transfers, not excluded categories such as adjustments). */
const counts = (tx: Transaction, exclude?: Set<string>) =>
  tx.type !== "TRANSFER" && !(tx.category_id && exclude?.has(tx.category_id))

export function cashFlow(transactions: Transaction[], khrPerUsd: number, exclude?: Set<string>) {
  const sums = { INCOME: { USD: 0, KHR: 0 }, EXPENSE: { USD: 0, KHR: 0 } }
  for (const tx of transactions) {
    if (tx.type === "TRANSFER" || !counts(tx, exclude)) continue
    sums[tx.type][tx.currency] += tx.amount
  }
  const income = dualTotal(sums.INCOME.USD, sums.INCOME.KHR, khrPerUsd)
  const expense = dualTotal(sums.EXPENSE.USD, sums.EXPENSE.KHR, khrPerUsd)
  return {
    income,
    expense,
    net: { usd: roundMoney(income.usd - expense.usd, "USD"), khr: roundMoney(income.khr - expense.khr, "KHR") },
  }
}

const toUsd = (tx: Transaction, khrPerUsd: number) => (tx.currency === "USD" ? tx.amount : tx.amount / khrPerUsd)

/** Income and expense per month (USD equivalent), for `months` oldest first. */
export function monthlyTrend(transactions: Transaction[], months: MonthKey[], khrPerUsd: number, exclude?: Set<string>) {
  const rows = new Map(months.map((m) => [m, { month: m, income: 0, expense: 0 }]))
  for (const tx of transactions) {
    if (tx.type === "TRANSFER" || !counts(tx, exclude)) continue
    const row = rows.get(monthKey(new Date(tx.transaction_date)))
    if (!row) continue
    if (tx.type === "INCOME") row.income += toUsd(tx, khrPerUsd)
    else row.expense += toUsd(tx, khrPerUsd)
  }
  return [...rows.values()].map((r) => ({
    ...r,
    income: roundMoney(r.income, "USD"),
    expense: roundMoney(r.expense, "USD"),
  }))
}

/** Expense per category (USD equivalent), largest first; the tail folds into one "other" row. */
export function topExpenseCategories(transactions: Transaction[], khrPerUsd: number, limit = 5, exclude?: Set<string>) {
  const totals = new Map<string | null, number>()
  for (const tx of transactions) {
    if (tx.type !== "EXPENSE" || !counts(tx, exclude)) continue
    totals.set(tx.category_id, (totals.get(tx.category_id) ?? 0) + toUsd(tx, khrPerUsd))
  }
  const sorted = [...totals.entries()]
    .map(([categoryId, usd]) => ({ categoryId, usd: roundMoney(usd, "USD") }))
    .sort((a, b) => b.usd - a.usd)
  if (sorted.length <= limit) return { rows: sorted, other: 0 }
  const other = sorted.slice(limit - 1).reduce((acc, r) => acc + r.usd, 0)
  return { rows: sorted.slice(0, limit - 1), other: roundMoney(other, "USD") }
}
