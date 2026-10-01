"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo } from "react"

import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { usePrefsStore } from "@/stores/prefs-store"
import { useSessionStore } from "@/stores/session-store"

import { guestRepo } from "./guest-repo"
import type { DataRepo } from "./repo"
import { createSupabaseRepo } from "./supabase-repo"
import type { TransferInput, WalletInput } from "./types"

/** Guest repo in Guest Mode, Supabase repo for signed-in users. */
export function useRepo(): { repo: DataRepo; scope: string } {
  const userId = useSessionStore((s) => s.user?.id ?? null)
  return useMemo(() => {
    const supabase = getSupabaseBrowserClient()
    if (userId && supabase) return { repo: createSupabaseRepo(supabase), scope: userId }
    return { repo: guestRepo, scope: "guest" }
  }, [userId])
}

export const queryKeys = {
  workspaces: (scope: string) => ["workspaces", scope] as const,
  wallets: (scope: string, workspaceId: string) => ["wallets", scope, workspaceId] as const,
  transfers: (scope: string, workspaceId: string) => ["transfers", scope, workspaceId] as const,
}

export function useWorkspaces() {
  const { repo, scope } = useRepo()
  return useQuery({ queryKey: queryKeys.workspaces(scope), queryFn: () => repo.listWorkspaces() })
}

/** The workspace picked in the switcher. */
export function useActiveWorkspace() {
  const type = usePrefsStore((s) => s.activeWorkspace)
  const query = useWorkspaces()
  return { ...query, workspace: query.data?.find((w) => w.type === type) }
}

export function useWallets(workspaceId: string | undefined) {
  const { repo, scope } = useRepo()
  return useQuery({
    queryKey: queryKeys.wallets(scope, workspaceId ?? ""),
    queryFn: () => repo.listWallets(workspaceId!),
    enabled: Boolean(workspaceId),
  })
}

export function useTransfers(workspaceId: string | undefined) {
  const { repo, scope } = useRepo()
  return useQuery({
    queryKey: queryKeys.transfers(scope, workspaceId ?? ""),
    queryFn: () => repo.listTransfers(workspaceId!),
    enabled: Boolean(workspaceId),
  })
}

/** Mutations for one workspace's wallets; each refreshes wallets (and transfers where relevant). */
export function useWalletMutations(workspaceId: string | undefined) {
  const { repo, scope } = useRepo()
  const queryClient = useQueryClient()
  const ws = workspaceId ?? ""
  const refresh = (withTransfers = false) => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.wallets(scope, ws) })
    if (withTransfers) void queryClient.invalidateQueries({ queryKey: queryKeys.transfers(scope, ws) })
  }

  return {
    create: useMutation({
      mutationFn: (input: WalletInput) => repo.createWallet(ws, input),
      onSuccess: () => refresh(),
    }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: string; input: WalletInput }) => repo.updateWallet(id, input),
      onSuccess: () => refresh(),
    }),
    reorder: useMutation({
      mutationFn: (orderedIds: string[]) => repo.reorderWallets(ws, orderedIds),
      onSuccess: () => refresh(),
    }),
    setArchived: useMutation({
      mutationFn: ({ id, archived }: { id: string; archived: boolean }) => repo.setWalletArchived(id, archived),
      onSuccess: () => refresh(),
    }),
    remove: useMutation({
      mutationFn: (id: string) => repo.deleteWallet(id),
      onSuccess: () => refresh(),
    }),
    transfer: useMutation({
      mutationFn: (input: Omit<TransferInput, "workspace_id">) => repo.createTransfer({ ...input, workspace_id: ws }),
      onSuccess: () => refresh(true),
    }),
  }
}
