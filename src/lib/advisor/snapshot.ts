import { addMonths, format, getDaysInMonth } from "date-fns"

import { DEBT_CATEGORY_PRESETS, DISBURSEMENT_CATEGORY_PRESETS } from "@/lib/categories/presets"
import type { Category, Debt, Transaction, Wallet, WorkspaceType } from "@/lib/data/types"
import { monthKey, monthStart } from "@/lib/dates"
import { daysLeft, debtStatus, remaining, todayDate } from "@/lib/debts"
import { roundMoney } from "@/lib/money"

/**
 * Aggregated, anonymous financial picture (all amounts in USD equivalent).
 * This object is what the AI sees: no names, phones, notes or free text.
 * Display labels (debt party names, custom category names) live in
 * `SnapshotLabels`, which never leaves the device.
 */
export type Snapshot = {
  asOf: string
  workspaceType: WorkspaceType
  khrPerUsd: number
  cashUsd: number
  walletCount: number
  /** Last 4 months incl. the current one, oldest first. Debt principal flows excluded. */
  months: { month: string; income: number; expense: number }[]
  avgIncome: number
  avgExpense: number
  thisMonth: { income: number; expense: number; net: number; daysElapsed: number; daysInMonth: number }
  /** (avgIncome - avgExpense) / avgIncome, or null without income. */
  savingsRate: number | null
  /** This month's expense by category: preset key, "custom_N" or "uncategorized". */
  topExpenses: { category: string; usd: number; share: number }[]
  /** Categories spending ≥ 1.5× their previous average this month. */
  anomalies: { category: string; thisMonth: number; avgPrevious: number; ratio: number }[]
  debts: {
    ref: string
    type: "PAYABLE" | "RECEIVABLE"
    remainingUsd: number
    totalUsd: number
    annualRatePct: number
    daysLeft: number | null
    status: "ACTIVE" | "PARTIALLY_PAID" | "OVERDUE"
  }[]
  payableUsd: number
  receivableUsd: number
  /** Estimated monthly amount needed to meet payable due dates. */
  monthlyDebtService: number
  /** monthlyDebtService / avgIncome, or null without income. */
  dti: number | null
  payablesDue30: number
  receivablesDue30: number
  /** Cash plus one month of average net flow. */
  projectedCash30: number
  /** max(0, payablesDue30 - projectedCash30) */
  shortfall30: number
  overduePayables: number
  overdueReceivables: number
  /** 0–100 */
  score: number
}

export type SnapshotLabels = {
  debts: Record<string, string>
  categories: Record<string, string>
}

/** Principal movements of debts aren't spending or earning. */
const DEBT_FLOW_KEYS = new Set([
  ...Object.values(DEBT_CATEGORY_PRESETS).map((p) => p.key),
  ...Object.values(DISBURSEMENT_CATEGORY_PRESETS).map((p) => p.key),
])

const r2 = (n: number) => roundMoney(n, "USD")

