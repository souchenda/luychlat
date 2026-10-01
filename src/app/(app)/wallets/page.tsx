"use client"

import { ArrowLeftRightIcon, ArrowUpDownIcon, CheckIcon, PlusIcon, WalletIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { NetWorthCard } from "@/components/wallets/net-worth-card"
import { TransferList } from "@/components/wallets/transfer-list"
import { TransferSheet } from "@/components/wallets/transfer-sheet"
import { WalletFormSheet } from "@/components/wallets/wallet-form-sheet"
import { WalletList } from "@/components/wallets/wallet-list"
import { useActiveWorkspace, useTransfers, useWalletMutations, useWallets } from "@/lib/data/hooks"
import type { Wallet } from "@/lib/data/types"
import { useT } from "@/lib/i18n/use-t"

export default function WalletsPage() {
  const t = useT()
  const { workspace } = useActiveWorkspace()
  const walletsQuery = useWallets(workspace?.id)
  const transfersQuery = useTransfers(workspace?.id)
  const { reorder } = useWalletMutations(workspace?.id)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Wallet | null>(null)
  const [transferOpen, setTransferOpen] = useState(false)
  const [reorderMode, setReorderMode] = useState(false)

  const all = walletsQuery.data
  const active = useMemo(() => all?.filter((w) => !w.archived_at) ?? [], [all])
  const archived = useMemo(() => all?.filter((w) => w.archived_at) ?? [], [all])
  const transfers = useMemo(() => transfersQuery.data ?? [], [transfersQuery.data])
  const walletsWithHistory = useMemo(
    () => new Set(transfers.flatMap((tx) => [tx.wallet_id, tx.to_wallet_id ?? ""])),
    [transfers],
  )

  const openCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }
  const openEdit = (wallet: Wallet) => {
    setEditing(wallet)
    setFormOpen(true)
  }
  const move = (index: number, direction: -1 | 1) => {
    const ids = active.map((w) => w.id)
    const target = index + direction
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    reorder.mutate([...ids, ...archived.map((w) => w.id)], { onError: () => toast.error(t("common.error")) })
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">{t("wallets.title")}</h1>

      <NetWorthCard wallets={all} loading={walletsQuery.isLoading} />

      <div className="grid grid-cols-2 gap-2">
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
          {active.length > 1 && (
            <Button size="sm" variant="ghost" onClick={() => setReorderMode((v) => !v)}>
              {reorderMode ? <CheckIcon /> : <ArrowUpDownIcon />}
              {reorderMode ? t("wallets.done") : t("wallets.reorder")}
            </Button>
          )}
        </div>

        {walletsQuery.isLoading ? (
          <Skeleton className="h-36 w-full rounded-xl" />
        ) : active.length === 0 ? (
          <button
            type="button"
            onClick={openCreate}
            className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center hover:bg-muted/50"
          >
            <WalletIcon className="size-8 text-muted-foreground" />
            <span className="font-medium">{t("wallets.empty")}</span>
            <span className="text-sm text-muted-foreground">{t("wallets.emptyHint")}</span>
          </button>
        ) : (
          <WalletList wallets={active} onSelect={openEdit} reorderMode={reorderMode} onMove={move} />
        )}
      </section>

      {archived.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-1 text-sm font-medium text-muted-foreground">{t("wallets.archived")}</h2>
          <WalletList wallets={archived} onSelect={openEdit} muted />
        </section>
      )}

      <section className="space-y-2">
        <h2 className="px-1 text-sm font-medium text-muted-foreground">{t("transfer.recent")}</h2>
        <TransferList transfers={transfers} wallets={all ?? []} />
      </section>

      <WalletFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        workspaceId={workspace?.id}
        wallet={editing}
        hasHistory={editing ? walletsWithHistory.has(editing.id) : false}
      />
      <TransferSheet open={transferOpen} onOpenChange={setTransferOpen} workspaceId={workspace?.id} wallets={active} />
    </div>
  )
}
