import type { Budget, Category, Currency, Transaction } from "@/lib/data/types"
import { convert, roundMoney } from "@/lib/money"

/**
 * Monthly category budgets. A cap applies to every calendar month; spending is
 * the month's expenses in that category, converted to the cap's currency.
 *   safe: below 70% · near: 70–100% ("almost at the limit") · over: above 100%
 */
export type BudgetStatus = "safe" | "near" | "over"

export const NEAR_LIMIT = 0.7

export function budgetStatus(ratio: number): BudgetStatus {
  return ratio > 1 ? "over" : ratio >= NEAR_LIMIT ? "near" : "safe"
}

export type BudgetLine = {
  budget: Budget
  category: Category | undefined
  spent: number
  ratio: number
  status: BudgetStatus
  /** Negative when over the cap. */
  left: number
}

export type BudgetSummary = {
  lines: BudgetLine[]
  /** Totals in `currency`. */
  planned: number
  actual: number
  /** This month's spending in categories without a cap. */
  unbudgeted: number
  ratio: number
  status: BudgetStatus
  currency: Currency
}

/** `transactions` should already be limited to the month being shown. */
export function summarizeBudgets(input: {
  budgets: Budget[]
  categories: Category[]
  transactions: Transaction[]
  khrPerUsd: number
  currency: Currency
}): BudgetSummary {
  const { budgets, categories, transactions, khrPerUsd, currency } = input
  const byCategory = new Map<string, { currency: Currency; amount: number }[]>()
  for (const tx of transactions) {
    if (tx.type !== "EXPENSE" || !tx.category_id) continue
    byCategory.set(tx.category_id, [...(byCategory.get(tx.category_id) ?? []), { currency: tx.currency, amount: tx.amount }])
  }
  const sumIn = (rows: { currency: Currency; amount: number }[] | undefined, to: Currency) =>
    roundMoney((rows ?? []).reduce((acc, r) => acc + convert(r.amount, r.currency, to, khrPerUsd), 0), to)

  const categoryById = new Map(categories.map((c) => [c.id, c]))
  const lines = budgets
    .map((budget): BudgetLine => {
      const spent = sumIn(byCategory.get(budget.category_id), budget.currency)
      const ratio = budget.amount > 0 ? spent / budget.amount : 0
      return {
        budget,
        category: categoryById.get(budget.category_id),
        spent,
        ratio,
        status: budgetStatus(ratio),
        left: roundMoney(budget.amount - spent, budget.currency),
      }
    })
    // Most urgent first: over, then near, then by how much is used.
    .sort((a, b) => b.ratio - a.ratio)

  const budgeted = new Set(budgets.map((b) => b.category_id))
  const planned = roundMoney(budgets.reduce((acc, b) => acc + convert(b.amount, b.currency, currency, khrPerUsd), 0), currency)
  const actual = roundMoney(lines.reduce((acc, l) => acc + convert(l.spent, l.budget.currency, currency, khrPerUsd), 0), currency)
  const unbudgeted = roundMoney(
    [...byCategory.entries()].filter(([id]) => !budgeted.has(id)).reduce((acc, [, rows]) => acc + sumIn(rows, currency), 0),
    currency,
  )
  const ratio = planned > 0 ? actual / planned : 0
  return { lines, planned, actual, unbudgeted, ratio, status: budgetStatus(ratio), currency }
}
