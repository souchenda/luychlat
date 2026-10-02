"use client"

import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query"

import { useRepo } from "@/lib/data/hooks"
import type { Currency } from "@/lib/data/types"
import { parseRates, type GoldKind, type GoldRates } from "@/lib/gold"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

/** A row of public.gold_holdings. */
export type GoldHolding = {
  id: string
  workspace_id: string
  name: string
  kind: GoldKind
  weight_hun: number
  purchase_date: string | null
  purchase_price: number | null
  purchase_currency: Currency | null
  note: string | null
  created_at: string
}
export type GoldHoldingInput = Pick<GoldHolding, "name" | "kind" | "weight_hun" | "purchase_date" | "purchase_price" | "purchase_currency" | "note">

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

/** Market rates (USD per damlung) set by admins, and when they were last updated. */
export function useGoldRates(): { rates: GoldRates; updatedAt: string | null } {
  const { data } = useQuery({
    queryKey: goldKeys.rates,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) return { value: {}, updated_at: null }
      const { data } = await supabase.from("app_settings").select("value, updated_at").eq("key", "gold_rates").maybeSingle()
      return (data ?? { value: {}, updated_at: null }) as { value: Record<string, unknown>; updated_at: string | null }
    },
  })
  return { rates: parseRates(data?.value), updatedAt: data?.updated_at ?? null }
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
