"use client"

import { ArrowLeftRightIcon, ChevronRightIcon, CloudOffIcon, MinusIcon, PlusIcon, ReceiptTextIcon, ShieldCheckIcon, WalletIcon } from "lucide-react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"

import { CashFlowCard } from "@/components/dashboard/cash-flow-card"
import { PinSetupDialog } from "@/components/lock/pin-setup-dialog"
import { EntryFormSheet } from "@/components/transactions/entry-form-sheet"
import { TransactionEditor } from "@/components/transactions/transaction-editor"
import { TransactionList } from "@/components/transactions/transaction-list"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { NetWorthCard } from "@/components/wallets/net-worth-card"
import { TransferSheet } from "@/components/wallets/transfer-sheet"
import { WalletFormSheet } from "@/components/wallets/wallet-form-sheet"
import { WalletList } from "@/components/wallets/wallet-list"
import { cashFlow } from "@/lib/analytics"
import { useActiveWorkspace, useCategories, useTransactions, useWallets } from "@/lib/data/hooks"
import type { CategoryType, Transaction } from "@/lib/data/types"
import { monthKey, monthRange, recentMonths } from "@/lib/dates"
import { useT } from "@/lib/i18n/use-t"
import { useLockStore } from "@/stores/lock-store"
import { usePrefsStore } from "@/stores/prefs-store"
import { useSessionStore } from "@/stores/session-store"

// Recharts is heavy; load the chart card after the rest of the dashboard.
const CashFlowCharts = dynamic(() => import("@/components/dashboard/cash-flow-charts").then((m) => m.CashFlowCharts), {
  ssr: false,
  loading: () => <Skeleton className="h-64 w-full rounded-xl" />,
})

const WALLET_PREVIEW = 4
const RECENT_COUNT = 5
const TREND_MONTHS = 6

