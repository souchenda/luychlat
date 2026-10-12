"use client"

import { ArrowLeftRightIcon, ArrowUpDownIcon, CheckIcon, FileUpIcon, LayersIcon, ListIcon, PlusIcon, WalletIcon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { TransactionEditor } from "@/components/transactions/transaction-editor"
import { TransactionList } from "@/components/transactions/transaction-list"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { NetWorthCard } from "@/components/wallets/net-worth-card"
import { TransferSheet } from "@/components/wallets/transfer-sheet"
import { WalletFormSheet } from "@/components/wallets/wallet-form-sheet"
import { CARDS, WalletFilterChips, WalletGroups, filterWallets, groupByBank, useWalletGroups, type WalletFilter } from "@/components/wallets/wallet-groups"
import { WalletList } from "@/components/wallets/wallet-list"
import {
  canWrite,
  useActiveWorkspace,
  useCategories,
  useTransactions,
  useWalletHasHistory,
  useWalletMutations,
  useWallets,
} from "@/lib/data/hooks"
import type { Transaction, TransactionFilter, Wallet } from "@/lib/data/types"
import { useT } from "@/lib/i18n/use-t"
import { useAssetsTotal } from "@/lib/assets-total"
import { isGoal } from "@/lib/goals"
import { useFeatures } from "@/lib/features"
import { isCard } from "@/lib/credit-card"
import { useLocaleStore } from "@/stores/locale-store"
import { usePrefsStore } from "@/stores/prefs-store"

const RECENT_TRANSFERS: TransactionFilter = { type: "TRANSFER", limit: 10 }

export default function WalletsPage() {
  const t = useT()
  const { workspace } = useActiveWorkspace()
  const editable = canWrite(workspace)
  // Bank statement import is in testing (feature flag): hidden until it is open to this account.
  const canImport = useFeatures().allowed("statement_import")
  const walletsQuery = useWallets(workspace?.id)
  // Assets (gold, diamonds, stocks & crypto, property) count in net worth.
  const assets = useAssetsTotal(workspace?.id)
  const transfersQuery = useTransactions(workspace?.id, RECENT_TRANSFERS)
  const categories = useCategories(workspace?.id).data ?? []
  const { reorder } = useWalletMutations(workspace?.id)

  const router = useRouter()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Wallet | null>(null)
  const [transferOpen, setTransferOpen] = useState(false)
  const [reorderMode, setReorderMode] = useState(false)
  const [editingTx, setEditingTx] = useState<Transaction | null>(null)
  const hasHistory = useWalletHasHistory(workspace?.id, editing?.id)

  const all = walletsQuery.data
  // Savings goals have their own page (/goals).
  const active = useMemo(() => all?.filter((w) => !w.archived_at && !isGoal(w)) ?? [], [all])
  const archived = useMemo(() => all?.filter((w) => w.archived_at && !isGoal(w)) ?? [], [all])
  const transfers = useMemo(() => transfersQuery.data ?? [], [transfersQuery.data])

  // Filter by bank (All · ABA · ACLEDA · Cash · Credit cards) and list wallets under their bank.
  const locale = useLocaleStore((s) => s.locale)
  const grouped = usePrefsStore((s) => s.walletsGrouped)
  const setGrouped = usePrefsStore((s) => s.setWalletsGrouped)
  const [rawFilter, setFilter] = useState<WalletFilter>("all")
  const banks = useMemo(() => groupByBank(active, locale), [active, locale])
  const hasCards = active.some(isCard)
  // A filter whose bank is gone (another workspace, last wallet archived) falls back to All.
  const filter = rawFilter === "all" || (rawFilter === CARDS ? hasCards : banks.some((b) => b.key === rawFilter)) ? rawFilter : "all"
  const groups = useWalletGroups(active, filter, t("wallets.cards"))
  const showGroups = !reorderMode && (filter !== "all" || (grouped && banks.length > 1))

  const openCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }
  // A tap opens the wallet's statement (balance, in / out, history); editing is the ✏️ there.
  const openStatement = (wallet: Wallet) => router.push(`/wallets/${wallet.id}`)
  const move = (index: number, direction: -1 | 1) => {
    const ids = active.map((w) => w.id)
    const target = index + direction
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    reorder.mutate([...ids, ...archived.map((w) => w.id)], { onError: () => toast.error(t("common.error")) })
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">{t("wallets.title")}</h1>
        {editable && canImport && (
          <Button asChild size="sm" variant="outline">
            <Link href="/wallets/import">
              <FileUpIcon />
              {t("stmt.short")}
            </Link>
          </Button>
        )}
      </div>

      <NetWorthCard wallets={all} loading={walletsQuery.isLoading} assetsUsd={assets.totalUsd} />

      <div className={editable ? "grid grid-cols-2 gap-2" : "hidden"}>
        <Button className="h-11" onClick={openCreate}>
          <PlusIcon />
          {t("wallets.add")}
        </Button>
        <Button className="h-11" variant="secondary" onClick={() => setTransferOpen(true)} disabled={active.length < 2}>
          <ArrowLeftRightIcon />
          {t("transfer.title")}
        </Button>
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-medium text-muted-foreground">{t("nav.wallets")}</h2>
          <span className="flex items-center">
            {!reorderMode && filter === "all" && banks.length > 1 && (
              <Button
                size="icon"
                variant="ghost"
                className="size-8"
                onClick={() => setGrouped(!grouped)}
                aria-label={grouped ? t("wallets.flatList") : t("wallets.groupByBank")}
                title={grouped ? t("wallets.flatList") : t("wallets.groupByBank")}
              >
                {grouped ? <ListIcon /> : <LayersIcon />}
              </Button>
            )}
            {active.length > 1 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  // Reordering works on the whole list, so it shows everything, ungrouped.
                  setFilter("all")
                  setReorderMode((v) => !v)
                }}
              >
                {reorderMode ? <CheckIcon /> : <ArrowUpDownIcon />}
                {reorderMode ? t("wallets.done") : t("wallets.reorder")}
              </Button>
            )}
          </span>
        </div>

        {walletsQuery.isLoading ? (
          <Skeleton className="h-36 w-full rounded-xl" />
        ) : active.length === 0 ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={openCreate}
              className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center hover:bg-muted/50"
            >
              <WalletIcon className="size-8 text-muted-foreground" />
              <span className="font-medium">{t("wallets.empty")}</span>
              <span className="text-sm text-muted-foreground">{t("wallets.emptyHint")}</span>
            </button>
            {editable && canImport && (
              <Link href="/wallets/import" className="flex items-center gap-3 rounded-xl border bg-primary/5 px-4 py-3 hover:bg-primary/10">
                <FileUpIcon className="size-5 shrink-0 text-primary" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{t("stmt.fromBank")}</span>
                  <span className="block text-xs text-muted-foreground">{t("stmt.fromBankHint")}</span>
                </span>
              </Link>
            )}
          </div>
        ) : (
          <>
            {!reorderMode && <WalletFilterChips groups={banks} hasCards={hasCards} value={filter} onChange={setFilter} />}
            {showGroups ? (
              <WalletGroups groups={groups} onSelect={openStatement} collapsible={filter === "all"} />
            ) : (
              <WalletList wallets={active} onSelect={openStatement} reorderMode={reorderMode} onMove={move} />
            )}
          </>
        )}
      </section>

      {filterWallets(archived, filter).length > 0 && (
        <section className="space-y-2">
          <h2 className="px-1 text-sm font-medium text-muted-foreground">{t("wallets.archived")}</h2>
          <WalletList wallets={filterWallets(archived, filter)} onSelect={openStatement} muted />
        </section>
      )}

      <section className="space-y-2">
        <h2 className="px-1 text-sm font-medium text-muted-foreground">{t("transfer.recent")}</h2>
        {transfers.length === 0 ? (
          <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">{t("transfer.none")}</p>
        ) : (
          <TransactionList transactions={transfers} wallets={all ?? []} categories={categories} onSelect={setEditingTx} />
        )}
      </section>

      <WalletFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        workspaceId={workspace?.id}
        wallet={editing}
        hasHistory={hasHistory}
      />
      <TransferSheet open={transferOpen} onOpenChange={setTransferOpen} workspaceId={workspace?.id} wallets={all ?? []} />
      <TransactionEditor
        workspaceId={workspace?.id}
        wallets={all ?? []}
        transaction={editingTx}
        onClose={() => setEditingTx(null)}
      />
    </div>
  )
}
