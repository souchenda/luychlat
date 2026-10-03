"use client"

import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query"

import { useRepo } from "@/lib/data/hooks"
import type { Currency } from "@/lib/data/types"
import type { GoldKind, GoldRates, JewelryType, PlatinumGrade } from "@/lib/gold"
import { useMarket } from "@/lib/market"
import { effectiveRates } from "@/lib/market-calc"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

/** A row of public.gold_holdings. */
export type GoldHolding = {
  id: string
  workspace_id: string
  name: string
  kind: GoldKind
  /** Platinum / white gold only. */
  grade: PlatinumGrade | null
  jewelry_type: JewelryType | null
  weight_hun: number
  purchase_date: string | null
  purchase_price: number | null
  purchase_currency: Currency | null
  note: string | null
  created_at: string
}
export type GoldHoldingInput = Pick<GoldHolding, "name" | "kind" | "grade" | "jewelry_type" | "weight_hun" | "purchase_date" | "purchase_price" | "purchase_currency" | "note">

const toHolding = (row: GoldHolding): GoldHolding => ({
  ...row,
  weight_hun: Number(row.weight_hun),
  purchase_price: row.purchase_price == null ? null : Number(row.purchase_price),
})

async function listHoldings(workspaceId: string): Promise<GoldHolding[]> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return []
  const { data, error } = await supabase.from("gold_holdings").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false })
  if (error) throw error
  return ((data ?? []) as GoldHolding[]).map(toHolding)
}

export const goldKeys = { holdings: (scope: string, ws: string) => ["gold", scope, ws] as const, rates: ["gold-rates"] as const }

/**
 * Rates (USD per damlung) for valuing holdings: the local Phnom Penh buy price
 * (CSNJ or the admin's daily override) for kilo gold and 24K, and the world
 * reference (spot × 1.20565 × purity) for the other purities. The old
 * per-purity admin rates (app_settings "gold_rates") are no longer used.
 */
export function useGoldRates(): { rates: GoldRates; updatedAt: string | null } {
  const live = useMarket().data
  return { rates: effectiveRates({}, live), updatedAt: live?.fetched_at ?? null }
}

export function useGoldHoldings(workspaceId: string | undefined) {
  const { scope } = useRepo()
  return useQuery({
    queryKey: goldKeys.holdings(scope, workspaceId ?? ""),
    enabled: Boolean(workspaceId),
    queryFn: () => listHoldings(workspaceId!),
  })
}

/** Holdings across several workspaces (the Zakat calculator counts Personal + Business). */
export function useGoldHoldingsOf(workspaceIds: string[]): GoldHolding[] {
  const { scope } = useRepo()
  const results = useQueries({
    queries: workspaceIds.map((ws) => ({ queryKey: goldKeys.holdings(scope, ws), queryFn: () => listHoldings(ws) })),
  })
  return results.flatMap((r) => r.data ?? [])
}

export function useGoldMutations(workspaceId: string | undefined) {
  const queryClient = useQueryClient()
  const { scope } = useRepo()
  const done = () => void queryClient.invalidateQueries({ queryKey: ["gold", scope] })
  const client = () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase || !workspaceId) throw new Error("offline")
    return supabase
  }
  return {
    add: useMutation({
      mutationFn: async (input: GoldHoldingInput) => {
        const { error } = await client().from("gold_holdings").insert({ workspace_id: workspaceId, ...input })
        if (error) throw error
      },
      onSuccess: done,
    }),
    update: useMutation({
      mutationFn: async ({ id, input }: { id: string; input: GoldHoldingInput }) => {
        const { error } = await client().from("gold_holdings").update(input).eq("id", id)
        if (error) throw error
      },
      onSuccess: done,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await client().from("gold_holdings").delete().eq("id", id)
        if (error) throw error
      },
      onSuccess: done,
    }),
  }
}
