import { differenceInCalendarMonths, parseISO } from "date-fns"

import type { Wallet } from "@/lib/data/types"
import { roundMoney } from "@/lib/money"

/**
 * Savings goals are savings pots: wallets with a target (goal_target). Money
 * moves in and out only by transfers from/to the user's other wallets, so net
 * worth stays the same when saving (enforced in the database).
 */
export const isGoal = (w: Pick<Wallet, "goal_target">) => w.goal_target != null

/** Goal kinds offered when creating one; stored in `icon`. */
export const GOAL_PRESETS = [
  { key: "goal_house", emoji: "🏠" },
  { key: "goal_emergency", emoji: "🛟" },
  { key: "goal_car", emoji: "🚗" },
  { key: "goal_education", emoji: "🎓" },
  { key: "goal_wedding", emoji: "💍" },
  { key: "goal_travel", emoji: "✈️" },
  { key: "goal_qurban", emoji: "🐑" },
  { key: "goal_other", emoji: "🎯" },
] as const

export function goalEmoji(icon: string | null | undefined): string {
  return GOAL_PRESETS.find((p) => p.key === icon)?.emoji ?? "🎯"
}

/**
 * A goal kept at a bank (a fixed deposit: icon "chipmong", "wing", "acleda"…) shows the bank's logo;
 * a personal goal (🏠, 🚗, emergency fund…) its emoji.
 */
export function goalShowsBank(icon: string | null | undefined, name: string | null | undefined, providerForName: (n: string | null | undefined) => { key: string } | null): boolean {
  if (icon?.startsWith("goal_")) return false
  if (icon && icon !== "other" && icon !== "cash") return true
  return Boolean(providerForName(name))
}

export type GoalProgress = {
  saved: number
  target: number
  remaining: number
  /** 0–100, one decimal. */
  percent: number
  reached: boolean
  /** Months left until the target date (at least 1), or null without a date / when past it. */
  monthsLeft: number | null
  /** Needed per month to reach the target by its date, or null. */
  perMonth: number | null
}

export function goalProgress(goal: Pick<Wallet, "balance" | "goal_target" | "goal_date" | "currency">, today: Date = new Date()): GoalProgress {
  const target = goal.goal_target ?? 0
  const saved = Math.max(0, goal.balance)
  const remaining = roundMoney(Math.max(0, target - saved), goal.currency)
  const percent = target > 0 ? Math.min(100, Math.round((saved / target) * 1000) / 10) : 0
  const reached = target > 0 && saved >= target
  let monthsLeft: number | null = null
  if (goal.goal_date && !reached) {
    const months = differenceInCalendarMonths(parseISO(goal.goal_date), today)
    monthsLeft = months >= 0 ? Math.max(1, months) : null
  }
  const perMonth = monthsLeft ? roundMoney(remaining / monthsLeft, goal.currency) : null
  return { saved, target, remaining, percent, reached, monthsLeft, perMonth }
}
