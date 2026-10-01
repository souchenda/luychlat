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
  BudgetInput,
  CategoryInput,
  DebtDisbursement,
  DebtInput,
  EntryInput,
  RepaymentInput,
  TelegramSettings,
  TontineCollectInput,
  TontineInput,
  TontinePayInput,
  TransactionFilter,
  TransferInput,
  TransferUpdate,
  Wallet,
  WalletInput,
  WalletUpdate,
  Workspace,
  WorkspaceRole,
} from "./types"

/** Guest repo in Guest Mode, Supabase repo for signed-in users. */
export function useRepo(): { repo: DataRepo; scope: string } {
  const userId = useSessionStore((s) => s.user?.id ?? null)
  return useMemo(() => {
    const supabase = getSupabaseBrowserClient()
    if (userId && supabase) return { repo: createSupabaseRepo(supabase, userId), scope: userId }
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
  notifications: (scope: string, workspaceId: string) => ["notifications", scope, workspaceId] as const,
  telegram: (scope: string) => ["telegram", scope] as const,
  profile: (scope: string) => ["profile", scope] as const,
  members: (scope: string, workspaceId: string) => ["members", scope, workspaceId] as const,
  invites: (scope: string, workspaceId: string) => ["invites", scope, workspaceId] as const,
  budgets: (scope: string, workspaceId: string) => ["budgets", scope, workspaceId] as const,
  tontines: (scope: string, workspaceId: string) => ["tontines", scope, workspaceId] as const,
  tontinePayments: (scope: string, workspaceId: string) => ["tontinePayments", scope, workspaceId] as const,
}

export function useWorkspaces() {
  const { repo, scope } = useRepo()
  return useQuery({ queryKey: queryKeys.workspaces(scope), queryFn: () => repo.listWorkspaces() })
}

/**
 * Resolves the switcher choice: Personal/Business are the user's own; Family
 * is the remembered family workspace (own or joined), else the first one.
 * Falls back to Personal when no family workspace is available any more.
 */
export function pickWorkspace(workspaces: Workspace[] | undefined, type: Workspace["type"], familyId: string | null) {
  if (!workspaces) return undefined
  const own = (t: Workspace["type"]) => workspaces.find((w) => w.type === t && w.role === "OWNER") ?? workspaces.find((w) => w.type === t)
  if (type === "FAMILY") {
    const families = workspaces.filter((w) => w.type === "FAMILY")
    return families.find((w) => w.id === familyId) ?? families[0] ?? own("PERSONAL")
  }
  return own(type)
}

/** The workspace picked in the switcher. */
export function useActiveWorkspace() {
  const type = usePrefsStore((s) => s.activeWorkspace)
  const familyId = usePrefsStore((s) => s.activeFamilyId)
  const query = useWorkspaces()
  const workspace = useMemo(() => pickWorkspace(query.data, type, familyId), [query.data, type, familyId])
  return { ...query, workspace }
}

/** The current user as seen by the data layer (cloud account or this device's guest identity). */
export function useProfile() {
  const { repo, scope } = useRepo()
  return useQuery({ queryKey: queryKeys.profile(scope), queryFn: () => repo.getProfile(), staleTime: 60_000 })
}

/** Whether the current user may add or change records in the workspace (viewers can't). */
export function canWrite(workspace: Workspace | undefined) {
  return workspace?.role === "OWNER" || workspace?.role === "MEMBER"
}

/** Wallets the current user may move money with: shared ones and their own personal ones. */
export function usableWallets(wallets: Wallet[], userId: string | undefined) {
  return wallets.filter((w) => w.visibility !== "PERSONAL" || !w.owner_id || w.owner_id === userId)
}

export function useMembers(workspaceId: string | undefined) {
  const { repo, scope } = useRepo()
  return useQuery({
    queryKey: queryKeys.members(scope, workspaceId ?? ""),
    queryFn: () => repo.listMembers(workspaceId!),
    enabled: Boolean(workspaceId),
  })
}

export function useInvites(workspaceId: string | undefined, enabled = true) {
  const { repo, scope } = useRepo()
  return useQuery({
    queryKey: queryKeys.invites(scope, workspaceId ?? ""),
    queryFn: () => repo.listInvites(workspaceId!),
    enabled: Boolean(workspaceId) && enabled,
  })
}

/** Family workspace, members, invitations and the user's display name. */
export function useFamilyMutations() {
  const { repo, scope } = useRepo()
  const queryClient = useQueryClient()
  const refresh = (...keys: readonly (readonly unknown[])[]) =>
    keys.forEach((queryKey) => void queryClient.invalidateQueries({ queryKey }))
  const workspaces = queryKeys.workspaces(scope)
  const members = ["members", scope] as const
  const invites = ["invites", scope] as const

  return {
    updateProfile: useMutation({
      mutationFn: (name: string) => repo.updateProfile(name),
      onSuccess: () => refresh(queryKeys.profile(scope), members),
    }),
    createFamily: useMutation({ mutationFn: (name: string) => repo.createFamilyWorkspace(name), onSuccess: () => refresh(workspaces) }),
    deleteFamily: useMutation({ mutationFn: (id: string) => repo.deleteFamilyWorkspace(id), onSuccess: () => refresh(workspaces) }),
    setRole: useMutation({
      mutationFn: ({ memberId, role }: { memberId: string; role: Exclude<WorkspaceRole, "OWNER"> }) => repo.setMemberRole(memberId, role),
      onSuccess: () => refresh(members),
    }),
    removeMember: useMutation({
      mutationFn: (memberId: string) => repo.removeMember(memberId),
      onSuccess: () => refresh(members, workspaces, ["wallets", scope]),
    }),
    createInvite: useMutation({
      mutationFn: ({ workspaceId, role }: { workspaceId: string; role: Exclude<WorkspaceRole, "OWNER"> }) =>
        repo.createInvite(workspaceId, role),
      onSuccess: () => refresh(invites),
    }),
    revokeInvite: useMutation({ mutationFn: (id: string) => repo.revokeInvite(id), onSuccess: () => refresh(invites) }),
    lookupInvite: useMutation({
      mutationFn: ({ code, accept }: { code: string; accept: boolean }) => repo.lookupInvite(code, accept),
      onSuccess: (result, { accept }) => {
        if (accept && result.status === "ok") refresh(workspaces)
      },
    }),
  }
}

export function useBudgets(workspaceId: string | undefined) {
  const { repo, scope } = useRepo()
  return useQuery({
    queryKey: queryKeys.budgets(scope, workspaceId ?? ""),
    queryFn: () => repo.listBudgets(workspaceId!),
    enabled: Boolean(workspaceId),
  })
}

export function useBudgetMutations(workspaceId: string | undefined) {
  const { repo } = useRepo()
  const invalidate = useInvalidate(workspaceId)
  const ws = workspaceId ?? ""
  return {
    save: useMutation({ mutationFn: (input: BudgetInput) => repo.saveBudget(ws, input), onSuccess: () => invalidate("budgets") }),
    remove: useMutation({ mutationFn: (id: string) => repo.deleteBudget(id), onSuccess: () => invalidate("budgets") }),
  }
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
  return (
    ...keys: ("wallets" | "categories" | "transactions" | "debts" | "repayments" | "notifications" | "budgets" | "tontines" | "tontinePayments")[]
  ) =>
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
      mutationFn: ({ id, input }: { id: string; input: WalletUpdate }) => repo.updateWallet(id, input),
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
    removeRange: useMutation({
      mutationFn: ({ from, to }: { from: string; to: string }) => repo.deleteTransactionsInRange(ws, from, to),
      onSuccess,
    }),
    reconcile: useMutation({
      mutationFn: ({ walletId, actual, note }: { walletId: string; actual: number; note: string | null }) =>
        repo.reconcileWallet(walletId, actual, note),
      onSuccess: () => {
        onSuccess()
        invalidate("categories")
      },
    }),
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
      onSuccess: () => invalidate("categories", "transactions", "budgets"),
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
    create: useMutation({
      mutationFn: ({ input, disbursement }: { input: DebtInput; disbursement?: DebtDisbursement }) =>
        repo.createDebt(ws, input, disbursement),
      onSuccess: (_debt, { disbursement }) =>
        disbursement ? moneyMoved() : invalidate("debts"),
    }),
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

export function useTontines(workspaceId: string | undefined) {
  const { repo, scope } = useRepo()
  return useQuery({
    queryKey: queryKeys.tontines(scope, workspaceId ?? ""),
    queryFn: () => repo.listTontines(workspaceId!),
    enabled: Boolean(workspaceId),
  })
}

export function useTontinePayments(workspaceId: string | undefined) {
  const { repo, scope } = useRepo()
  return useQuery({
    queryKey: queryKeys.tontinePayments(scope, workspaceId ?? ""),
    queryFn: () => repo.listTontinePayments(workspaceId!),
    enabled: Boolean(workspaceId),
  })
}

export function useTontineMutations(workspaceId: string | undefined) {
  const { repo } = useRepo()
  const invalidate = useInvalidate(workspaceId)
  const ws = workspaceId ?? ""
  const moneyMoved = () => invalidate("tontines", "tontinePayments", "wallets", "transactions", "categories")

  return {
    create: useMutation({ mutationFn: (input: TontineInput) => repo.createTontine(ws, input), onSuccess: () => invalidate("tontines") }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: string; input: TontineInput }) => repo.updateTontine(id, input),
      onSuccess: () => invalidate("tontines"),
    }),
    setClosed: useMutation({
      mutationFn: ({ id, closed }: { id: string; closed: boolean }) => repo.setTontineClosed(id, closed),
      onSuccess: () => invalidate("tontines"),
    }),
    remove: useMutation({ mutationFn: (id: string) => repo.deleteTontine(id), onSuccess: () => invalidate("tontines", "tontinePayments") }),
    pay: useMutation({ mutationFn: (input: TontinePayInput) => repo.payTontineRound(input), onSuccess: moneyMoved }),
    collect: useMutation({ mutationFn: (input: TontineCollectInput) => repo.collectTontine(input), onSuccess: moneyMoved }),
    deletePayment: useMutation({ mutationFn: (id: string) => repo.deleteTontinePayment(id), onSuccess: moneyMoved }),
    undoWin: useMutation({ mutationFn: (id: string) => repo.undoTontineWin(id), onSuccess: moneyMoved }),
  }
}

export function useNotifications(workspaceId: string | undefined) {
  const { repo, scope } = useRepo()
  return useQuery({
    queryKey: queryKeys.notifications(scope, workspaceId ?? ""),
    queryFn: () => repo.listNotifications(workspaceId!),
    enabled: Boolean(workspaceId),
  })
}

export function useNotificationMutations(workspaceId: string | undefined) {
  const { repo } = useRepo()
  const invalidate = useInvalidate(workspaceId)
  const ws = workspaceId ?? ""
  return {
    markRead: useMutation({ mutationFn: () => repo.markNotificationsRead(ws), onSuccess: () => invalidate("notifications") }),
    syncDueAlerts: useMutation({ mutationFn: () => repo.syncDueAlerts(ws), onSuccess: () => invalidate("notifications") }),
  }
}

export function useTelegramSettings() {
  const { repo, scope } = useRepo()
  return useQuery({ queryKey: queryKeys.telegram(scope), queryFn: () => repo.getTelegramSettings() })
}

export function useSaveTelegramSettings() {
  const { repo, scope } = useRepo()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (settings: TelegramSettings | null) => repo.saveTelegramSettings(settings),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.telegram(scope) }),
  })
}
