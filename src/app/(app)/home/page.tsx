"use client"

import { PushInviteCard } from "@/components/notifications/push-prompt"
import { ChevronRightIcon, EyeIcon, FileUpIcon, HandIcon, ReceiptTextIcon, SparklesIcon, WalletIcon } from "lucide-react"
import { format } from "date-fns"
import Link from "next/link"
import { useMemo, useState } from "react"

import { TontineDueCard } from "@/components/tontine/tontine-due-card"
import { FamilyStrip } from "@/components/family/family-strip"
import { ExperienceSelector } from "@/components/islamic/islamic-mode"
import { NextPrayerChip } from "@/components/islamic/next-prayer-chip"
import { SourceSelector } from "@/components/onboarding/source-selector"
import { QuickActionGrid } from "@/components/dashboard/quick-actions"
import { SmartHub } from "@/components/dashboard/smart-hub"
import { SpendingTrendCard } from "@/components/dashboard/spending-trend-card"
import { MarketRatesCard } from "@/components/dashboard/market-rates-card"
import { DebtFormSheet } from "@/components/debts/debt-form-sheet"
import { InsuranceRenewalCard } from "@/components/debts/insurance-card"
import { BusinessTrialTag } from "@/components/billing/business-trial"
import { ProfileAvatar } from "@/components/profile/profile-avatar"
import { EntryFormSheet } from "@/components/transactions/entry-form-sheet"
import { ScanSlipModal } from "@/components/transactions/scan-slip-modal"
import { TransactionEditor } from "@/components/transactions/transaction-editor"
import { TransactionList } from "@/components/transactions/transaction-list"
import { Button } from "@/components/ui/button"
import { useToday } from "@/hooks/use-today"
import { Skeleton } from "@/components/ui/skeleton"
import { NetWorthCard } from "@/components/wallets/net-worth-card"
import { BusinessValueCard } from "@/components/business/business-value-card"
import { TransferSheet } from "@/components/wallets/transfer-sheet"
import { WalletFormSheet } from "@/components/wallets/wallet-form-sheet"
import { liabilitiesUsd } from "@/lib/debts"
import { canWrite, useActiveWorkspace, useCategories, useDebts, useProfile, useTransactions, useWallets } from "@/lib/data/hooks"
import type { CategoryType, Transaction } from "@/lib/data/types"
import { headerDate, monthRange, recentMonths } from "@/lib/dates"
import { headerBadge, toHijri } from "@/lib/islamic"
import { homeGreeting } from "@/lib/islamic-expressions"
import { useAssetsTotal } from "@/lib/assets-total"
import { isGoal } from "@/lib/goals"
import { useIslamicDefaults, useIslamicEnabled } from "@/lib/islamic-settings"
import { useT } from "@/lib/i18n/use-t"
import { useLocaleStore } from "@/stores/locale-store"
import { usePrefsStore } from "@/stores/prefs-store"
import { useFeatures } from "@/lib/features"
import { quickActions } from "@/lib/quick-actions"
import { BirthdayCard } from "@/components/dashboard/birthday-card"
import { BirthdayCelebrationModal } from "@/components/birthday/birthday-celebration-modal"
import { LunarPill } from "@/components/dashboard/lunar-pill"
import { CalendarSwitchSheet } from "@/components/dashboard/calendar-switch-sheet"
import { FestivalBanner } from "@/components/dashboard/festival-banner"
import { HolyDayReminder } from "@/components/dashboard/holy-day-reminder"

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
  // Loans and money owed: their own line under the net worth (lib/debts › liabilitiesUsd).
  const liabilities = useMemo(() => liabilitiesUsd(debtsQuery.data ?? [], khrPerUsd), [debtsQuery.data, khrPerUsd])

  const [walletFormOpen, setWalletFormOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)
  const [entryType, setEntryType] = useState<CategoryType | null>(null)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [debtFormOpen, setDebtFormOpen] = useState(false)

  const wallets = walletsQuery.data ?? []
  // Wallets section lists ordinary wallets; savings goals show in their own card.
  const active = wallets.filter((w) => !w.archived_at && !isGoal(w))
  const transactions = useMemo(() => txQuery.data ?? [], [txQuery.data])
  // The display name from Settings, once the user has set one.
  // Cambodian names are family name first ("ស៊ូ ចិន្តា"): greet by the given name, the last word.
  const profile = useProfile().data
  const givenName = profile?.display_name?.trim().split(/\s+/).pop()
  const today = useToday()
  const locale = useLocaleStore((s) => s.locale)
  // Islamic tools (optional): Ramadan / Eid greetings in season. The Hijri date itself is on /islamic.
  const islamic = useIslamicEnabled()
  const hijriOffset = Number(useIslamicDefaults().hijri_offset ?? 0) || 0
  const hijri = islamic ? toHijri(today, hijriOffset) : null
  const badge = headerBadge({ islamic, hijri, locale })
  const greeting = homeGreeting(islamic, givenName)
  const [calendarOpen, setCalendarOpen] = useState(false)

  return (
    // «dash»: readable Khmer on the dashboard (globals.css — line-height 1.6, nothing under 13 px).
    <div className="dash space-y-4">
      {/* Two lines (founder, 18/10/2026 — on a 360 px phone the greeting and the Hijri badge squeezed each other
          into «…»): the greeting on its own full-width line, never cut; under it the short date (left) and the
          lunar / Hijri pill (right), wrapping rather than overlapping. tests/home-header.test.ts */}
      <header>
        {/* Two columns (founder, 21/10/2026 — Task #447): who on the left — the photo and the greeting, nothing else; when on
            the right — the date with its year, the lunar (or Hijri) pill under it, flush right. The greeting wraps, never
            «…»; the date column keeps its width, so the two never collide on a 360 px phone. A Business workspace shows its
            logo and name on the left. The photo and the greeting open Settings. */}
        <div className="flex w-full items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {workspace?.type === "BUSINESS" ? (
              // Business workspace: the business's logo and name instead of a personal greeting.
              <h1 className="flex min-w-0 items-center gap-2 text-lg font-bold">
                <ProfileAvatar path={workspace.logo_path} name={workspace.name} business className="size-8 shrink-0 rounded-lg text-xs" />
                <span className="min-w-0 break-words">{workspace.name}</span>
              </h1>
            ) : (
              <>
                <Link href="/settings" tabIndex={-1} aria-hidden className="shrink-0 rounded-full transition-transform active:scale-95">
                  <ProfileAvatar path={profile?.avatar_path} name={profile?.display_name?.trim() ?? ""} className="size-11 border-2 border-emerald-500/25 text-sm shadow-sm dark:border-emerald-400/30" />
                </Link>
                <Link href="/settings" className="min-w-0 flex-1 rounded-md" aria-label={t("settings.title")}>
                  <h1 className="block w-full break-words text-lg leading-snug font-bold">
                    {/* Islamic Mode: «អាស្សាឡាមុអាឡៃកុម, [ឈ្មោះ]» without the waving hand (lib/islamic-expressions). */}
                    {t(greeting.key, greeting.params)}
                    {greeting.wave && (
                      <>
                        {" "}
                        <HandIcon className="inline size-5 origin-[70%_80%] animate-wave align-[-3px] text-amber-500 motion-reduce:animate-none" strokeWidth={2} aria-hidden />
                      </>
                    )}
                  </h1>
                </Link>
              </>
            )}
          </div>
          <div className="flex max-w-[55%] shrink-0 flex-col items-end gap-1 text-right">
            <p className="text-xs whitespace-nowrap text-muted-foreground">
              <time dateTime={format(today, "yyyy-MM-dd")} suppressHydrationWarning>
                {headerDate(today, locale)}
              </time>
            </p>
            {/* A small gold pill with today's lunar day and the next holy day (opens the calendar switch).
                Islamic Mode: today's Hijri date instead (founder, 18/10/2026), or its greeting in season. */}
            {badge.kind === "greeting" ? (
              <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                <SparklesIcon className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{t(badge.key)}</span>
              </span>
            ) : badge.kind === "hijri" ? (
              <Link
                href="/islamic"
                className="inline-flex max-w-full cursor-pointer items-center rounded-full border border-emerald-200/80 bg-emerald-50 px-2.5 py-1 text-xs font-medium whitespace-nowrap text-emerald-900 shadow-xs transition-transform active:scale-95 dark:border-emerald-900/60 dark:bg-emerald-500/10 dark:text-emerald-200"
              >
                {/* One tap to the Islamic hub (founder, 19/10/2026). */}
                {badge.text}
              </Link>
            ) : badge.kind === "lunar" ? (
              <LunarPill onOpen={() => setCalendarOpen(true)} />
            ) : null}
            <CalendarSwitchSheet open={calendarOpen} onOpenChange={setCalendarOpen} />
          </div>
        </div>
        {workspace?.type === "FAMILY" && <FamilyStrip workspace={workspace} />}
        <BusinessTrialTag workspace={workspace} className="mt-1.5" />
      </header>
      <PushInviteCard />

      {/* Festivals and Khmer-Chinese offering days: a wish on the day, closable. */}
      <FestivalBanner />
      {/* 🪷 The day before and on a holy day: a gentle offerings reminder with one soft bell (Personal only). */}
      <HolyDayReminder />

      <SourceSelector />
      <ExperienceSelector />

      <NetWorthCard
        wallets={walletsQuery.data}
        loading={walletsQuery.isLoading}
        assetsUsd={assets.totalUsd}
        gaps={assets.gaps}
        onRetryGaps={assets.retry}
        liabilitiesUsd={liabilities}
        // NBC $1 = …៛ · gold per damlung (fuel in a Business workspace): one slim line at the bottom inside the card — opens /market.
        footer={<MarketRatesCard workspaceType={workspace?.type} />}
      />

      {/* Quick actions, three a row (founder, 21/10/2026 — after ACLEDA Mobile): a full-width sibling below the hero. */}
      <QuickActionGrid
        actions={quickActions({ editable, personal: workspace?.type === "PERSONAL", business: workspace?.type === "BUSINESS", islamic, walletCount: active.length })}
        onScan={() => setScanOpen(true)}
        onEntry={() => setEntryType("EXPENSE")}
        onIncome={() => setEntryType("INCOME")}
        onTransfer={() => setTransferOpen(true)}
      />

      {/* The signature dashboard (founder, 17/10/2026): the spending pulse, then the smart hub — the K-Score
          (the person's own: Personal only) and the next obligation within a week. Siblings BELOW the hero card,
          full width — never inside its action column (18/10/2026: nested, they were squashed into ~100 px). */}
      {/* Islamic Mode: the next prayer, one line, one tap to /islamic (a sibling below the hero, founder 19/10/2026). */}
      <NextPrayerChip />
      <SpendingTrendCard transactions={transactions} categories={categoriesQuery.data ?? []} />
      <SmartHub workspaceId={ws} personal={workspace?.type === "PERSONAL"} />

      {/* Business: its asset-based value (cash + equipment + stock − overdraft − loans). */}
      {workspace?.type === "BUSINESS" && <BusinessValueCard workspaceId={ws} wallets={walletsQuery.data} debts={debtsQuery.data} transactions={txQuery.data} categories={categoriesQuery.data} />}

      <BirthdayCard />
      <BirthdayCelebrationModal />

      {/* Decluttered (founder, 21/10/2026 — Task #445): the wallets are the ring's tap (/wallets); only a first wallet is
          offered here, while there is none. */}
      {!walletsQuery.isLoading && active.length === 0 && (
        <button
          type="button"
          onClick={() => setWalletFormOpen(true)}
          className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center hover:bg-muted/50"
        >
          <WalletIcon className="size-8 text-muted-foreground" />
          <span className="font-medium">{t("wallets.empty")}</span>
          <span className="text-sm text-muted-foreground">{t("wallets.emptyHint")}</span>
        </button>
      )}

      {workspace?.role === "VIEWER" && (
        <p className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">
          <EyeIcon className="size-4 shrink-0" aria-hidden />
          {t("family.viewerNotice")}
        </p>
      )}

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
        onTypeChange={setEntryType}
      />
      <ScanSlipModal open={scanOpen} onOpenChange={setScanOpen} workspaceId={ws} wallets={wallets} onManual={() => setEntryType("EXPENSE")} />
      <DebtFormSheet open={debtFormOpen} onOpenChange={setDebtFormOpen} workspaceId={ws} />
      <TransactionEditor workspaceId={ws} wallets={wallets} transaction={editing} onClose={() => setEditing(null)} />
    </div>
  )
}

