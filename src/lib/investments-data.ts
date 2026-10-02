"use client"

import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query"

import { useRepo } from "@/lib/data/hooks"
import { parseMarketPrices, type Investment, type InvestmentInput, type MarketPrices } from "@/lib/investments"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

const toInvestment = (row: Investment): Investment => ({
  ...row,
  quantity: Number(row.quantity),
  avg_cost: Number(row.avg_cost),
  current_price: row.current_price == null ? null : Number(row.current_price),
})

async function list(workspaceId: string): Promise<Investment[]> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return []
  const { data, error } = await supabase.from("investment_holdings").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false })
  if (error) throw error
  return ((data ?? []) as Investment[]).map(toInvestment)
}

const key = (scope: string, ws: string) => ["investments", scope, ws] as const

export function useInvestments(workspaceId: string | undefined) {
  const { scope } = useRepo()
  return useQuery({ queryKey: key(scope, workspaceId ?? ""), enabled: Boolean(workspaceId), queryFn: () => list(workspaceId!) })
}

/** Holdings across several workspaces (the Zakat calculator counts Personal + Business). */
export function useInvestmentsOf(workspaceIds: string[]): Investment[] {
  const { scope } = useRepo()
  return useQueries({ queries: workspaceIds.map((ws) => ({ queryKey: key(scope, ws), queryFn: () => list(ws) })) }).flatMap((r) => r.data ?? [])
}

/** Daily prices set by admins ("<market>:<symbol>" → price). */
export function useMarketPrices(): { prices: MarketPrices; updatedAt: string | null } {
  const { data } = useQuery({
    queryKey: ["market-prices"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) return { value: {}, updated_at: null }
      const { data } = await supabase.from("app_settings").select("value, updated_at").eq("key", "market_prices").maybeSingle()
      return (data ?? { value: {}, updated_at: null }) as { value: Record<string, unknown>; updated_at: string | null }
    },
  })
  return { prices: parseMarketPrices(data?.value), updatedAt: data?.updated_at ?? null }
}

export function useInvestmentMutations(workspaceId: string | undefined) {
  const queryClient = useQueryClient()
  const { scope } = useRepo()
  const done = () => void queryClient.invalidateQueries({ queryKey: ["investments", scope] })
  const client = () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase || !workspaceId) throw new Error("offline")
    return supabase
  }
  return {
    add: useMutation({
      mutationFn: async (input: InvestmentInput) => {
        const { error } = await client().from("investment_holdings").insert({ workspace_id: workspaceId, ...input })
        if (error) throw error
      },
      onSuccess: done,
    }),
    update: useMutation({
      mutationFn: async ({ id, input }: { id: string; input: InvestmentInput }) => {
        const { error } = await client().from("investment_holdings").update(input).eq("id", id)
        if (error) throw error
      },
      onSuccess: done,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await client().from("investment_holdings").delete().eq("id", id)
        if (error) throw error
      },
      onSuccess: done,
    }),
  }
}
