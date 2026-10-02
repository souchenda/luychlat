"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useRepo } from "@/lib/data/hooks"
import type { Diamond, DiamondInput } from "@/lib/diamonds"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

const num = (v: unknown) => (v == null ? null : Number(v))
const toDiamond = (row: Diamond): Diamond => ({
  ...row,
  size_li: num(row.size_li),
  carat: num(row.carat),
  purchase_price: Number(row.purchase_price),
  buyback_pct: Number(row.buyback_pct),
  tradein_pct: num(row.tradein_pct),
})

export function useDiamonds(workspaceId: string | undefined) {
  const { scope } = useRepo()
  return useQuery({
    queryKey: ["diamonds", scope, workspaceId ?? ""],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) return [] as Diamond[]
      const { data, error } = await supabase.from("diamond_holdings").select("*").eq("workspace_id", workspaceId!).order("created_at", { ascending: false })
      if (error) throw error
      return ((data ?? []) as Diamond[]).map(toDiamond)
    },
  })
}

export function useDiamondMutations(workspaceId: string | undefined) {
  const queryClient = useQueryClient()
  const { scope } = useRepo()
  const done = () => void queryClient.invalidateQueries({ queryKey: ["diamonds", scope] })
  const client = () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase || !workspaceId) throw new Error("offline")
    return supabase
  }
  return {
    add: useMutation({
      mutationFn: async (input: DiamondInput) => {
        const { error } = await client().from("diamond_holdings").insert({ workspace_id: workspaceId, ...input })
        if (error) throw error
      },
      onSuccess: done,
    }),
    update: useMutation({
      mutationFn: async ({ id, input }: { id: string; input: DiamondInput }) => {
        const { error } = await client().from("diamond_holdings").update(input).eq("id", id)
        if (error) throw error
      },
      onSuccess: done,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await client().from("diamond_holdings").delete().eq("id", id)
        if (error) throw error
      },
      onSuccess: done,
    }),
  }
}
