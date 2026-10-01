"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { create } from "zustand"

import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useSessionStore } from "@/stores/session-store"

/**
 * The user's plan (public.my_plan()). Limits are enforced by the database
 * (wallets, family members, AI quota); the app uses this to show upgrade
 * prompts before hitting them and to gate client-side features (export,
 * credit score). Guest Mode is always Free.
 */
export type Tier = "FREE" | "PRO"

export type MyPlan = {
  tier: Tier
  plan_code: string
  /** End of the current Pro period (null on Free). */
  period_end: string | null
  /** Last paid plan, also when it has expired (for "renew"). */
  last_plan_code: string | null
  last_period_end: string | null
  max_wallets: number | null
  max_family_members: number | null
  ai_queries_per_month: number
  ai_queries_used: number
  can_export: boolean
  can_credit_score: boolean
  is_admin: boolean
}

export const FREE_PLAN: MyPlan = {
  tier: "FREE",
  plan_code: "FREE",
  period_end: null,
  last_plan_code: null,
  last_period_end: null,
  max_wallets: 2,
  max_family_members: 1,
  ai_queries_per_month: 0,
  ai_queries_used: 0,
  can_export: false,
  can_credit_score: false,
  is_admin: false,
}

export type PlanOption = { code: string; tier: Tier; price_usd: number; price_khr: number; period_days: number | null }

/** Shown before the plans load (and in Guest Mode); the database is the source of truth. */
export const DEFAULT_PRO_PLANS: PlanOption[] = [
  { code: "PRO_MONTHLY", tier: "PRO", price_usd: 2.99, price_khr: 12000, period_days: 30 },
  { code: "PRO_YEARLY", tier: "PRO", price_usd: 24.99, price_khr: 100000, period_days: 365 },
]

export const planKeys = {
  mine: (scope: string) => ["plan", scope] as const,
  options: ["plan-options"] as const,
}

export function usePlan() {
  const userId = useSessionStore((s) => s.user?.id ?? null)
  const query = useQuery({
    queryKey: planKeys.mine(userId ?? "guest"),
    enabled: Boolean(userId),
    staleTime: 60_000,
    queryFn: async () => {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) return FREE_PLAN
      const { data, error } = await supabase.rpc("my_plan")
      if (error) throw error
      return data as MyPlan
    },
  })
  const plan = userId ? (query.data ?? FREE_PLAN) : FREE_PLAN
  return { plan, isPro: plan.tier === "PRO", loading: Boolean(userId) && query.isLoading }
}

export function usePlanOptions() {
  const signedIn = useSessionStore((s) => Boolean(s.user))
  const query = useQuery({
    queryKey: planKeys.options,
    enabled: signedIn,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) return DEFAULT_PRO_PLANS
      const { data, error } = await supabase
        .from("plans")
        .select("code, tier, price_usd, price_khr, period_days")
        .eq("tier", "PRO")
        .eq("active", true)
        .order("sort_order")
      if (error) throw error
      return (data as PlanOption[]).map((p) => ({ ...p, price_usd: Number(p.price_usd), price_khr: Number(p.price_khr) }))
    },
  })
  return query.data ?? DEFAULT_PRO_PLANS
}

export function useRefreshPlan() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ["plan"] })
}

export type ProFeature = "credit_score" | "export"

export function useIsPro(feature: ProFeature): boolean {
  const { plan } = usePlan()
  return feature === "export" ? plan.can_export : plan.can_credit_score
}

/** Why the upgrade sheet was opened (shown as its first line). */
export type UpgradeReason = "general" | "wallets" | "family" | "export" | "ai" | "credit_score" | "reconcile"

export const useUpgradeStore = create<{ open: boolean; reason: UpgradeReason; show: (reason?: UpgradeReason) => void; close: () => void }>()(
  (set) => ({
    open: false,
    reason: "general",
    show: (reason = "general") => set({ open: true, reason }),
    close: () => set({ open: false }),
  }),
)

/** Opens the upgrade sheet. */
export const showUpgrade = (reason: UpgradeReason = "general") => useUpgradeStore.getState().show(reason)
