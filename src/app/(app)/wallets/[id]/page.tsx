"use client"

import { ArrowDownLeftIcon, ArrowLeftIcon, ArrowUpRightIcon, ChevronLeftIcon, ChevronRightIcon, PencilIcon } from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useMemo, useState } from "react"

import { Amount } from "@/components/money/amount"
import { TransactionEditor } from "@/components/transactions/transaction-editor"
import { TransactionList } from "@/components/transactions/transaction-list"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { CardMeter } from "@/components/wallets/credit-card"
import { WalletAvatar } from "@/components/wallets/wallet-avatar"
import { WalletFormSheet } from "@/components/wallets/wallet-form-sheet"
import { isCard } from "@/lib/credit-card"
import { canWrite, useActiveWorkspace, useCategories, useTransactions, useWalletHasHistory, useWallets } from "@/lib/data/hooks"
import type { Transaction } from "@/lib/data/types"
import { monthKey, monthLabel, monthRange, type MonthKey } from "@/lib/dates"
import { pick } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { convert, roundMoney } from "@/lib/money"
import { walletEffect } from "@/lib/reconcile/ledger"
import { getProvider } from "@/lib/wallets/providers"
import { useLocaleStore } from "@/stores/locale-store"
import { usePrefsStore } from "@/stores/prefs-store"

/** The month before / after ("2026-10" → "2026-09"). */
function shiftMonth(key: MonthKey, by: number): MonthKey {
  const [y, m] = key.split("-").map(Number)
  return monthKey(new Date(y, m - 1 + by, 15))
}

/**
 * A wallet's statement, like a bank app: its balance, money in and out for the
 * month, and every entry that touched it (both sides of transfers). Tapping a
 * wallet opens this; editing the wallet itself is the ✏️ button.
 */
export default function WalletStatementPage() {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const khrPerUsd = usePrefsStore((s) => s.khrPerUsd)
  const { id } = useParams<{ id: string }>()
  const { workspace } = useActiveWorkspace()
  const editable = canWrite(workspace)
  const walletsQuery = useWallets(workspace?.id)
  const wallets = useMemo(() => walletsQuery.data ?? [], [walletsQuery.data])
  const wallet = wallets.find((w) => w.id === id)
  const categories = useCategories(workspace?.id).data ?? []

  const thisMonth = monthKey()
  const [month, setMonth] = useState<MonthKey>(thisMonth)
  const filter = useMemo(() => ({ ...monthRange(month), walletId: id }), [month, id])
  const txQuery = useTransactions(wallet ? workspace?.id : undefined, filter)
  const transactions = useMemo(() => txQuery.data ?? [], [txQuery.data])

  const [editOpen, setEditOpen] = useState(false)
  const [editingTx, setEditingTx] = useState<Transaction | null>(null)
  const hasHistory = useWalletHasHistory(workspace?.id, editOpen ? wallet?.id : undefined)

  // Money in / out of THIS wallet, in its currency (transfers count on their side).
  const totals = useMemo(() => {
    if (!wallet) return { in: 0, out: 0 }
    let inflow = 0
    let outflow = 0
    for (const tx of transactions) {
      const effect = walletEffect(tx, wallet)
      if (effect > 0) inflow += effect
      else outflow -= effect
    }
    return { in: roundMoney(inflow, wallet.currency), out: roundMoney(outflow, wallet.currency) }
  }, [transactions, wallet])

  if (walletsQuery.isLoading) return <Skeleton className="h-80 w-full rounded-2xl" />
  if (!wallet) {
    return (
      <div className="space-y-4 py-10 text-center">
        <p className="text-muted-foreground">{t("wallets.notFound")}</p>
        <Button asChild variant="outline">
          <Link href="/wallets">{t("common.back")}</Link>
        </Button>
      </div>
    )
  }

  const other = wallet.currency === "USD" ? "KHR" : "USD"
  const kind = isCard(wallet) ? t("card.kind") : pick(getProvider(wallet.icon).name, locale)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1">
        <Button asChild size="icon" variant="ghost" aria-label={t("common.back")}>
          <Link href="/wallets">
            <ArrowLeftIcon />
          </Link>
        </Button>
        <span className="flex-1" />
        {editable && (
          <Button size="icon" variant="ghost" onClick={() => setEditOpen(true)} aria-label={t("wallets.edit")}>
            <PencilIcon />
          </Button>
        )}
      </div>

      <Card className="gap-4 px-4 py-5">
        <div className="flex items-center gap-3">
          <WalletAvatar icon={wallet.icon} color={wallet.color} name={wallet.name} />
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold">{wallet.name}</h1>
            <p className="truncate text-xs text-muted-foreground">
              {kind} · {wallet.currency}
            </p>
          </div>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t("wallets.balanceNow")}</p>
          <Amount value={wallet.balance} currency={wallet.currency} className="block text-4xl font-bold tracking-tight tabular-nums" />
          <p className="text-sm text-muted-foreground tabular-nums">
            ≈ <Amount value={convert(wallet.balance, wallet.currency, other, khrPerUsd)} currency={other} />
          </p>
        </div>
        {isCard(wallet) && <CardMeter wallet={wallet} />}
      </Card>

      {/* The month: ‹ ខែតុលា ២០២៦ › with money in and out of this wallet. */}
      <div className="flex items-center justify-between gap-2">
        <Button size="icon" variant="ghost" onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label={t("wallets.prevMonth")}>
          <ChevronLeftIcon />
        </Button>
        <span className="text-sm font-medium">{monthLabel(month, locale)}</span>
        <Button size="icon" variant="ghost" onClick={() => setMonth((m) => shiftMonth(m, 1))} disabled={month >= thisMonth} aria-label={t("wallets.nextMonth")}>
          <ChevronRightIcon />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50 px-3 py-2.5 dark:border-emerald-900/50 dark:bg-emerald-500/10">
          <p className="flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <ArrowDownLeftIcon className="size-3.5" aria-hidden />
            {t("wallets.moneyIn")}
          </p>
          <Amount value={totals.in} currency={wallet.currency} className="block text-lg font-semibold whitespace-nowrap text-emerald-700 tabular-nums dark:text-emerald-400" />
        </div>
        <div className="rounded-2xl border border-rose-200/70 bg-rose-50 px-3 py-2.5 dark:border-rose-900/50 dark:bg-rose-500/10">
          <p className="flex items-center gap-1 text-xs font-medium text-rose-700 dark:text-rose-400">
            <ArrowUpRightIcon className="size-3.5" aria-hidden />
            {t("wallets.moneyOut")}
          </p>
          <Amount value={totals.out} currency={wallet.currency} className="block text-lg font-semibold whitespace-nowrap text-rose-700 tabular-nums dark:text-rose-400" />
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="px-1 text-sm font-medium text-muted-foreground">{t("wallets.history")}</h2>
        {txQuery.isLoading ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : transactions.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t("wallets.noHistory")}</p>
        ) : (
          <TransactionList transactions={transactions} wallets={wallets} categories={categories} onSelect={setEditingTx} groupByDay forWalletId={wallet.id} />
        )}
      </section>

      <WalletFormSheet open={editOpen} onOpenChange={setEditOpen} workspaceId={workspace?.id} wallet={wallet} hasHistory={hasHistory} />
      <TransactionEditor workspaceId={workspace?.id} wallets={wallets} transaction={editingTx} onClose={() => setEditingTx(null)} />
    </div>
  )
}
