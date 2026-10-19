import type { Wallet, WalletInput } from "@/lib/data/types"
import { roundRiel } from "@/lib/money"
import { SAR_PER_USD } from "@/lib/islamic/sar"

/**
 * «🕋 ផែនការសន្សំសម្រាប់ធ្វើរូកូន» (founder, 19/10/2026): how much to put aside each month for Hajj or Umrah, and the
 * savings goal that tracks it (a goal wallet tagged «goal_hajj» in the Personal space). The package amounts are the
 * founder's starting points, editable and labelled as estimates — the real price comes from the travel agency.
 * Pure (hajj-plan.test.ts); on /islamic only (Islamic Mode).
 */
export const HAJJ_PACKAGES = [
  { key: "hajj", label: "🕋 ធ្វើរូកូនហាជ (Hajj)", usd: 5000 },
  { key: "umrah", label: "🕌 ធ្វើអ៊ុមរ៉ោះ (Umrah)", usd: 2000 },
] as const
export type HajjPackage = (typeof HAJJ_PACKAGES)[number]["key"] | "custom"

export const HAJJ_YEARS = [1, 2, 3, 5] as const
export const HAJJ_DEFAULT_MONTHS = 36
export const HAJJ_GOAL_ICON = "goal_hajj"
export const HAJJ_GOAL_NAME = "សន្សំទៅធ្វើរូកូន"

export type HajjPlan = { monthlyUsd: number; monthlyKhr: number; dailyUsd: number; targetSar: number; targetKhr: number; left: number }

/**
 * The plan: what is still missing (target − already saved), spread over the months — rounded up to the cent so the
 * target is reached; riel the app computes to 100 ៛; the daily figure over a year of 365 days. Null when unusable.
 */
export function hajjPlan(o: { targetUsd: number; months: number; savedUsd?: number; usdKhr: number }): HajjPlan | null {
  const { targetUsd, months, usdKhr } = o
  if (!Number.isFinite(targetUsd) || targetUsd <= 0 || !Number.isInteger(months) || months < 1 || months > 240) return null
  const left = Math.max(0, targetUsd - Math.max(0, o.savedUsd ?? 0))
  const monthlyUsd = Math.ceil((left / months) * 100) / 100
  const rate = Number.isFinite(usdKhr) && usdKhr > 0 ? usdKhr : 0
  return {
    monthlyUsd,
    monthlyKhr: rate ? roundRiel(monthlyUsd * rate) : 0,
    dailyUsd: Math.round(((monthlyUsd * 12) / 365) * 100) / 100,
    targetSar: Math.round(targetUsd * SAR_PER_USD),
    targetKhr: rate ? roundRiel(targetUsd * rate) : 0,
    left: Math.round(left * 100) / 100,
  }
}

/** The member's active Hajj / Umrah goal (tagged goal_hajj, not archived), if any. */
export function findHajjGoal<W extends Pick<Wallet, "icon" | "goal_target" | "archived_at">>(wallets: W[]): W | null {
  return wallets.find((w) => w.icon === HAJJ_GOAL_ICON && w.goal_target != null && !w.archived_at) ?? null
}

/** Progress of a goal: saved, target, and the share (0–100, whole percent). */
export function hajjProgress(goal: { balance: number; goal_target?: number | null }) {
  const target = Number(goal.goal_target ?? 0)
  const saved = Math.max(0, Number(goal.balance) || 0)
  return { saved, target, percent: target > 0 ? Math.min(100, Math.floor((saved / target) * 100)) : 0 }
}

/** «[████████░░░░]» — 12 blocks. */
export const progressBlocks = (percent: number, width = 12) => {
  const full = Math.round((Math.max(0, Math.min(100, percent)) / 100) * width)
  return `[${"█".repeat(full)}${"░".repeat(width - full)}]`
}

/** The new goal: «សន្សំទៅធ្វើរូកូន», the target in USD, its date `months` from today. */
export function hajjGoalInput(targetUsd: number, months: number, today: Date = new Date()): WalletInput {
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + months, today.getUTCDate()))
  return {
    name: HAJJ_GOAL_NAME,
    icon: HAJJ_GOAL_ICON,
    color: null,
    visibility: "SHARED", // as the goal form: the Personal space itself is the member's own
    currency: "USD",
    balance: 0,
    goal_target: Math.round(targetUsd * 100) / 100,
    goal_date: d.toISOString().slice(0, 10),
  }
}