export default function HomePage() {
  const t = useT()
  const router = useRouter()
  const { user, isGuest, endGuest } = useSessionStore()
  const hasPin = useLockStore((s) => Boolean(s.pinHash))
  const khrPerUsd = usePrefsStore((s) => s.khrPerUsd)
  const { workspace } = useActiveWorkspace()
  const ws = workspace?.id

  // One query covers the trend chart, this month's summary and the recent list.
  const months = useMemo(() => recentMonths(TREND_MONTHS), [])
  const filter = useMemo(() => ({ from: monthRange(months[0]).from }), [months])
  const walletsQuery = useWallets(ws)
  const categoriesQuery = useCategories(ws)
  const txQuery = useTransactions(ws, filter)

  const [pinOpen, setPinOpen] = useState(false)
  const [walletFormOpen, setWalletFormOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [entryType, setEntryType] = useState<CategoryType | null>(null)
  const [editing, setEditing] = useState<Transaction | null>(null)

  const wallets = walletsQuery.data ?? []
  const active = wallets.filter((w) => !w.archived_at)
  const transactions = useMemo(() => txQuery.data ?? [], [txQuery.data])
  const thisMonth = monthKey()
  const flow = useMemo(
    () =>
      cashFlow(
        transactions.filter((tx) => monthKey(new Date(tx.transaction_date)) === thisMonth),
        khrPerUsd,
      ),
    [transactions, thisMonth, khrPerUsd],
  )
  const identity = user?.phone ? `+${user.phone}` : (user?.email ?? null)

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold">{t("home.greeting")}</h1>
        {identity && <p className="text-sm text-muted-foreground">{identity}</p>}
      </header>

      <NetWorthCard wallets={walletsQuery.data} loading={walletsQuery.isLoading} />

      <div className="grid grid-cols-3 gap-2">
        <Button
          className="h-12 flex-col gap-0.5 bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
          onClick={() => setEntryType("INCOME")}
        >
          <PlusIcon className="size-4" />
          <span className="text-xs">{t("tx.INCOME")}</span>
        </Button>
        <Button
          className="h-12 flex-col gap-0.5 bg-orange-600 text-white hover:bg-orange-700 dark:bg-orange-600 dark:hover:bg-orange-500"
          onClick={() => setEntryType("EXPENSE")}
        >
          <MinusIcon className="size-4" />
          <span className="text-xs">{t("tx.EXPENSE")}</span>
        </Button>
        <Button
          variant="secondary"
          className="h-12 flex-col gap-0.5"
          onClick={() => setTransferOpen(true)}
          disabled={active.length < 2}
        >
          <ArrowLeftRightIcon className="size-4" />
          <span className="text-xs">{t("tx.TRANSFER")}</span>
        </Button>
      </div>

      <CashFlowCard flow={flow} loading={txQuery.isLoading} />

      <CashFlowCharts transactions={transactions} categories={categoriesQuery.data ?? []} months={months} />

      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-medium text-muted-foreground">{t("recent.title")}</h2>
          {transactions.length > 0 && (
            <Link href="/transactions" className="flex items-center text-sm text-primary">
              {t("wallets.seeAll")}
              <ChevronRightIcon className="size-4" />
            </Link>
          )}
        </div>
        {txQuery.isLoading ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : transactions.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center">
            <ReceiptTextIcon className="size-8 text-muted-foreground" />
            <span className="font-medium">{t("recent.empty")}</span>
            <span className="text-sm text-muted-foreground">{t("recent.emptyHint")}</span>
          </div>
        ) : (
          <TransactionList
            transactions={transactions.slice(0, RECENT_COUNT)}
            wallets={wallets}
            categories={categoriesQuery.data ?? []}
            onSelect={setEditing}
          />
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-medium text-muted-foreground">{t("nav.wallets")}</h2>
          {active.length > 0 && (
            <Link href="/wallets" className="flex items-center text-sm text-primary">
              {t("wallets.seeAll")}
              <ChevronRightIcon className="size-4" />
            </Link>
          )}
        </div>
        {walletsQuery.isLoading ? (
          <Skeleton className="h-36 w-full rounded-xl" />
        ) : active.length === 0 ? (
          <button
            type="button"
            onClick={() => setWalletFormOpen(true)}
            className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center hover:bg-muted/50"
          >
            <WalletIcon className="size-8 text-muted-foreground" />
            <span className="font-medium">{t("wallets.empty")}</span>
            <span className="text-sm text-muted-foreground">{t("wallets.emptyHint")}</span>
          </button>
        ) : (
          <WalletList wallets={active.slice(0, WALLET_PREVIEW)} onSelect={() => router.push("/wallets")} />
        )}
      </section>

      {isGuest && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CloudOffIcon className="size-5 text-amber-600" />
              {t("home.guestBanner")}
            </CardTitle>
            <CardDescription>{t("home.guestBannerHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              size="sm"
              onClick={() => {
                endGuest()
                router.replace("/login")
              }}
            >
              {t("home.createAccount")}
            </Button>
          </CardContent>
        </Card>
      )}

      {!hasPin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheckIcon className="size-5 text-primary" />
              {t("home.secureTitle")}
            </CardTitle>
            <CardDescription>{t("home.secureHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button size="sm" onClick={() => setPinOpen(true)}>
              {t("home.setPin")}
            </Button>
          </CardContent>
        </Card>
      )}

      <PinSetupDialog open={pinOpen} onOpenChange={setPinOpen} />
      <WalletFormSheet open={walletFormOpen} onOpenChange={setWalletFormOpen} workspaceId={ws} />
      <TransferSheet open={transferOpen} onOpenChange={setTransferOpen} workspaceId={ws} wallets={wallets} />
      <EntryFormSheet
        open={entryType !== null}
        onOpenChange={(open) => !open && setEntryType(null)}
        workspaceId={ws}
        wallets={wallets}
        type={entryType ?? "EXPENSE"}
      />
      <TransactionEditor workspaceId={ws} wallets={wallets} transaction={editing} onClose={() => setEditing(null)} />
    </div>
  )
}
