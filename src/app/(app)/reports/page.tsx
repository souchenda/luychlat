"use client"

import { addMonths, endOfMonth, format } from "date-fns"
import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  CalendarDaysIcon,
  ChartColumnIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FileSpreadsheetIcon,
  Loader2Icon,
  PrinterIcon,
  TargetIcon,
} from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { CategoryIcon } from "@/components/categories/category-icon"
import { Amount } from "@/components/money/amount"
import { PlStatement } from "@/components/reports/pl-statement"
import { dualTotal } from "@/lib/analytics"
import { depreciationForPeriod } from "@/lib/assets"
import { usePhysicalAssets } from "@/lib/assets-data"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { categoryLabel } from "@/lib/categories/presets"
import { useActiveWorkspace, useCategories, useDebts, useRepo, useTransactions, useWallets } from "@/lib/data/hooks"
import type { Currency } from "@/lib/data/types"
import { monthKey, monthLabel, monthStart, type MonthKey } from "@/lib/dates"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney } from "@/lib/money"
import { exportDebtsXlsx, exportFileName, exportTransactionsXlsx } from "@/lib/reports/export"
import { profitAndLoss } from "@/lib/reports/pl"
import { formatRange, presetRange, rangeToFilter, type DateRange, type RangePreset } from "@/lib/reports/ranges"
import { accountSummary, inCurrency, percentOf, spendingSplit, type Native } from "@/lib/reports/summary"
import { NeedsWants } from "@/components/reports/needs-wants"
import { KidsCard } from "@/components/home/kids-card"
import { showUpgrade, useIsPro } from "@/lib/plan"
import { cn } from "@/lib/utils"
import { useLocaleStore } from "@/stores/locale-store"
import { usePrefsStore } from "@/stores/prefs-store"
import { contentLocale } from "@/lib/i18n/dictionaries"

// Longer periods sit behind the calendar button; the header steps month by month.
type OtherPeriod = Exclude<RangePreset, "thisMonth" | "lastMonth">
const OTHER_PERIODS: OtherPeriod[] = ["thisQuarter", "ytd", "custom"]

function monthBounds(key: MonthKey): DateRange {
  const start = monthStart(key)
  return { from: format(start, "yyyy-MM-dd"), to: format(endOfMonth(start), "yyyy-MM-dd") }
}

/** One currency line inside a Cash in / Cash out card. */
function NativeLine({ code, value, currency }: { code: string; value: number; currency: Currency }) {
  return (
    <p className="flex items-baseline justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{code}</span>
      <Amount value={value} currency={currency} className="truncate font-medium" />
    </p>
  )
}

/** Green "Cash in" / red "Cash out" card: KHR and USD as recorded, then the total in the chosen currency. */
function FlowCard({ kind, total, currency, khrPerUsd }: { kind: "in" | "out"; total: Native; currency: Currency; khrPerUsd: number }) {
  const t = useT()
  const inflow = kind === "in"
  const tone = inflow ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"
  return (
    <Card className={cn("gap-1.5 px-3 py-3", inflow ? "border-emerald-500/30 bg-emerald-500/10" : "border-rose-500/30 bg-rose-500/10")}>
      <p className={cn("flex items-center gap-1 text-xs font-semibold", tone)}>
        {inflow ? <ArrowDownLeftIcon className="size-4" aria-hidden /> : <ArrowUpRightIcon className="size-4" aria-hidden />}
        {t(inflow ? "reports.cashIn" : "reports.cashOut")}
      </p>
      <NativeLine code="KHR" value={total.KHR} currency="KHR" />
      <NativeLine code="USD" value={total.USD} currency="USD" />
      <div className="mt-0.5 border-t pt-1.5">
        <p className="text-[11px] text-muted-foreground">{t("reports.total")}</p>
        <Amount
          value={(inflow ? 1 : -1) * inCurrency(total, currency, khrPerUsd)}
          currency={currency}
          signed={inflow}
          className={cn("block truncate text-base font-bold", tone)}
        />
      </div>
    </Card>
  )
}

