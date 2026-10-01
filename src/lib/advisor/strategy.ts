import type { Snapshot } from "./snapshot"

export type PayoffPlan = {
  /** Debt refs in payoff order. */
  order: string[]
  months: number
  totalInterest: number
  /** True when the plan can't finish within MAX_MONTHS at this budget. */
  incomplete: boolean
}

export type StrategyComparison = {
  monthlyBudget: number
  /** Budget wasn't covered by surplus, so a 12-month payoff pace was assumed. */
  budgetAssumed: boolean
  snowball: PayoffPlan
  avalanche: PayoffPlan
  recommended: "snowball" | "avalanche"
  interestSaved: number
}

const MAX_MONTHS = 600

/**
 * Pays `budget` every month into debts in `order` (extra rolls over to the
 * next), with monthly simple interest on remaining balances.
 */
function simulate(debts: Snapshot["debts"], order: string[], budget: number): PayoffPlan {
  const balance = new Map(debts.map((d) => [d.ref, d.remainingUsd]))
  const rate = new Map(debts.map((d) => [d.ref, d.annualRatePct / 100 / 12]))
  let months = 0
  let totalInterest = 0
  while ([...balance.values()].some((b) => b > 0.005) && months < MAX_MONTHS) {
    months++
    for (const [ref, b] of balance) {
      const interest = b * (rate.get(ref) ?? 0)
      totalInterest += interest
      balance.set(ref, b + interest)
    }
    let cash = budget
    for (const ref of order) {
      const owed = balance.get(ref) ?? 0
      const pay = Math.min(owed, cash)
      balance.set(ref, owed - pay)
      cash -= pay
      if (cash <= 0) break
    }
  }
  return {
    order,
    months,
    totalInterest: Math.round(totalInterest * 100) / 100,
    incomplete: months >= MAX_MONTHS,
  }
}

/** Snowball (smallest balance first) vs Avalanche (highest interest first) on the open payables. */
export function compareStrategies(snapshot: Snapshot): StrategyComparison | null {
  const payables = snapshot.debts.filter((d) => d.type === "PAYABLE" && d.remainingUsd > 0)
  if (!payables.length) return null

  const total = payables.reduce((a, d) => a + d.remainingUsd, 0)
  const surplus = snapshot.avgIncome - snapshot.avgExpense
  const budgetAssumed = surplus < total / 24
  const monthlyBudget = Math.round((budgetAssumed ? total / 12 : surplus) * 100) / 100

  const snowballOrder = [...payables].sort((a, b) => a.remainingUsd - b.remainingUsd).map((d) => d.ref)
  const avalancheOrder = [...payables]
    .sort((a, b) => b.annualRatePct - a.annualRatePct || a.remainingUsd - b.remainingUsd)
    .map((d) => d.ref)

  const snowball = simulate(payables, snowballOrder, monthlyBudget)
  const avalanche = simulate(payables, avalancheOrder, monthlyBudget)
  const interestSaved = Math.round((snowball.totalInterest - avalanche.totalInterest) * 100) / 100
  // Avalanche wins on cost; Snowball's quick wins are worth it when the saving is negligible.
  const recommended = interestSaved >= Math.max(5, total * 0.01) ? "avalanche" : "snowball"

  return { monthlyBudget, budgetAssumed, snowball, avalanche, recommended, interestSaved }
}
