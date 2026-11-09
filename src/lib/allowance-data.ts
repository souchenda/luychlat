"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import type { Allowance } from "@/lib/allowance"
import { useRepo } from "@/lib/data/hooks"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

/** The pocket-money settings of a workspace's children (founder, 9/11/2026 — lib/allowance.ts), by their wallets. */
export function useAllowances(walletIds: string[]) {
  const { scope } = useRepo()
  const ids = [...walletIds].sort()
  return useQuery({
    queryKey: ["allowances", scope, ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const db = getSupabaseBrowserClient()
      if (!db) return [] as Allowance[]
      const { data, error } = await db.from("allowances").select("id, wallet_id, from_wallet_id, amount, weekday, given_on, created_at").in("wallet_id", ids)
      if (error) throw error
      return ((data ?? []) as Allowance[]).map((a) => ({ ...a, amount: Number(a.amount) }))
    },
  })
}

export function useAllowanceMutations() {
  const queryClient = useQueryClient()
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["allowances"] })
  const db = () => {
    const c = getSupabaseBrowserClient()
    if (!c) throw new Error("signed_out")
    return c
  }
  return {
    save: useMutation({
      mutationFn: async (a: { wallet_id: string; from_wallet_id: string; amount: number; weekday: number }) => {
        const { error } = await db().from("allowances").upsert(a, { onConflict: "wallet_id" })
        if (error) throw error
      },
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await db().from("allowances").delete().eq("id", id)
        if (error) throw error
      },
      onSuccess: refresh,
    }),
    given: useMutation({
      mutationFn: async ({ id, day }: { id: string; day: string }) => {
        const { error } = await db().from("allowances").update({ given_on: day }).eq("id", id)
        if (error) throw error
      },
      onSuccess: refresh,
    }),
  }
}