export default function ReportsPage() {
  const t = useT()
  // Excel/PDF exports are Pro; Free users see the upgrade sheet instead.
  const canExport = useIsPro("export")
  const proOnly = (run: () => unknown) => () => (canExport ? void run() : showUpgrade("export"))
  const lang = useLocaleStore((s) => s.locale)
  const { khrPerUsd, hideBalances } = usePrefsStore()
  const { repo } = useRepo()
  const { workspace } = useActiveWorkspace()
  const ws = workspace?.id

  // A calendar month by default (banking style); the calendar button also offers quarter, year to date and custom dates.
  const currentMonth = monthKey()
  const [month, setMonth] = useState<MonthKey>(currentMonth)
  const [other, setOther] = useState<OtherPeriod | null>(null)
  const [custom, setCustom] = useState<DateRange>(() => monthBounds(currentMonth))
  const [pickerOpen, setPickerOpen] = useState(false)
  const range = other === "custom" ? custom : other ? presetRange(other) : monthBounds(month)
  const validRange = range.from <= range.to
  const stepMonth = (delta: number) => {
    setOther(null)
    setMonth((m) => monthKey(addMonths(monthStart(m), delta)))
  }
  const periodLabel = other === "custom" ? formatRange(range) : other ? t(`reports.range.${other}`) : monthLabel(month, lang)

  const [walletId, setWalletId] = useState<string | null>(null)
  const [shownCurrency, setShownCurrency] = useState<Currency | null>(null)
  const currency: Currency = shownCurrency ?? workspace?.currency_default ?? "USD"

  const { from, to } = range
  const filter = useMemo(() => rangeToFilter({ from, to }), [from, to])
  const txQuery = useTransactions(validRange ? ws : undefined, filter)
  const categoriesData = useCategories(ws).data
  const categories = useMemo(() => categoriesData ?? [], [categoriesData])
  const walletsData = useWallets(ws).data
  const wallets = useMemo(() => walletsData ?? [], [walletsData])
  const activeWallets = wallets.filter((w) => !w.archived_at)
  const debts = useDebts(ws).data ?? []
  const [busy, setBusy] = useState<"tx" | "debts" | null>(null)

  // The chosen account narrows everything below: summary, statement and the Excel export.
  const periodTx = useMemo(
    () => (txQuery.data && walletId ? txQuery.data.filter((tx) => tx.wallet_id === walletId || tx.to_wallet_id === walletId) : txQuery.data),
    [txQuery.data, walletId],
  )
  const summary = useMemo(
    () => (periodTx ? accountSummary(periodTx, categories, wallets, walletId, khrPerUsd) : null),
    [periodTx, categories, wallets, walletId, khrPerUsd],
  )
  const spentTotal = summary ? inCurrency(summary.cashOut, currency, khrPerUsd) : 0
  const split = useMemo(() => (periodTx ? spendingSplit(periodTx, categories, walletId) : null), [periodTx, categories, walletId])
  const pl = useMemo(() => (periodTx ? profitAndLoss(periodTx, categories, khrPerUsd) : null), [periodTx, categories, khrPerUsd])
  // Business: the period's depreciation of its equipment (non-cash) for net operating profit.
  const physical = usePhysicalAssets(workspace?.type === "BUSINESS" ? workspace.id : undefined).data
  const depreciation = useMemo(() => {
    if (!physical?.length || !validRange) return null
    const d = depreciationForPeriod(physical, from, to)
    return d.lines.length ? { total: dualTotal(d.usd, d.khr, khrPerUsd), lines: d.lines } : null
  }, [physical, from, to, validRange, khrPerUsd])
  const walletName = walletId ? wallets.find((w) => w.id === walletId)?.name : undefined
  const business = workspace?.type === "BUSINESS"
  const suffix = `${range.from}_${range.to}`
  const loading = !summary || txQuery.isLoading

  const exportTransactions = async () => {
    if (!periodTx || !workspace) return
    setBusy("tx")
    try {
      await exportTransactionsXlsx({
        transactions: periodTx,
        wallets,
        categories,
        debts,
        lang: contentLocale(lang),
        fileName: exportFileName("transactions", workspace.type, suffix),
      })
      toast.success(t("reports.exported"))
    } catch {
      toast.error(t("common.error"))
    } finally {
      setBusy(null)
    }
  }

  const exportDebts = async () => {
    if (!workspace) return
    setBusy("debts")
    try {
      const repayments = (await Promise.all(debts.map((d) => repo.listRepayments(d.id)))).flat()
      await exportDebtsXlsx({ debts, repayments, wallets, lang: contentLocale(lang), fileName: exportFileName("debts", workspace.type, "all") })
      toast.success(t("reports.exported"))
    } catch {
      toast.error(t("common.error"))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <ChartColumnIcon className="size-5 text-primary" aria-hidden />
          {t("reports.title")}
        </h1>
        <p className="text-sm text-muted-foreground">{workspace ? t(`ws.${workspace.type}`) : ""}</p>
      </div>

      {/* Month selector: < Month Year 📅 > */}
      <div className="space-y-2 print:hidden">
        <div className="flex items-center justify-center gap-1">
          <Button type="button" size="icon" variant="ghost" onClick={() => stepMonth(-1)} aria-label={t("reports.prevMonth")}>
            <ChevronLeftIcon />
          </Button>
          <button
            type="button"
            onClick={() => setPickerOpen((o) => !o)}
            className="flex min-w-0 items-center gap-1.5 rounded-full px-3 py-1.5 font-semibold hover:bg-muted"
            aria-expanded={pickerOpen}
            aria-label={t("reports.pickPeriod")}
          >
            <span className="truncate">{periodLabel}</span>
            <CalendarDaysIcon className="size-4 shrink-0 text-primary" aria-hidden />
          </button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => stepMonth(1)}
            disabled={!other && month >= currentMonth}
            aria-label={t("reports.nextMonth")}
          >
            <ChevronRightIcon />
          </Button>
        </div>

        {pickerOpen && (
          <Card className="gap-3 px-4 py-3">
            <div className="space-y-1">
              <Label htmlFor="report-month">{t("reports.month")}</Label>
              <Input
                id="report-month"
                type="month"
                max={currentMonth}
                value={month}
                onChange={(e) => {
                  if (!e.target.value) return
                  setMonth(e.target.value)
                  setOther(null)
                  setPickerOpen(false)
                }}
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">{t("reports.otherPeriods")}</p>
              <div className="flex flex-wrap gap-1.5">
                {OTHER_PERIODS.map((p) => (
                  <Button
                    key={p}
                    type="button"
                    size="sm"
                    variant={other === p ? "default" : "secondary"}
                    className="rounded-full"
                    onClick={() => {
                      setOther(p)
                      if (p !== "custom") setPickerOpen(false)
                    }}
                    aria-pressed={other === p}
                  >
                    {t(`reports.range.${p}`)}
                  </Button>
                ))}
              </div>
            </div>
            {other === "custom" && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="range-from">{t("reports.from")}</Label>
                  <Input id="range-from" type="date" max="9999-12-31" value={custom.from} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="range-to">{t("reports.to")}</Label>
                  <Input id="range-to" type="date" max="9999-12-31" value={custom.to} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))} />
                </div>
              </div>
            )}
          </Card>
        )}
        {!validRange && <p className="text-center text-sm text-destructive">{t("reports.invalidRange")}</p>}
      </div>

      {/* Account filter + ៛ / $ switch */}
      <div className="flex items-center gap-2 print:hidden">
        <Select value={walletId ?? "all"} onValueChange={(v) => setWalletId(v === "all" ? null : v)}>
          <SelectTrigger className="min-w-0 flex-1" aria-label={t("reports.walletFilter")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("reports.allWallets")}</SelectItem>
            {activeWallets.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.name} · {w.currency}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div role="group" aria-label={t("reports.currency")} className="flex shrink-0 rounded-full bg-muted p-0.5">
          {(["KHR", "USD"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setShownCurrency(c)}
              aria-pressed={currency === c}
              className={cn(
                "min-w-10 rounded-full px-3 py-1 text-base leading-6 font-semibold transition-colors",
                currency === c ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {c === "KHR" ? <span className="text-xl leading-6">៛</span> : "$"}
            </button>
          ))}
        </div>
      </div>

      {/* Cash in / Cash out */}
      <div className="print:hidden">
        {loading ? (
          <Skeleton className="h-36 w-full rounded-xl" />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <FlowCard kind="in" total={summary.cashIn} currency={currency} khrPerUsd={khrPerUsd} />
            <FlowCard kind="out" total={summary.cashOut} currency={currency} khrPerUsd={khrPerUsd} />
          </div>
        )}
        <p className="mt-1.5 px-1 text-[11px] text-muted-foreground">{t(walletId ? "reports.summaryNoteWallet" : "reports.summaryNote")}</p>
      </div>

      {/* Expenses by category, largest first */}
      <section className="space-y-2 print:hidden">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-medium text-muted-foreground">{t("reports.byCategory")}</h2>
          <button
            type="button"
            onClick={() => document.getElementById("statement")?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="flex items-center text-sm text-primary"
          >
            {t("reports.analyze")}
            <ChevronRightIcon className="size-4" />
          </button>
        </div>
        {loading ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : summary.expenses.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t("reports.noExpenses")}</p>
        ) : (
          <Card className="gap-0 py-0">
            <ul className="divide-y">
              {summary.expenses.map((row) => {
                const amount = inCurrency(row.amount, currency, khrPerUsd)
                const share = percentOf(amount, spentTotal)
                const name = row.transfer ? t("tx.TRANSFER") : row.category ? categoryLabel(row.category, lang) : t("entry.uncategorized")
                return (
                  <li key={row.key} className="flex items-center gap-3 px-4 py-2.5">
                    <CategoryIcon category={row.category} transfer={row.transfer} className="size-9" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-medium">{name}</span>
                        <Amount value={-amount} currency={currency} className="shrink-0 text-sm font-semibold text-rose-600 dark:text-rose-400" />
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <span className="block h-full rounded-full bg-rose-500/70" style={{ width: `${Math.min(100, share)}%` }} />
                        </span>
                        <span className="w-12 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{share}%</span>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </Card>
        )}
      </section>

      {!loading && split && <NeedsWants split={split} currency={currency} khrPerUsd={khrPerUsd} />}
      {/* 👶 Spending on the children in this period (not for a business). */}
      {!loading && periodTx && workspace?.type !== "BUSINESS" && <KidsCard transactions={periodTx} period />}

      {/* Statement (also the printable / PDF view) */}
      <Card id="statement" className="scroll-mt-20 gap-0 overflow-hidden py-0 print:border-0 print:shadow-none">
        <div className="space-y-0.5 border-b px-4 py-3">
          <p className="hidden text-xs text-muted-foreground print:block">លុយឆ្លាត · LuyChlat</p>
          <h2 className="font-semibold">{t(business ? "pl.title" : "pl.titlePersonal")}</h2>
          <p className="text-xs text-muted-foreground">
            {workspace ? t(`ws.${workspace.type}`) : ""}
            {walletName ? ` · ${walletName}` : ""} · {formatRange(range)}
          </p>
        </div>
        {!pl || txQuery.isLoading ? (
          <Skeleton className="m-4 h-64" />
        ) : (
          <PlStatement pl={pl} workspaceType={workspace?.type ?? "PERSONAL"} depreciation={depreciation} />
        )}
        {pl && (
          <div className="space-y-0.5 border-t px-4 py-3 text-[11px] text-muted-foreground">
            <p>{t("reports.basis", { rate: khrPerUsd.toLocaleString("en-US"), count: pl.transactionCount })}</p>
            {(pl.excluded.capital.usd > 0 || pl.excluded.debtFlows.usd > 0 || pl.excluded.adjustments.usd !== 0) && (
              <p>
                {t("reports.excluded", {
                  capital: formatMoney(pl.excluded.capital.usd, "USD", { hidden: hideBalances }),
                  debt: formatMoney(pl.excluded.debtFlows.usd, "USD", { hidden: hideBalances }),
                  adjustments: formatMoney(pl.excluded.adjustments.usd, "USD", { hidden: hideBalances, signed: true }),
                })}
              </p>
            )}
            <p className="hidden print:block">{t("reports.generated", { date: format(new Date(), "dd/MM/yyyy HH:mm") })}</p>
          </div>
        )}
      </Card>

      <Link
        href="/budgets"
        className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 transition-colors hover:bg-muted/60 print:hidden"
      >
        <TargetIcon className="size-5 text-primary" aria-hidden />
        <span className="flex-1">
          <span className="block text-sm font-medium">{t("budget.title")}</span>
          <span className="block text-xs text-muted-foreground">{t("budget.settingsHint")}</span>
        </span>
        <ChevronRightIcon className="size-4 text-muted-foreground" />
      </Link>

      {/* Exports */}
      <section id="export" className="scroll-mt-20 space-y-2 print:hidden">
        <h2 className="px-1 text-sm font-medium text-muted-foreground">{t("reports.export")}</h2>
        <Card className="gap-2 px-4 py-4">
          <Button variant="outline" className="h-11 justify-start" onClick={proOnly(exportTransactions)} disabled={busy !== null || !periodTx}>
            {busy === "tx" ? <Loader2Icon className="animate-spin" /> : <FileSpreadsheetIcon className="text-emerald-600" />}
            <span className="flex-1 text-left">{t("reports.exportTransactions")}</span>
            <span className="text-xs text-muted-foreground">.xlsx</span>
          </Button>
          <Button variant="outline" className="h-11 justify-start" onClick={proOnly(exportDebts)} disabled={busy !== null}>
            {busy === "debts" ? <Loader2Icon className="animate-spin" /> : <FileSpreadsheetIcon className="text-emerald-600" />}
            <span className="flex-1 text-left">{t("reports.exportDebts")}</span>
            <span className="text-xs text-muted-foreground">.xlsx</span>
          </Button>
          <Button variant="outline" className="h-11 justify-start" onClick={proOnly(() => window.print())} disabled={!pl}>
            <PrinterIcon className="text-sky-600" />
            <span className="flex-1 text-left">{t("reports.print")}</span>
            <span className="text-xs text-muted-foreground">PDF</span>
          </Button>
          <p className="text-xs text-muted-foreground">{t("reports.printHint")}</p>
        </Card>
      </section>
    </div>
  )
}