export function computeSnapshot(input: {
  workspaceType: WorkspaceType
  wallets: Wallet[]
  transactions: Transaction[]
  categories: Category[]
  debts: Debt[]
  khrPerUsd: number
  categoryLabel: (c: Category) => string
  today?: string
}): { snapshot: Snapshot; labels: SnapshotLabels } {
  const { wallets, transactions, categories, debts, khrPerUsd } = input
  const today = input.today ?? todayDate()
  const now = new Date(`${today}T12:00:00`)
  const usd = (amount: number, currency: "USD" | "KHR") => (currency === "USD" ? amount : amount / khrPerUsd)

  // --- categories: preset keys are generic; custom ones get anonymous ids
  const labels: SnapshotLabels = { debts: {}, categories: { uncategorized: "—" } }
  const categoryKey = new Map<string, string>()
  let custom = 0
  for (const c of categories) {
    const key = c.preset_key ?? `custom_${++custom}`
    categoryKey.set(c.id, key)
    labels.categories[key] = input.categoryLabel(c)
  }
  const keyOf = (tx: Transaction) => (tx.category_id ? (categoryKey.get(tx.category_id) ?? "uncategorized") : "uncategorized")

  // --- cash
  const active = wallets.filter((w) => !w.archived_at)
  const cashUsd = r2(active.reduce((acc, w) => acc + usd(w.balance, w.currency), 0))

  // --- monthly flows (excluding transfers and debt principal)
  const flows = transactions.filter((tx) => tx.type !== "TRANSFER" && !DEBT_FLOW_KEYS.has(keyOf(tx)))
  const currentKey = monthKey(now)
  const monthKeys = [-3, -2, -1, 0].map((i) => monthKey(addMonths(monthStart(currentKey), i)))
  const months = monthKeys.map((m) => {
    const rows = flows.filter((tx) => monthKey(new Date(tx.transaction_date)) === m)
    const sum = (type: "INCOME" | "EXPENSE") =>
      r2(rows.filter((tx) => tx.type === type).reduce((acc, tx) => acc + usd(tx.amount, tx.currency), 0))
    return { month: m, income: sum("INCOME"), expense: sum("EXPENSE") }
  })
  const current = months[months.length - 1]
  const previous = months.slice(0, -1).filter((m) => m.income > 0 || m.expense > 0)
  // Average of previous active months. Without history, use this month: income
  // as-is (salaries arrive once), expenses projected to a full month.
  const daysElapsed = now.getDate()
  const daysInMonth = getDaysInMonth(now)
  const projection = daysInMonth / Math.max(daysElapsed, 1)
  const avgIncome = r2(previous.length ? previous.reduce((a, m) => a + m.income, 0) / previous.length : current.income)
  const avgExpense = r2(
    previous.length ? previous.reduce((a, m) => a + m.expense, 0) / previous.length : current.expense * projection,
  )
  const savingsRate = avgIncome > 0 ? Math.round(((avgIncome - avgExpense) / avgIncome) * 1000) / 1000 : null

  // --- spending by category this month, and anomalies vs previous months
  const thisMonthExpenses = flows.filter((tx) => tx.type === "EXPENSE" && monthKey(new Date(tx.transaction_date)) === currentKey)
  const byCategory = new Map<string, number>()
  for (const tx of thisMonthExpenses) byCategory.set(keyOf(tx), (byCategory.get(keyOf(tx)) ?? 0) + usd(tx.amount, tx.currency))
  const topExpenses = [...byCategory.entries()]
    .map(([category, total]) => ({ category, usd: r2(total), share: current.expense ? Math.round((total / current.expense) * 100) / 100 : 0 }))
    .sort((a, b) => b.usd - a.usd)
    .slice(0, 5)

  const previousMonths = monthKeys.slice(0, -1)
  const anomalies = topExpenses.flatMap(({ category, usd: thisMonth }) => {
    const totals = previousMonths.map((m) =>
      flows
        .filter((tx) => tx.type === "EXPENSE" && keyOf(tx) === category && monthKey(new Date(tx.transaction_date)) === m)
        .reduce((acc, tx) => acc + usd(tx.amount, tx.currency), 0),
    )
    const active = totals.filter((t) => t > 0)
    if (!active.length) return []
    const avgPrevious = active.reduce((a, b) => a + b, 0) / active.length
    const ratio = thisMonth / avgPrevious
    return ratio >= 1.5 && thisMonth - avgPrevious >= 5
      ? [{ category, thisMonth, avgPrevious: r2(avgPrevious), ratio: Math.round(ratio * 10) / 10 }]
      : []
  })

  // --- debts (anonymous refs P1.., R1..)
  const open = debts.filter((d) => debtStatus(d, today) !== "SETTLED")
  let p = 0
  let r = 0
  const debtRows = open.map((d) => {
    const ref = d.type === "PAYABLE" ? `P${++p}` : `R${++r}`
    labels.debts[ref] = d.party_name
    return {
      ref,
      type: d.type,
      remainingUsd: r2(usd(remaining(d), d.currency)),
      totalUsd: r2(usd(d.total_amount, d.currency)),
      annualRatePct: d.interest_period === "MONTH" ? d.interest_rate * 12 : d.interest_rate,
      daysLeft: daysLeft(d, today),
      status: debtStatus(d, today) as "ACTIVE" | "PARTIALLY_PAID" | "OVERDUE",
    }
  })
  const payables = debtRows.filter((d) => d.type === "PAYABLE")
  const receivables = debtRows.filter((d) => d.type === "RECEIVABLE")
  const sum = (rows: typeof debtRows) => r2(rows.reduce((a, d) => a + d.remainingUsd, 0))
  const within30 = (d: (typeof debtRows)[number]) => d.daysLeft !== null && d.daysLeft <= 30

  const monthlyDebtService = r2(
    payables.reduce((acc, d) => {
      if (d.daysLeft === null) return acc + d.remainingUsd / 12 // no due date: assume a year
      return acc + (d.daysLeft <= 30 ? d.remainingUsd : d.remainingUsd / (d.daysLeft / 30))
    }, 0),
  )
  const dti = avgIncome > 0 ? Math.round((monthlyDebtService / avgIncome) * 100) / 100 : null
  const payablesDue30 = sum(payables.filter(within30))
  const receivablesDue30 = sum(receivables.filter(within30))
  const projectedCash30 = r2(cashUsd + (avgIncome - avgExpense))
  const shortfall30 = r2(Math.max(0, payablesDue30 - projectedCash30))
  const overduePayables = payables.filter((d) => d.status === "OVERDUE").length
  const overdueReceivables = receivables.filter((d) => d.status === "OVERDUE").length

  // --- health score
  let score = 100
  if (savingsRate !== null) score -= savingsRate < 0 ? 25 : savingsRate < 0.1 ? 10 : 0
  else if (avgExpense > 0) score -= 15
  if (dti !== null) score -= dti > 0.5 ? 30 : dti > 0.36 ? 15 : 0
  else if (monthlyDebtService > 0) score -= 15
  if (shortfall30 > 0) score -= 25
  score -= Math.min(20, overduePayables * 10)
  if (avgExpense > 0 && cashUsd < avgExpense) score -= 10
  score = Math.max(0, Math.min(100, Math.round(score)))

  return {
    labels,
    snapshot: {
      asOf: today,
      workspaceType: input.workspaceType,
      khrPerUsd,
      cashUsd,
      walletCount: active.length,
      months,
      avgIncome,
      avgExpense,
      thisMonth: { income: current.income, expense: current.expense, net: r2(current.income - current.expense), daysElapsed, daysInMonth },
      savingsRate,
      topExpenses,
      anomalies,
      debts: debtRows,
      payableUsd: sum(payables),
      receivableUsd: sum(receivables),
      monthlyDebtService,
      dti,
      payablesDue30,
      receivablesDue30,
      projectedCash30,
      shortfall30,
      overduePayables,
      overdueReceivables,
      score,
    },
  }
}

export function scoreBand(score: number): "good" | "fair" | "poor" {
  return score >= 75 ? "good" : score >= 50 ? "fair" : "poor"
}

export const monthLabel = (key: string) => format(monthStart(key), "MM/yyyy")
