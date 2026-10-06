"use client"

import { ArrowLeftRightIcon, ChevronRightIcon, EyeIcon, FileUpIcon, HandIcon, MinusIcon, PlusIcon, ReceiptTextIcon, SparklesIcon, TargetIcon, WalletIcon } from "lucide-react"
import { format } from "date-fns"
import Link from "next/link"
import { useMemo, useState } from "react"

import { BudgetHomeCard } from "@/components/budgets/budget-home-card"
import { TontineDueCard } from "@/components/tontine/tontine-due-card"
import { FamilyStrip } from "@/components/family/family-strip"
import { ExperienceSelector } from "@/components/islamic/islamic-mode"
import { CashFlowCard } from "@/components/dashboard/cash-flow-card"
import { DailyTipCard } from "@/components/dashboard/daily-tip-card"
import { MarketRatesCard } from "@/components/dashboard/market-rates-card"
import { BillsWidget } from "@/components/dashboard/bills-widget"
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
import { HeroAction, NetWorthCard } from "@/components/wallets/net-worth-card"
import { TransferSheet } from "@/components/wallets/transfer-sheet"
import { WalletFormSheet } from "@/components/wallets/wallet-form-sheet"
import { cashFlow } from "@/lib/analytics"
import { adjustmentCategoryIds } from "@/lib/categories/presets"
import { canWrite, useActiveWorkspace, useCategories, useDebts, useProfile, useTransactions, useWallets } from "@/lib/data/hooks"
import type { CategoryType, Transaction } from "@/lib/data/types"
import { longDate, monthKey, monthRange, recentMonths } from "@/lib/dates"
import { islamicGreeting, toHijri } from "@/lib/islamic"
import { useAssetsTotal } from "@/lib/assets-total"
import { isGoal } from "@/lib/goals"
import { useIslamicDefaults, useIslamicEnabled } from "@/lib/islamic-settings"
import { useT } from "@/lib/i18n/use-t"
import { useLocaleStore } from "@/stores/locale-store"
import { usePrefsStore } from "@/stores/prefs-store"
import { useFeatures } from "@/lib/features"
import { BirthdayCard } from "@/components/dashboard/birthday-card"
import { LunarPill } from "@/components/dashboard/lunar-pill"
import { FestivalBanner } from "@/components/dashboard/festival-banner"
import { WalletCarousel } from "@/components/wallets/wallet-carousel"

const RECENT_COUNT = 4
const TREND_MONTHS = 6

