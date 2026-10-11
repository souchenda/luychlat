"use client"

import { addMonths, endOfMonth, format } from "date-fns"
import { ArrowLeftIcon, ChevronLeftIcon, ChevronRightIcon, DownloadIcon, Loader2Icon, LandmarkIcon } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cambodiaToday, useBills } from "@/lib/bills"
import { useActiveWorkspace, useCategories, useTransactions } from "@/lib/data/hooks"
import { monthKey, monthLabel, monthStart, type MonthKey } from "@/lib/dates"
import { contentLocale } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney } from "@/lib/money"
import { showUpgrade, useIsPro } from "@/lib/plan"
import { exportFileName, exportTaxXlsx } from "@/lib/reports/export"
import { rangeToFilter } from "@/lib/reports/ranges"
import { MINIMUM_TAX_RATE, PATENT_TAX_KHR, RENT_WHT_RATE, taxEstimate } from "@/lib/reports/tax"
import { useLocaleStore } from "@/stores/locale-store"
import { usePrefsStore } from "@/stores/prefs-store"

/**
 * /reports/tax (Business workspace): the month's tax estimate for a small taxpayer — 1% minimum tax
 * on gross sales, 10% withholding on rent, the 400,000 ៛ patent tax (by 31 March) — and the monthly
 * tax reserve to set aside, with a one-tap Excel summary for the accountant. An estimate only.
 */
export default function TaxPage() {
  const t = useT()
  const lang = useLocaleStore((s) => s.locale)
  const { khrPerUsd, hideBalances } = usePrefsStore()
  const { workspace } = useActiveWorkspace()
  const business = workspace?.type === "BUSINESS"
  const ws = business ? workspace?.id : undefined
  const canExport = useIsPro("export")
  const [month, setMonth] = useState<MonthKey>(monthKey())
  const [busy, setBusy] = useState(false)
  const start = monthStart(month)
  const from = format(start, "yyyy-MM-dd")
  const to = format(endOfMonth(start), "yyyy-MM-dd")
  const filter = useMemo(() => rangeToFilter({ from, to }), [from, to])
  const txQuery = useTransactions(ws, filter)
  const categories = useCategories(ws).data
  const bills = useBills(ws).data
  const today = cambodiaToday()
  const estimate = useMemo(() => {
    if (!txQuery.data || !categories) return null
    const rentBillCategories = (bills ?? []).filter((b) => b.kind === "RENT").map((b) => b.category_id)
    return taxEstimate(txQuery.data, categories, khrPerUsd, today, rentBillCategories)
  }, [txQuery.data, categories, bills, khrPerUsd, today])
  const khr = (n: number) => formatMoney(n, "KHR", { hidden: hideBalances })

  const exportSummary = async () => {
    if (!canExport) return showUpgrade("export")
    if (!estimate || !workspace) return
    setBusy(true)
    try {
      await exportTaxXlsx({ workspace: workspace.name, month: monthLabel(month, lang), estimate, lang: contentLocale(lang), fileName: exportFileName("tax", workspace.type, month) })
      toast.success(t("reports.exported"))
    } catch {
      toast.error(t("common.error"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" className="size-9" aria-label={t("common.back")}>
          <Link href="/reports">
            <ArrowLeftIcon />
          </Link>
        </Button>
        <h1 className="flex-1 text-xl font-semibold">{t("tax.title")}</h1>
      </div>

      {!business ? (
        <Card className="px-4 py-4">
          <p className="text-sm text-muted-foreground">{t("tax.businessOnly")}</p>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" aria-label="←" onClick={() => setMonth((m) => monthKey(addMonths(monthStart(m), -1)))}>
              <ChevronLeftIcon />
            </Button>
            <p className="font-medium">{monthLabel(month, lang)}</p>
            <Button variant="ghost" size="icon" aria-label="→" disabled={month >= monthKey()} onClick={() => setMonth((m) => monthKey(addMonths(monthStart(m), 1)))}>
              <ChevronRightIcon />
            </Button>
          </div>

          {!estimate ? (
            <Skeleton className="h-56 rounded-2xl" />
          ) : (
            <>
              {/* The monthly tax reserve: what to set aside. */}
              <Card className="gap-1 border-emerald-500/30 bg-emerald-500/5 px-4 py-4">
                <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-800 dark:text-emerald-300">
                  <LandmarkIcon className="size-4" aria-hidden />
                  {t("tax.reserve")}
                </p>
                <p className="text-3xl font-bold tabular-nums">{khr(estimate.reserveKhr)}</p>
                <p className="text-xs text-muted-foreground">{t("tax.reserveHint")}</p>
              </Card>

              <Card className="gap-0 divide-y py-0">
                <Line title={t("tax.minimum")} base={t("tax.minimumBase", { amount: khr(estimate.salesKhr), rate: `${MINIMUM_TAX_RATE * 100}%` })} value={khr(estimate.minimumTaxKhr)} />
                <Line title={t("tax.rentWht")} base={t("tax.rentBase", { amount: khr(estimate.rentKhr), rate: `${RENT_WHT_RATE * 100}%` })} value={khr(estimate.rentWhtKhr)} />
                <Line title={t("tax.patent")} base={t("tax.patentBase", { amount: khr(PATENT_TAX_KHR) })} value={khr(estimate.patentShareKhr)} />
              </Card>

              {estimate.patentDueInDays !== null && (
                <Card className="border-amber-500/30 bg-amber-500/5 px-4 py-3">
                  <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                    {estimate.patentDueInDays >= 0 ? t("tax.patentDue", { days: estimate.patentDueInDays }) : t("tax.patentLate")}
                  </p>
                </Card>
              )}

              <Button variant="outline" className="h-11 w-full" disabled={busy} onClick={() => void exportSummary()}>
                {busy ? <Loader2Icon className="animate-spin" /> : <DownloadIcon />}
                {t("tax.export")}
              </Button>
              <p className="px-1 text-xs leading-relaxed text-muted-foreground">{t("tax.disclaimer")}</p>
            </>
          )}
        </>
      )}
    </div>
  )
}

function Line({ title, base, value }: { title: string; base: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{base}</p>
      </div>
      <p className="shrink-0 font-semibold tabular-nums">{value}</p>
    </div>
  )
}
