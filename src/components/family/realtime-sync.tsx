"use client"

import { useQueryClient } from "@tanstack/react-query"
import { BellIcon } from "lucide-react"
import { useEffect } from "react"
import { toast } from "sonner"

import { queryKeys, useActiveWorkspace } from "@/lib/data/hooks"
import type { AppNotification } from "@/lib/data/types"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useSessionStore } from "@/stores/session-store"

type CacheKey =
  | "transactions"
  | "wallets"
  | "categories"
  | "debts"
  | "repayments"
  | "notifications"
  | "budgets"
  | "members"
  | "tontines"
  | "tontinePayments"

/**
 * Supabase Realtime for the active workspace: when another member (or another
 * device) changes something, the affected queries refetch, so both phones
 * show the same ledger without reloading. RLS still decides what is sent.
 * Guest Mode has no other devices, so this only runs for signed-in users.
 */
export function RealtimeSync() {
  const userId = useSessionStore((s) => s.user?.id)
  const { workspace } = useActiveWorkspace()
  const workspaceId = workspace?.id
  const queryClient = useQueryClient()

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase || !userId || !workspaceId) return
    const scope = userId
    const pending = new Set<CacheKey>()
    let timer: ReturnType<typeof setTimeout> | undefined

    // Bursts (e.g. a repayment = ledger row + repayment + wallet) refetch once.
    const flush = () => {
      for (const key of pending) void queryClient.invalidateQueries({ queryKey: [key, scope, workspaceId] })
      pending.clear()
    }
    const touch = (...keys: CacheKey[]) => {
      keys.forEach((k) => pending.add(k))
      clearTimeout(timer)
      timer = setTimeout(flush, 250)
    }
    // DELETE events can't be filtered by workspace and only carry the id:
    // refetch only when the deleted row is one we have loaded.
    const cached = (key: CacheKey, id: unknown) =>
      queryClient
        .getQueriesData<{ id: string }[]>({ queryKey: [key, scope, workspaceId] })
        .some(([, rows]) => Array.isArray(rows) && rows.some((r) => r.id === id))

    const filter = `workspace_id=eq.${workspaceId}`
    const changes = { schema: "public", filter } as const
    const channel = supabase
      .channel(`workspace:${workspaceId}`)
      .on("postgres_changes", { ...changes, event: "INSERT", table: "transactions" }, () =>
        touch("transactions", "wallets", "debts", "repayments"),
      )
      .on("postgres_changes", { ...changes, event: "UPDATE", table: "transactions" }, () =>
        touch("transactions", "wallets", "debts", "repayments"),
      )
      .on("postgres_changes", { schema: "public", event: "DELETE", table: "transactions" }, ({ old }) => {
        if (cached("transactions", old.id)) touch("transactions", "wallets", "debts", "repayments", "tontines", "tontinePayments")
      })
      .on("postgres_changes", { ...changes, event: "*", table: "wallets_accounts" }, () => touch("wallets"))
      .on("postgres_changes", { ...changes, event: "*", table: "categories" }, () => touch("categories"))
      .on("postgres_changes", { ...changes, event: "*", table: "budgets" }, () => touch("budgets"))
      .on("postgres_changes", { ...changes, event: "*", table: "tontines" }, () => touch("tontines"))
      .on("postgres_changes", { ...changes, event: "INSERT", table: "tontine_payments" }, () => touch("tontinePayments"))
      .on("postgres_changes", { schema: "public", event: "DELETE", table: "tontine_payments" }, ({ old }) => {
        if (cached("tontinePayments", old.id)) touch("tontinePayments")
      })
      .on("postgres_changes", { ...changes, event: "INSERT", table: "debts" }, () => touch("debts"))
      .on("postgres_changes", { ...changes, event: "UPDATE", table: "debts" }, () => touch("debts", "repayments"))
      .on("postgres_changes", { schema: "public", event: "DELETE", table: "debts" }, ({ old }) => {
        if (cached("debts", old.id)) touch("debts", "repayments", "transactions")
      })
      .on("postgres_changes", { ...changes, event: "*", table: "workspace_members" }, () => {
        touch("members")
        void queryClient.invalidateQueries({ queryKey: queryKeys.workspaces(scope) })
      })
      .on("postgres_changes", { ...changes, event: "INSERT", table: "notifications" }, ({ new: row }) => {
        touch("notifications")
        const n = row as AppNotification
        // Another member recorded something: tell this user right away.
        if (n.type === "ACTIVITY" && n.user_id === userId) {
          toast(n.title, { description: n.message || undefined, icon: <BellIcon className="size-4" /> })
        }
      })
      .subscribe()

    // Joining or leaving a family from another device updates the switcher.
    const mine = supabase
      .channel(`members:${userId}`)
      .on(
        "postgres_changes",
        { schema: "public", event: "*", table: "workspace_members", filter: `user_id=eq.${userId}` },
        () => void queryClient.invalidateQueries({ queryKey: queryKeys.workspaces(scope) }),
      )
      .subscribe()

    return () => {
      clearTimeout(timer)
      void supabase.removeChannel(channel)
      void supabase.removeChannel(mine)
    }
  }, [userId, workspaceId, queryClient])

  return null
}
