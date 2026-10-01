"use client"

import { format } from "date-fns"
import { ChartColumnIcon, ChevronRightIcon, FileSpreadsheetIcon, Loader2Icon, PrinterIcon, TargetIcon } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { PlStatement } from "@/components/reports/pl-statement"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { useActiveWorkspace, useCategories, useDebts, useRepo, useTransactions, useWallets } from "@/lib/data/hooks"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney } from "@/lib/money"
import { exportDebtsXlsx, exportFileName, exportTransactionsXlsx } from "@/lib/reports/export"
import { profitAndLoss } from "@/lib/reports/pl"
import { formatRange, presetRange, rangeToFilter, type DateRange, type RangePreset } from "@/lib/reports/ranges"
import { showUpgrade, useIsPro } from "@/lib/plan"
import { cn } from "@/lib/utils"
import { useLocaleStore } from "@/stores/locale-store"
import { usePrefsStore } from "@/stores/prefs-store"

const PRESETS: RangePreset[] = ["thisMonth", "lastMonth", "thisQuarter", "ytd", "custom"]

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

  const [preset, setPreset] = useState<RangePreset>("thisMonth")
  const [custom, setCustom] = useState<DateRange>(() => presetRange("thisMonth"))
  const range = preset === "custom" ? custom : presetRange(preset)
  const validRange = range.from <= range.to

  const { from, to } = range
  const filter = useMemo(() => rangeToFilter({ from, to }), [from, to])
  const txQuery = useTransactions(validRange ? ws : undefined, filter)
  const categoriesData = useCategories(ws).data
  const categories = useMemo(() => categoriesData ?? [], [categoriesData])
  const wallets = useWallets(ws).data ?? []
  const debts = useDebts(ws).data ?? []
  const [busy, setBusy] = useState<"tx" | "debts" | null>(null)

  const pl = useMemo(
    () => (txQuery.data ? profitAndLoss(txQuery.data, categories, khrPerUsd) : null),
    [txQuery.data, categories, khrPerUsd],
  )
  const business = workspace?.type === "BUSINESS"
  const suffix = `${range.from}_${range.to}`

  const exportTransactions = async () => {
    if (!txQuery.data || !workspace) return
    setBusy("tx")
    try {
      await exportTransactionsXlsx({
        transactions: txQuery.data,
        wallets,
        categories,
        debts,
        lang,
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
      await exportDebtsXlsx({ debts, repayments, wallets, lang, fileName: exportFileName("debts", workspace.type, "all") })
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

      {/* Period */}
      <div className="space-y-2 print:hidden">
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
          {PRESETS.map((p) => (
            <Button
              key={p}
              type="button"
              size="sm"
              variant={preset === p ? "default" : "secondary"}
              className="shrink-0 rounded-full"
              onClick={() => setPreset(p)}
              aria-pressed={preset === p}
            >
              {t(`reports.range.${p}`)}
            </Button>
          ))}
        </div>
        {preset === "custom" && (
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
        {!validRange && <p className="text-sm text-destructive">{t("reports.invalidRange")}</p>}
      </div>

      {/* Statement (also the printable / PDF view) */}
      <Card className="gap-0 overflow-hidden py-0 print:border-0 print:shadow-none">
        <div className="space-y-0.5 border-b px-4 py-3">
          <p className="hidden text-xs text-muted-foreground print:block">លុយឆ្លាត · LuySmart</p>
          <h2 className="font-semibold">{t(business ? "pl.title" : "pl.titlePersonal")}</h2>
          <p className="text-xs text-muted-foreground">
            {workspace ? t(`ws.${workspace.type}`) : ""} · {formatRange(range)}
          </p>
        </div>
        {!pl || txQuery.isLoading ? (
          <Skeleton className="m-4 h-64" />
        ) : (
          <PlStatement pl={pl} workspaceType={workspace?.type ?? "PERSONAL"} />
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
      <section className="space-y-2 print:hidden">
        <h2 className="px-1 text-sm font-medium text-muted-foreground">{t("reports.export")}</h2>
        <Card className="gap-2 px-4 py-4">
          <Button variant="outline" className="h-11 justify-start" onClick={proOnly(exportTransactions)} disabled={busy !== null || !txQuery.data}>
            {busy === "tx" ? <Loader2Icon className="animate-spin" /> : <FileSpreadsheetIcon className="text-emerald-600" />}
            <span className="flex-1 text-left">{t("reports.exportTransactions")}</span>
            <span className="text-xs text-muted-foreground">.xlsx</span>
          </Button>
          <Button variant="outline" className="h-11 justify-start" onClick={proOnly(exportDebts)} disabled={busy !== null}>
            {busy === "debts" ? <Loader2Icon className="animate-spin" /> : <FileSpreadsheetIcon className="text-emerald-600" />}
            <span className="flex-1 text-left">{t("reports.exportDebts")}</span>
            <span className="text-xs text-muted-foreground">.xlsx</span>
          </Button>
          <Button variant="outline" className={cn("h-11 justify-start")} onClick={proOnly(() => window.print())} disabled={!pl}>
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
