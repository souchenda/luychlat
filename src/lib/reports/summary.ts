import { adjustmentCategoryIds } from "@/lib/categories/presets"
import type { Category, Currency, Transaction, Wallet } from "@/lib/data/types"
import { roundMoney } from "@/lib/money"

/**
 * Bank-style account summary for a period: money in and out per currency, and
 * spending per category. Same rules as the Home cash-flow card (balance
 * adjustments and bank interest are left out). Across all wallets, transfers only move money
 * between your own wallets and are left out; for one wallet they are real
 * money in or out of it and count, under "Transfer".
 */
export type Native = { USD: number; KHR: number }
export type SummaryCategory = {
  /** Category id, "transfer", or "uncategorized". */
  key: string
  category: Category | null
  transfer: boolean
  amount: Native
}
export type AccountSummary = { cashIn: Native; cashOut: Native; expenses: SummaryCategory[]; count: number }

const zero = (): Native => ({ USD: 0, KHR: 0 })

/** The amount in one currency (USD-native + KHR-native at the rate). */
export function inCurrency(n: Native, currency: Currency, khrPerUsd: number): number {
  return currency === "USD" ? roundMoney(n.USD + n.KHR / khrPerUsd, "USD") : roundMoney(n.KHR + n.USD * khrPerUsd, "KHR")
}

export function accountSummary(
  transactions: Transaction[],
  categories: Category[],
  wallets: Pick<Wallet, "id" | "currency">[],
  walletId: string | null,
  khrPerUsd: number,
): AccountSummary {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const excluded = adjustmentCategoryIds(categories)
  const walletCurrency = new Map(wallets.map((w) => [w.id, w.currency]))
  const cashIn = zero()
  const cashOut = zero()
  const spend = new Map<string, Native>()
  let count = 0
  const addSpend = (key: string, currency: Currency, amount: number) => {
    const n = spend.get(key) ?? zero()
    n[currency] += amount
    spend.set(key, n)
  }

  for (const tx of transactions) {
    if (tx.type === "TRANSFER") {
      if (!walletId) continue
      if (tx.wallet_id === walletId) {
        cashOut[tx.currency] += tx.amount
        addSpend("transfer", tx.currency, tx.amount)
        count++
      } else if (tx.to_wallet_id === walletId) {
        const currency = walletCurrency.get(walletId) ?? tx.currency
        cashIn[currency] += tx.to_amount ?? tx.amount
        count++
      }
      continue
    }
    if (walletId && tx.wallet_id !== walletId) continue
    if (tx.category_id && excluded.has(tx.category_id)) continue
    const category = tx.category_id ? byId.get(tx.category_id) : undefined
    count++
    if (tx.type === "INCOME") cashIn[tx.currency] += tx.amount
    else {
      cashOut[tx.currency] += tx.amount
      addSpend(category?.id ?? "uncategorized", tx.currency, tx.amount)
    }
  }

  const round = (n: Native): Native => ({ USD: roundMoney(n.USD, "USD"), KHR: roundMoney(n.KHR, "KHR") })
  const expenses = [...spend.entries()]
    .map(([key, amount]) => ({ key, category: byId.get(key) ?? null, transfer: key === "transfer", amount: round(amount) }))
    .sort((a, b) => inCurrency(b.amount, "USD", khrPerUsd) - inCurrency(a.amount, "USD", khrPerUsd))
  return { cashIn: round(cashIn), cashOut: round(cashOut), expenses, count }
}

/** Share of `part` in `total` as a percentage with one decimal (0 when there is no total). */
export function percentOf(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : 0
}
