/**
 * App Luy Chlat as a startup (founder, 4/11/2026 — his own advisor, Admin › Super): from the real subscription numbers
 * (MRR, paying users, the month-by-month history) and the costs he lists, where the business stands and how far each stage
 * is — no guessing: every figure follows from a stated rule, and every forecast is labelled an estimate. Pure
 * (startup-economics.test.ts). Money in US dollars.
 *
 *   ARPU                 MRR ÷ paying users
 *   contribution         ARPU − the variable cost of one paying user (AI, payment fees…)
 *   break-even («លែងខាត»)        paying users whose contribution covers the fixed costs
 *   self-sustaining («រួចខ្លួន»)  … also the founder's own monthly pay
 *   steady profit («ចំណេញជាលំដាប់») … and the profit margin he aims for, on top
 *   months to a stage    the paying users still needed ÷ the average net new paying users a month (last 3 months);
 *                        null when growth is zero or negative (never «forever», never a made-up date)
 */
export type CostKind = "FIXED" | "PER_PAYING"
export type Cost = { name: string; usd: number; kind: CostKind }
export type StartupInput = {
  mrrUsd: number
  payingUsers: number
  /** Paying users at the end of each of the last months, oldest first (from the subscription history). */
  payingHistory: number[]
  costs: Cost[]
  /** The founder's own monthly pay, for «រួចខ្លួន» (0 until he sets it). */
  founderPayUsd: number
  /** The profit he aims for once self-sustaining, as a share of revenue (0.2 = 20%). */
  profitTarget: number
}
export type Stage = "LOSS" | "NEAR" | "BREAK_EVEN" | "SELF_SUSTAINING" | "PROFIT"
export type Milestone = { stage: Exclude<Stage, "LOSS" | "NEAR">; payingNeeded: number | null; monthsAway: number | null }
export type StartupReport = {
  arpu: number | null
  contribution: number | null
  fixedUsd: number
  perPayingUsd: number
  profitUsd: number
  stage: Stage
  netNewPerMonth: number | null
  milestones: Milestone[]
}

const cents = (n: number) => Math.round(n * 100) / 100

/** The average net new paying users a month over the last 3 months of history (null without 2 points). */
export function netNewPerMonth(history: number[]): number | null {
  const last = history.slice(-4)
  if (last.length < 2) return null
  return cents((last[last.length - 1] - last[0]) / (last.length - 1))
}

export function startupReport(i: StartupInput): StartupReport {
  const fixedUsd = cents(i.costs.filter((c) => c.kind === "FIXED").reduce((a, c) => a + c.usd, 0))
  const perPayingUsd = cents(i.costs.filter((c) => c.kind === "PER_PAYING").reduce((a, c) => a + c.usd, 0))
  const arpu = i.payingUsers > 0 ? cents(i.mrrUsd / i.payingUsers) : null
  const contribution = arpu === null ? null : cents(arpu - perPayingUsd)
  const profitUsd = cents(i.mrrUsd - fixedUsd - perPayingUsd * i.payingUsers)
  const growth = netNewPerMonth(i.payingHistory)

  // The paying users a monthly cost needs: ceil(cost ÷ contribution); for the profit target, the margin is on revenue.
  const needed = (cover: number, margin = 0): number | null => {
    if (contribution === null || arpu === null) return null
    const perUser = contribution - margin * arpu
    return perUser > 0 ? Math.ceil(cover / perUser) : null
  }
  const away = (target: number | null): number | null => {
    if (target === null) return null
    if (i.payingUsers >= target) return 0
    return growth && growth > 0 ? Math.ceil((target - i.payingUsers) / growth) : null
  }
  const be = needed(fixedUsd)
  const self = needed(fixedUsd + i.founderPayUsd)
  const profit = needed(fixedUsd + i.founderPayUsd, i.profitTarget)
  const milestones: Milestone[] = [
    { stage: "BREAK_EVEN", payingNeeded: be, monthsAway: away(be) },
    { stage: "SELF_SUSTAINING", payingNeeded: self, monthsAway: away(self) },
    { stage: "PROFIT", payingNeeded: profit, monthsAway: away(profit) },
  ]
  const reached = (n: number | null) => n !== null && i.payingUsers >= n
  const stage: Stage = reached(profit) && i.profitTarget > 0 ? "PROFIT" : reached(self) && i.founderPayUsd > 0 ? "SELF_SUSTAINING" : reached(be) ? "BREAK_EVEN" : be !== null && i.payingUsers >= be * 0.7 ? "NEAR" : "LOSS"
  return { arpu, contribution, fixedUsd, perPayingUsd, profitUsd, stage, netNewPerMonth: growth, milestones }
}

export const STAGE_LABEL: Record<Stage, string> = {
  LOSS: "កំពុងខាត",
  NEAR: "ជិតលែងខាត",
  BREAK_EVEN: "លែងខាតហើយ",
  SELF_SUSTAINING: "រួចខ្លួនហើយ",
  PROFIT: "ចំណេញជាលំដាប់",
}
