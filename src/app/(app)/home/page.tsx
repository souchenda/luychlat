"use client"

import { format } from "date-fns"
import { ArrowLeftRightIcon, ChartColumnIcon, ChevronRightIcon, EyeIcon, MinusIcon, PlusIcon, ReceiptTextIcon, TargetIcon, WalletIcon } from "lucide-react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"

import { BudgetHomeCard } from "@/components/budgets/budget-home-card"
import { TontineDueCard } from "@/components/tontine/tontine-due-card"
import { FamilyStrip } from "@/components/family/family-strip"
import { CashFlowCard } from "@/components/dashboard/cash-flow-card"
import { DebtTrackerWidget } from "@/components/dashboard/debt-tracker-widget"
import { DebtFormSheet } from "@/components/debts/debt-form-sheet"
import { InsuranceRenewalCard } from "@/components/debts/insurance-card"
import { BusinessTrialTag } from "@/components/billing/business-trial"
import { GoalsHomeCard } from "@/components/goals/goals-home-card"
import { ProfileAvatar } from "@/components/profile/profile-avatar"
import { EntryFormSheet } from "@/components/transactions/entry-form-sheet"
import { TransactionEditor } from "@/components/transactions/transaction-editor"
import { TransactionList } from "@/components/transactions/transaction-list"
import { Button } from "@/components/ui/button"
import { useToday } from "@/hooks/use-today"
import { Skeleton } from "@/components/ui/skeleton"
import { NetWorthCard } from "@/components/wallets/net-worth-card"
import { TransferSheet } from "@/components/wallets/transfer-sheet"
import { WalletFormSheet } from "@/components/wallets/wallet-form-sheet"
import { WalletList } from "@/components/wallets/wallet-list"
import { cashFlow } from "@/lib/analytics"
import { adjustmentCategoryIds } from "@/lib/categories/presets"
import { canWrite, useActiveWorkspace, useCategories, useDebts, useProfile, useTransactions, useWallets } from "@/lib/data/hooks"
import type { CategoryType, Transaction } from "@/lib/data/types"
import { longDate, monthKey, monthRange, recentMonths } from "@/lib/dates"
import { islamicGreeting, toHijri } from "@/lib/islamic"
import { isGoal } from "@/lib/goals"
import { portfolio } from "@/lib/gold"
import { useGoldHoldings, useGoldRates } from "@/lib/gold-data"
import { assetsTotalUsd } from "@/lib/assets"
import { usePhysicalAssets } from "@/lib/assets-data"
import { investmentTotals } from "@/lib/investments"
import { useInvestments, useMarketPrices } from "@/lib/investments-data"
import { useIslamicDefaults, useIslamicEnabled } from "@/lib/islamic-settings"
import { homeGreeting } from "@/lib/holidays"
import { useT } from "@/lib/i18n/use-t"
import { useLocaleStore } from "@/stores/locale-store"
import { usePrefsStore } from "@/stores/prefs-store"

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
  const khrPerUsd = usePrefsStore((s) => s.khrPerUsd)
  const { workspace } = useActiveWorkspace()
  const ws = workspace?.id
  // Viewers in a family workspace can look but not record.
  const editable = canWrite(workspace)

  // One query covers the trend chart, this month's summary and the recent list.
  const months = useMemo(() => recentMonths(TREND_MONTHS), [])
  const filter = useMemo(() => ({ from: monthRange(months[0]).from }), [months])
  const walletsQuery = useWallets(ws)
  // Gold and platinum at today's market rate count in net worth.
  const goldHoldings = useGoldHoldings(ws).data
  const { rates: goldRates } = useGoldRates()
  const investments = useInvestments(ws).data
  const { prices: marketPrices } = useMarketPrices()
  const investValue = useMemo(() => investmentTotals(investments ?? [], marketPrices, khrPerUsd).valueUsd, [investments, marketPrices, khrPerUsd])
  const physicalAssets = usePhysicalAssets(ws).data
  const physicalValue = useMemo(() => assetsTotalUsd(physicalAssets ?? [], khrPerUsd), [physicalAssets, khrPerUsd])
  const goldValue = useMemo(() => portfolio(goldHoldings ?? [], goldRates, khrPerUsd).value, [goldHoldings, goldRates, khrPerUsd])
  const categoriesQuery = useCategories(ws)
  const txQuery = useTransactions(ws, filter)
  const debtsQuery = useDebts(ws)

  const [walletFormOpen, setWalletFormOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [entryType, setEntryType] = useState<CategoryType | null>(null)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [debtFormOpen, setDebtFormOpen] = useState(false)

  const wallets = walletsQuery.data ?? []
  // Wallets section lists ordinary wallets; savings goals show in their own card.
  const active = wallets.filter((w) => !w.archived_at && !isGoal(w))
  const transactions = useMemo(() => txQuery.data ?? [], [txQuery.data])
  const thisMonth = monthKey()
  const monthTransactions = useMemo(
    () => transactions.filter((tx) => monthKey(new Date(tx.transaction_date)) === thisMonth),
    [transactions, thisMonth],
  )
  const flow = useMemo(
    () => cashFlow(monthTransactions, khrPerUsd, adjustmentCategoryIds(categoriesQuery.data ?? [])),
    [monthTransactions, khrPerUsd, categoriesQuery.data],
  )
  // The display name from Settings, once the user has set one.
  const displayName = useProfile().data?.display_name?.trim()
  const locale = useLocaleStore((s) => s.locale)
  const greeting = homeGreeting()
  const today = useToday()
  // Islamic tools (optional): Ramadan / Eid greetings in season. The Hijri date itself is on /islamic.
  const islamic = useIslamicEnabled()
  const hijriOffset = Number(useIslamicDefaults().hijri_offset ?? 0) || 0
  const hijri = islamic ? toHijri(today, hijriOffset) : null
  const islamicKey = islamicGreeting(hijri)
  const festive = Boolean(islamicKey) || greeting.key !== "holiday.everyday"
  // Khmer numerals for the Ben day in Khmer (បិណ្ឌទី ៥).
  const greetingParams = Object.fromEntries(
    Object.entries(greeting.params ?? {}).map(([k, v]) => [k, locale === "km" ? String(v).replace(/\d/g, (d) => "០១២៣៤៥៦៧៨៩"[Number(d)]) : v]),
  )

  return (
    <div className="space-y-4">
      {/* One row: greeting on the left, today's date and the festival / wish on the right. */}
      <header>
        <div className="flex items-start justify-between gap-3">
          {workspace?.type === "BUSINESS" ? (
            // Business workspace: the business's logo and name instead of a personal greeting.
            <h1 className="flex min-w-0 items-center gap-2 text-lg font-bold">
              <ProfileAvatar path={workspace.logo_path} name={workspace.name} business className="size-8 rounded-lg text-xs" />
              <span className="truncate">{workspace.name}</span>
            </h1>
          ) : (
            <h1 className="min-w-0 truncate pt-0.5 text-lg font-bold">
              {displayName ? t("home.greetingName", { name: displayName }) : t("home.greeting")}
            </h1>
          )}
          <div className="min-w-0 max-w-[62%] text-right leading-tight">
            <p className="truncate text-xs text-muted-foreground">
              <time dateTime={format(today, "yyyy-MM-dd")} suppressHydrationWarning>
                {longDate(today, locale)}
              </time>
            </p>
            <p className={festive ? "truncate text-xs font-medium text-primary" : "truncate text-xs text-muted-foreground"}>
              {islamicKey ? t(islamicKey) : t(greeting.key, greetingParams)} ✨
            </p>
          </div>
        </div>
        {workspace?.type === "FAMILY" && <FamilyStrip workspace={workspace} />}
        <BusinessTrialTag workspace={workspace} className="mt-1.5" />
      </header>

      <NetWorthCard wallets={walletsQuery.data} loading={walletsQuery.isLoading} assetsUsd={goldValue + investValue + physicalValue} />

      {workspace?.role === "VIEWER" && (
        <p className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">
          <EyeIcon className="size-4 shrink-0" aria-hidden />
          {t("family.viewerNotice")}
        </p>
      )}

      <div className={editable ? "grid grid-cols-3 gap-2" : "hidden"}>
        <Button
          className="h-11 flex-col gap-0.5 bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
          onClick={() => setEntryType("INCOME")}
        >
          <PlusIcon className="size-4" />
          <span className="text-xs">{t("tx.INCOME")}</span>
        </Button>
        <Button
          className="h-11 flex-col gap-0.5 bg-rose-600 text-white hover:bg-rose-700 dark:bg-rose-600 dark:hover:bg-rose-500"
          onClick={() => setEntryType("EXPENSE")}
        >
          <MinusIcon className="size-4" />
          <span className="text-xs">{t("tx.EXPENSE")}</span>
        </Button>
        <Button
          variant="secondary"
          className="h-11 flex-col gap-0.5"
          onClick={() => setTransferOpen(true)}
          disabled={active.length < 2}
        >
          <ArrowLeftRightIcon className="size-4" />
          <span className="text-xs">{t("tx.TRANSFER")}</span>
        </Button>
      </div>

      <CashFlowCard flow={flow} loading={txQuery.isLoading} />
      <div className="-mt-2 flex items-center justify-end gap-4 px-1 text-sm">
        <Link href="/budgets" className="flex items-center gap-1 text-primary">
          <TargetIcon className="size-4" aria-hidden />
          {t("budget.title")}
        </Link>
        <Link href="/reports" className="flex items-center gap-1 text-primary">
          <ChartColumnIcon className="size-4" aria-hidden />
          {t(workspace?.type === "BUSINESS" ? "pl.title" : "reports.title")}
          <ChevronRightIcon className="size-4" />
        </Link>
      </div>

      <BudgetHomeCard
        workspaceId={ws}
        currency={workspace?.currency_default ?? "USD"}
        categories={categoriesQuery.data ?? []}
        monthTransactions={monthTransactions}
      />

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

      <GoalsHomeCard wallets={walletsQuery.data} />

      <DebtTrackerWidget debts={debtsQuery.data} loading={debtsQuery.isLoading} onAdd={editable ? () => setDebtFormOpen(true) : undefined} />

      <TontineDueCard workspaceId={ws} />

      <InsuranceRenewalCard debts={debtsQuery.data} />

      <CashFlowCharts transactions={transactions} categories={categoriesQuery.data ?? []} months={months} />

      <WalletFormSheet open={walletFormOpen} onOpenChange={setWalletFormOpen} workspaceId={ws} />
      <TransferSheet open={transferOpen} onOpenChange={setTransferOpen} workspaceId={ws} wallets={wallets} />
      <EntryFormSheet
        open={entryType !== null}
        onOpenChange={(open) => !open && setEntryType(null)}
        workspaceId={ws}
        wallets={wallets}
        type={entryType ?? "EXPENSE"}
      />
      <DebtFormSheet open={debtFormOpen} onOpenChange={setDebtFormOpen} workspaceId={ws} />
      <TransactionEditor workspaceId={ws} wallets={wallets} transaction={editing} onClose={() => setEditing(null)} />
    </div>
  )
}
