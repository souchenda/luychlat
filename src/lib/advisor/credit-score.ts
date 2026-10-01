/**
 * Financial health score on the familiar 300–850 credit-bureau scale. It is
 * computed on the device from four factors, each scored 0–1:
 *
 *   repayment (40%)  on-time debt repayment: no overdue payables
 *   dti       (30%)  debt-to-income: monthly debt service / average income
 *   savings   (20%)  savings rate: (income - expenses) / income
 *   buffer    (10%)  cash runway: months of average spending covered by cash
 *
 * It is an estimate for self-improvement, not a bureau score.
 */
export const SCORE_MIN = 300
export const SCORE_MAX = 850
export const SCORE_WEIGHTS = { repayment: 0.4, dti: 0.3, savings: 0.2, buffer: 0.1 } as const
export type ScoreFactor = keyof typeof SCORE_WEIGHTS
export type ScoreFactors = Record<ScoreFactor, number>
export type CreditBand = "excellent" | "good" | "fair" | "needs_work"

export type ScoreInput = {
  /** Open payables (money the user owes). */
  openPayables: number
  overduePayables: number
  dti: number | null
  monthlyDebtService: number
  savingsRate: number | null
  avgExpense: number
  cashUsd: number
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
const round2 = (n: number) => Math.round(n * 100) / 100
/** Linear from 0 at `zero` to 1 at `one` (either direction). */
const ramp = (value: number, zero: number, one: number) => clamp01((value - zero) / (one - zero))

export function scoreFactors(input: ScoreInput): ScoreFactors {
  // Repayment: any overdue payable costs most of this factor, more for each additional one.
  const repayment = input.overduePayables === 0 ? 1 : clamp01(0.6 - 0.2 * (input.overduePayables - 1))

  // DTI: ≤ 15% is excellent, ≥ 60% scores nothing; debt without income scores nothing.
  const dti =
    input.dti === null ? (input.monthlyDebtService > 0 ? 0 : 1) : ramp(input.dti, 0.6, 0.15)

  // Savings: ≥ 20% saved is full marks, spending 20% more than income is zero.
  const savings = input.savingsRate === null ? (input.avgExpense > 0 ? 0.2 : 0.5) : ramp(input.savingsRate, -0.2, 0.2)

  // Buffer: 6 months of spending in cash is full marks.
  const buffer = input.avgExpense > 0 ? ramp(input.cashUsd / input.avgExpense, 0, 6) : input.cashUsd > 0 ? 1 : 0.5

  return { repayment: round2(repayment), dti: round2(dti), savings: round2(savings), buffer: round2(buffer) }
}

export function creditScore(factors: ScoreFactors): number {
  const weighted = (Object.keys(SCORE_WEIGHTS) as ScoreFactor[]).reduce((acc, k) => acc + SCORE_WEIGHTS[k] * factors[k], 0)
  return Math.round(SCORE_MIN + (SCORE_MAX - SCORE_MIN) * weighted)
}

export function creditBand(score: number): CreditBand {
  return score >= 740 ? "excellent" : score >= 670 ? "good" : score >= 580 ? "fair" : "needs_work"
}

/** Position of a score on the meter, 0–1. */
export const scoreFraction = (score: number) => clamp01((score - SCORE_MIN) / (SCORE_MAX - SCORE_MIN))

/** Points each factor could still add, largest first (what to work on). */
export function scoreGaps(factors: ScoreFactors) {
  return (Object.keys(SCORE_WEIGHTS) as ScoreFactor[])
    .map((factor) => ({ factor, points: Math.round((SCORE_MAX - SCORE_MIN) * SCORE_WEIGHTS[factor] * (1 - factors[factor])) }))
    .filter((g) => g.points > 0)
    .sort((a, b) => b.points - a.points)
}
