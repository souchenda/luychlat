"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useRepo } from "@/lib/data/hooks"
import type { Currency } from "@/lib/data/types"
import { toSnapshot, type PoolKind, type PoolSettleMode, type PoolSnapshot } from "@/lib/pool"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

export type PoolRow = { id: string; title: string; kind: PoolKind; status: "active" | "settled"; wallet_id: string; created_at: string }
export type NewPool = {
  kind: PoolKind
  title: string
  currency: Currency
  split: "EQUAL" | "CUSTOM"
  members: { name: string; pledged: number }[]
  target: number | null
  start: string | null
  end: string | null
  recordPaid: boolean
}

/** Thrown when a FREE account already has an active pool. */
export class PoolLimitError extends Error {}

const client = () => {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) throw new Error("offline")
  return supabase
}

export function usePools(workspaceId: string | undefined) {
  const { scope } = useRepo()
  return useQuery({
    queryKey: ["pools", scope, workspaceId ?? ""],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const { data, error } = await client()
        .from("pools")
        .select("id, title, kind, status, wallet_id, created_at")
        .eq("workspace_id", workspaceId!)
        .order("status", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(50)
      if (error) throw error
      return data as PoolRow[]
    },
  })
}

export function usePool(poolId: string | null | undefined) {
  const { scope } = useRepo()
  return useQuery({
    queryKey: ["pools", scope, "view", poolId ?? ""],
    enabled: Boolean(poolId),
    queryFn: async () => {
      const { data, error } = await client().rpc("pool_view", { p_pool_id: poolId })
      if (error) throw error
      return data ? toSnapshot(data as PoolSnapshot) : null
    },
  })
}

export function usePoolMutations() {
  const queryClient = useQueryClient()
  const done = (money = false) => {
    void queryClient.invalidateQueries({ queryKey: ["pools"] })
    if (money) {
      for (const key of ["transactions", "wallets", "categories"]) void queryClient.invalidateQueries({ queryKey: [key] })
    }
  }
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await client().rpc(fn, args)
    if (error) throw /plan_limit:pools/.test(error.message) ? new PoolLimitError() : error
    return data
  }
  return {
    create: useMutation({
      mutationFn: async (v: { workspaceId: string; pool: NewPool }) =>
        (await rpc("create_pool", {
          p_workspace_id: v.workspaceId,
          p_kind: v.pool.kind,
          p_title: v.pool.title,
          p_currency: v.pool.currency,
          p_split: v.pool.split,
          p_members: v.pool.members,
          p_target: v.pool.target,
          p_start: v.pool.start,
          p_end: v.pool.end,
          p_record_paid: v.pool.recordPaid,
        })) as string,
      onSuccess: () => done(true),
    }),
    contribute: useMutation({
      mutationFn: (v: { poolId: string; memberId: string; amount: number }) =>
        rpc("pool_record_contribution", { p_pool_id: v.poolId, p_member_id: v.memberId, p_amount: v.amount, p_date: null }),
      onSuccess: () => done(true),
    }),
    addMember: useMutation({
      mutationFn: async (v: { poolId: string; name: string; pledged: number }) => {
        const { error } = await client().from("pool_members").insert({ pool_id: v.poolId, name: v.name, pledged: v.pledged, sort: 999 })
        if (error) throw error
      },
      onSuccess: () => done(),
    }),
    sharing: useMutation({
      mutationFn: async (v: { poolId: string; on: boolean; photos?: boolean; members?: boolean }) =>
        (await rpc("pool_set_sharing", { p_pool_id: v.poolId, p_on: v.on, p_photos: v.photos ?? null, p_members: v.members ?? null })) as string | null,
      onSuccess: () => done(),
    }),
    telegramCode: useMutation({
      mutationFn: async (poolId: string) => (await rpc("pool_telegram_code", { p_pool_id: poolId })) as string,
    }),
    telegramUnlink: useMutation({
      mutationFn: (poolId: string) => rpc("pool_telegram_unlink", { p_pool_id: poolId }),
      onSuccess: () => done(),
    }),
    settle: useMutation({
      mutationFn: async (v: { poolId: string; mode: PoolSettleMode; nextTitle?: string }) =>
        rpc("pool_settle", { p_pool_id: v.poolId, p_mode: v.mode, p_next_title: v.nextTitle ?? null }),
      onSuccess: () => done(true),
    }),
  }
}