export default function HomePage() {
  const t = useT()
  const khrPerUsd = usePrefsStore((s) => s.khrPerUsd)
  const { workspace } = useActiveWorkspace()
  const ws = workspace?.id
  // Viewers in a family workspace can look but not record.
  const editable = canWrite(workspace)
  // Bank statement import is in testing (feature flag): hidden until it is open to this account.
  const canImport = useFeatures().allowed("statement_import")

  // One query covers the trend chart, this month's summary and the recent list.
  const months = useMemo(() => recentMonths(TREND_MONTHS), [])
  const filter = useMemo(() => ({ from: monthRange(months[0]).from }), [months])
  const walletsQuery = useWallets(ws)
  // Assets (gold, diamonds, stocks & crypto, property) count in net worth.
  const assets = useAssetsTotal(ws)
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
  // Cambodian names are family name first ("ស៊ូ ចិន្តា"): greet by the given name, the last word.
  const givenName = useProfile().data?.display_name?.trim().split(/\s+/).pop()
  const today = useToday()
  const locale = useLocaleStore((s) => s.locale)
  // Islamic tools (optional): Ramadan / Eid greetings in season. The Hijri date itself is on /islamic.
  const islamic = useIslamicEnabled()
  const hijriOffset = Number(useIslamicDefaults().hijri_offset ?? 0) || 0
  const hijri = islamic ? toHijri(today, hijriOffset) : null
  const islamicKey = islamicGreeting(hijri)

  return (
    <div className="space-y-4">
      {/* One row: greeting with today's date under it on the left, the lunar day / next holy day pill on the right. */}
      <header>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            {workspace?.type === "BUSINESS" ? (
              // Business workspace: the business's logo and name instead of a personal greeting.
              <h1 className="flex min-w-0 items-center gap-2 text-lg font-bold">
                <ProfileAvatar path={workspace.logo_path} name={workspace.name} business className="size-8 rounded-lg text-xs" />
                <span className="truncate">{workspace.name}</span>
              </h1>
            ) : (
              <h1 className="min-w-0 truncate pt-0.5 text-lg font-bold">
                {givenName ? t("home.greetingName", { name: givenName }) : t("home.greeting")}{" "}
                <HandIcon className="inline size-5 origin-[70%_80%] animate-wave align-[-3px] text-amber-500 motion-reduce:animate-none" strokeWidth={2} aria-hidden />
              </h1>
            )}
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              <time dateTime={format(today, "yyyy-MM-dd")} suppressHydrationWarning>
                {longDate(today, locale)}
              </time>
            </p>
          </div>
          {/* Right: a small gold pill with today's lunar day and the next holy day (opens /bills).
              Islamic Mode in season shows its greeting instead. */}
          {islamicKey ? (
            <span className="inline-flex max-w-[58%] shrink-0 items-center gap-1 truncate rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              <SparklesIcon className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{t(islamicKey)}</span>
            </span>
          ) : (
            <LunarPill />
          )}
        </div>
        {workspace?.type === "FAMILY" && <FamilyStrip workspace={workspace} />}
        <BusinessTrialTag workspace={workspace} className="mt-1.5" />
      </header>

      {/* Festivals and Khmer-Chinese offering days: a wish on the day, closable. */}
      <FestivalBanner />

      <ExperienceSelector />

      <NetWorthCard
        wallets={walletsQuery.data}
        loading={walletsQuery.isLoading}
        assetsUsd={assets.totalUsd}
        // NBC $1 = …៛ · gold per damlung, inside the bottom of the card — opens /market.
        footer={<MarketRatesCard />}
        actions={
          editable && (
            <>
              <HeroAction icon={PlusIcon} tone="text-emerald-700" label={t("tx.INCOME")} onClick={() => setEntryType("INCOME")} />
              <HeroAction icon={MinusIcon} tone="text-rose-600" label={t("tx.EXPENSE")} onClick={() => setEntryType("EXPENSE")} />
              <HeroAction
                icon={ArrowLeftRightIcon}
                tone="text-teal-700"
                label={t("tx.TRANSFER")}
                onClick={() => setTransferOpen(true)}
                disabled={active.length < 2}
              />
            </>
          )
        }
      />


      <BirthdayCard />

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
          <WalletCarousel wallets={active} onAdd={editable ? () => setWalletFormOpen(true) : undefined} />
        )}
      </section>


      {workspace?.role === "VIEWER" && (
        <p className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">
          <EyeIcon className="size-4 shrink-0" aria-hidden />
          {t("family.viewerNotice")}
        </p>
      )}

      <CashFlowCard
        flow={flow}
        loading={txQuery.isLoading}
        action={
          <Link href="/budgets" className="flex items-center gap-1 text-sm text-primary">
            <TargetIcon className="size-4" aria-hidden />
            {t("budget.title")}
            <ChevronRightIcon className="size-4" />
          </Link>
        }
      />

      <DailyTipCard wallets={walletsQuery.data} debts={debtsQuery.data} workspace={workspace} />

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
          <div className="flex items-center gap-3 rounded-xl border border-dashed px-4 py-2.5">
            <ReceiptTextIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{t("recent.empty")}</span>
              <span className="block text-xs text-muted-foreground">{t("recent.emptyHint")}</span>
            </span>
            {/* New accounts: bring in the history from a bank statement instead of typing it. */}
            {editable && canImport && (
              <Button asChild size="sm" variant="outline" className="shrink-0">
                <Link href="/wallets/import">
                  <FileUpIcon />
                  {t("stmt.fromBank")}
                </Link>
              </Button>
            )}
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

      <GoalsHomeCard wallets={walletsQuery.data} />

      <BillsWidget workspaceId={ws} />
      <DebtTrackerWidget debts={debtsQuery.data} loading={debtsQuery.isLoading} onAdd={editable ? () => setDebtFormOpen(true) : undefined} />

      <TontineDueCard workspaceId={ws} />

      <InsuranceRenewalCard debts={debtsQuery.data} />

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

