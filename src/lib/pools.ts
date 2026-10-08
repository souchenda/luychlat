"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createPoolArgs } from "@/lib/pool-ledger"

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
  /** Shares are people or families ("គ្រួសារទី ១"). */
  unit?: "PERSON" | "FAMILY"
  /** "pchumben": adds the offerings / travel / food categories. */
  template?: "pchumben" | null
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

/** A bank payment waiting for "whose share?" (a slip in the pool's group, or KHQR via AUTOBOK). */
export type PendingPoolPayment = { id: string; amount: number; currency: "USD" | "KHR"; payer: string | null; source: "slip" | "khqr"; created_at: string }

/** The pool's unassigned bank payments (keeper / writers; empty for others). */
export function usePendingPoolPayments(poolId: string | null | undefined, enabled: boolean) {
  const { scope } = useRepo()
  return useQuery({
    queryKey: ["pools", scope, "pending", poolId ?? ""],
    enabled: Boolean(poolId) && enabled,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await client().rpc("pool_pending_payments", { p_pool_id: poolId })
      if (error) return [] as PendingPoolPayment[]
      return ((data as PendingPoolPayment[] | null) ?? []).map((x) => ({ ...x, amount: Number(x.amount) }))
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
        // The target is a plan: the call carries shares only, never a payment (src/lib/pool-ledger.ts).
        (await rpc("create_pool", createPoolArgs(v.workspaceId, v.pool))) as string,
      onSuccess: () => done(true),
    }),
    contribute: useMutation({
      mutationFn: (v: { poolId: string; memberId: string; amount: number }) =>
        rpc("pool_record_contribution", { p_pool_id: v.poolId, p_member_id: v.memberId, p_amount: v.amount, p_date: null }),
      onSuccess: () => done(true),
    }),
    /** One tap: record what a member (or, without memberId, everyone) still owes against their target. Returns the new transactions (for Undo). */
    markPaid: useMutation({
      mutationFn: async (v: { poolId: string; memberId?: string }) => ((await rpc("pool_mark_paid", { p_pool_id: v.poolId, p_member_id: v.memberId ?? null })) as string[] | null) ?? [],
      onSuccess: () => done(true),
    }),
    /** Undo a one-tap payment: deleting its transactions also removes the pool link. */
    undoPaid: useMutation({
      mutationFn: async (transactionIds: string[]) => {
        const { error } = await client().from("transactions").delete().in("id", transactionIds)
        if (error) throw error
      },
      onSuccess: () => done(true),
    }),
    rename: useMutation({
      mutationFn: async (v: { memberId: string; name: string }) => {
        const { error } = await client().from("pool_members").update({ name: v.name }).eq("id", v.memberId)
        if (error) throw error
      },
      onSuccess: () => done(),
    }),
    /** Names added without a target that never paid (they hold no money, so nothing else changes). */
    removeIdle: useMutation({
      mutationFn: async (memberIds: string[]) => {
        const { error } = await client().from("pool_members").delete().in("id", memberIds)
        if (error) throw error
      },
      onSuccess: () => done(),
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
    // AUTOBOK → this pool: a new key (shown once; makes any older key stop working).
    // A waiting bank payment → this share (one tap on the pool page).
    assignPayment: useMutation({
      mutationFn: async (v: { pendingId: string; memberId: string }) =>
        (await rpc("pool_payment_assign", { p_pending: v.pendingId, p_member_id: v.memberId })) as { status: string; member?: string },
      onSuccess: () => done(true),
    }),
    // The KHQR members pay into (its text; null = the keeper's profile KHQR).
    setKhqr: useMutation({
      mutationFn: (v: { poolId: string; payload: string | null }) => rpc("pool_set_khqr", { p_pool_id: v.poolId, p_payload: v.payload }),
      onSuccess: () => done(),
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
