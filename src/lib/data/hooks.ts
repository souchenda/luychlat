"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"

import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { usePrefsStore } from "@/stores/prefs-store"
import { useSessionStore } from "@/stores/session-store"

import { guestRepo } from "./guest-repo"
import type { DataRepo } from "./repo"
import { createSupabaseRepo } from "./supabase-repo"
import type {
  CategoryInput,
  DebtInput,
  EntryInput,
  RepaymentInput,
  TransactionFilter,
  TransferInput,
  TransferUpdate,
  WalletInput,
} from "./types"

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
  categories: (scope: string, workspaceId: string) => ["categories", scope, workspaceId] as const,
  /** Prefix for every transaction list of a workspace. */
  transactions: (scope: string, workspaceId: string) => ["transactions", scope, workspaceId] as const,
  debts: (scope: string, workspaceId: string) => ["debts", scope, workspaceId] as const,
  /** Prefix for every repayment list of a workspace. */
  repayments: (scope: string, workspaceId: string) => ["repayments", scope, workspaceId] as const,
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

export function useCategories(workspaceId: string | undefined) {
  const { repo, scope } = useRepo()
  return useQuery({
    queryKey: queryKeys.categories(scope, workspaceId ?? ""),
    queryFn: () => repo.listCategories(workspaceId!),
    enabled: Boolean(workspaceId),
  })
}

export function useTransactions(workspaceId: string | undefined, filter: TransactionFilter = {}) {
  const { repo, scope } = useRepo()
  return useQuery({
    queryKey: [...queryKeys.transactions(scope, workspaceId ?? ""), filter],
    queryFn: () => repo.listTransactions(workspaceId!, filter),
    enabled: Boolean(workspaceId),
  })
}

/** True when the wallet appears in any transaction (its currency is then locked). */
export function useWalletHasHistory(workspaceId: string | undefined, walletId: string | undefined) {
  const query = useTransactions(walletId ? workspaceId : undefined, { walletId, limit: 1 })
  return (query.data?.length ?? 0) > 0
}

/** Resolves a receipt reference to a displayable URL (object URLs are revoked on change). */
export function useReceiptUrl(ref: string | null | undefined) {
  const { repo } = useRepo()
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!ref) return setUrl(null)
    let cancelled = false
    let created: string | null = null
    void repo.getReceiptUrl(ref).then((u) => {
      created = u
      if (!cancelled) setUrl(u)
    })
    return () => {
      cancelled = true
      if (created?.startsWith("blob:")) URL.revokeObjectURL(created)
    }
  }, [ref, repo])
  return url
}

function useInvalidate(workspaceId: string | undefined) {
  const { scope } = useRepo()
  const queryClient = useQueryClient()
  const ws = workspaceId ?? ""
  return (...keys: ("wallets" | "categories" | "transactions" | "debts" | "repayments")[]) =>
    keys.forEach((k) => void queryClient.invalidateQueries({ queryKey: queryKeys[k](scope, ws) }))
}

/** Mutations for one workspace's wallets. */
export function useWalletMutations(workspaceId: string | undefined) {
  const { repo } = useRepo()
  const invalidate = useInvalidate(workspaceId)
  const ws = workspaceId ?? ""

  return {
    create: useMutation({
      mutationFn: (input: WalletInput) => repo.createWallet(ws, input),
      onSuccess: () => invalidate("wallets"),
    }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: string; input: WalletInput }) => repo.updateWallet(id, input),
      onSuccess: () => invalidate("wallets"),
    }),
    reorder: useMutation({
      mutationFn: (orderedIds: string[]) => repo.reorderWallets(ws, orderedIds),
      onSuccess: () => invalidate("wallets"),
    }),
    setArchived: useMutation({
      mutationFn: ({ id, archived }: { id: string; archived: boolean }) => repo.setWalletArchived(id, archived),
      onSuccess: () => invalidate("wallets"),
    }),
    remove: useMutation({
      mutationFn: (id: string) => repo.deleteWallet(id),
      onSuccess: () => invalidate("wallets"),
    }),
    transfer: useMutation({
      mutationFn: (input: Omit<TransferInput, "workspace_id">) => repo.createTransfer({ ...input, workspace_id: ws }),
      onSuccess: () => invalidate("wallets", "transactions"),
    }),
  }
}

/** Income / expense / transfer edits; every change refreshes balances too. */
export function useTransactionMutations(workspaceId: string | undefined) {
  const { repo } = useRepo()
  const invalidate = useInvalidate(workspaceId)
  const ws = workspaceId ?? ""
  // Deleting a repayment's ledger row also changes its debt.
  const onSuccess = () => invalidate("wallets", "transactions", "debts", "repayments")

  return {
    createEntry: useMutation({ mutationFn: (input: EntryInput) => repo.createEntry(ws, input), onSuccess }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: string; input: EntryInput | TransferUpdate }) => repo.updateTransaction(id, input),
      onSuccess,
    }),
    remove: useMutation({ mutationFn: (id: string) => repo.deleteTransaction(id), onSuccess }),
    uploadReceipt: useMutation({ mutationFn: (image: Blob) => repo.uploadReceipt(image) }),
  }
}

export function useCategoryMutations(workspaceId: string | undefined) {
  const { repo } = useRepo()
  const invalidate = useInvalidate(workspaceId)
  const ws = workspaceId ?? ""

  return {
    create: useMutation({
      mutationFn: (input: CategoryInput) => repo.createCategory(ws, input),
      onSuccess: () => invalidate("categories"),
    }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: string; input: CategoryInput }) => repo.updateCategory(id, input),
      onSuccess: () => invalidate("categories"),
    }),
    remove: useMutation({
      mutationFn: (id: string) => repo.deleteCategory(id),
      onSuccess: () => invalidate("categories", "transactions"),
    }),
  }
}

export function useDebts(workspaceId: string | undefined) {
  const { repo, scope } = useRepo()
  return useQuery({
    queryKey: queryKeys.debts(scope, workspaceId ?? ""),
    queryFn: () => repo.listDebts(workspaceId!),
    enabled: Boolean(workspaceId),
  })
}

export function useRepayments(workspaceId: string | undefined, debtId: string | undefined) {
  const { repo, scope } = useRepo()
  return useQuery({
    queryKey: [...queryKeys.repayments(scope, workspaceId ?? ""), debtId],
    queryFn: () => repo.listRepayments(debtId!),
    enabled: Boolean(workspaceId && debtId),
  })
}

/** Debt CRUD and repayments; repayments also move wallets and add ledger rows. */
export function useDebtMutations(workspaceId: string | undefined) {
  const { repo } = useRepo()
  const invalidate = useInvalidate(workspaceId)
  const ws = workspaceId ?? ""
  const moneyMoved = () => invalidate("debts", "repayments", "wallets", "transactions", "categories")

  return {
    create: useMutation({ mutationFn: (input: DebtInput) => repo.createDebt(ws, input), onSuccess: () => invalidate("debts") }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: string; input: DebtInput }) => repo.updateDebt(id, input),
      onSuccess: () => invalidate("debts"),
    }),
    remove: useMutation({
      mutationFn: (id: string) => repo.deleteDebt(id),
      onSuccess: () => invalidate("debts", "repayments", "transactions"),
    }),
    recordRepayment: useMutation({ mutationFn: (input: RepaymentInput) => repo.recordRepayment(input), onSuccess: moneyMoved }),
    deleteRepayment: useMutation({ mutationFn: (id: string) => repo.deleteRepayment(id), onSuccess: moneyMoved }),
  }
}
