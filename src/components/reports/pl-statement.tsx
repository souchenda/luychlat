"use client"

import { ChevronDownIcon, TrendingDownIcon, TrendingUpIcon } from "lucide-react"

import { Amount } from "@/components/money/amount"
import type { DualTotal } from "@/lib/analytics"
import { categoryLabel } from "@/lib/categories/presets"
import type { WorkspaceType } from "@/lib/data/types"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import type { PlLine, ProfitAndLoss } from "@/lib/reports/pl"
import { cn } from "@/lib/utils"
import { useLocaleStore } from "@/stores/locale-store"

function Money({ total, negative, strong }: { total: DualTotal; negative?: boolean; strong?: boolean }) {
  const sign = negative ? -1 : 1
  return (
    <span className="text-right">
      <Amount value={sign * total.usd} currency="USD" className={cn("block text-sm", strong ? "font-bold" : "font-medium")} />
      <Amount value={sign * total.khr} currency="KHR" className="block text-[11px] text-muted-foreground" />
    </span>
  )
}

function Row({
  label,
  total,
  lines,
  negative,
  strong,
  note,
}: {
  label: string
  total: DualTotal
  lines?: PlLine[]
  negative?: boolean
  strong?: boolean
  note?: string
}) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const head = (
    <div className={cn("flex items-start justify-between gap-3 px-4 py-3", strong && "bg-muted/50")}>
      <span className="min-w-0">
        <span className={cn("flex items-center gap-1 text-sm", strong ? "font-bold" : "font-medium")}>
          {label}
          {lines && lines.length > 0 && <ChevronDownIcon className="size-3.5 text-muted-foreground transition-transform group-open:rotate-180 print:hidden" />}
        </span>
        {note && <span className="block text-[11px] text-muted-foreground">{note}</span>}
      </span>
      <Money total={total} negative={negative} strong={strong} />
    </div>
  )
  if (!lines?.length) return head
  return (
    // Breakdown starts expanded (also on paper) and can be collapsed on screen.
    <details className="group" open>
      <summary className="cursor-pointer list-none">{head}</summary>
      <div className="space-y-1 pb-2">
        {lines.map((line) => (
          <div key={line.key} className="flex items-center justify-between gap-3 px-4 pl-8 text-xs text-muted-foreground">
            <span className="truncate">{line.category ? categoryLabel(line.category, locale) : t("entry.uncategorized")}</span>
            <Amount value={(negative ? -1 : 1) * line.total.usd} currency="USD" />
          </div>
        ))}
      </div>
    </details>
  )
}

/** Cash-basis P&L. Business shows COGS and gross profit; Personal is a simple income statement. */
export function PlStatement({ pl, workspaceType }: { pl: ProfitAndLoss; workspaceType: WorkspaceType }) {
  const t = useT()
  const business = workspaceType === "BUSINESS"
  const loss = pl.netProfit.usd < 0
  const margin = (m: number | null, key: MessageKey) => (m === null ? undefined : t(key, { percent: m }))

  return (
    <div className="divide-y">
      <Row label={t(business ? "pl.revenue" : "pl.income")} total={pl.revenue} lines={pl.revenueLines} />
      {business && (
        <>
          <Row label={t("pl.cogs")} total={pl.cogs} lines={pl.cogsLines} negative />
          <Row label={t("pl.grossProfit")} total={pl.grossProfit} strong note={margin(pl.grossMargin, "pl.margin")} />
        </>
      )}
      <Row label={t(business ? "pl.opex" : "pl.expenses")} total={pl.opex} lines={pl.opexLines} negative />
      {(pl.otherIncome.usd !== 0 || business) && <Row label={t("pl.otherIncome")} total={pl.otherIncome} />}
      <div className={cn("flex items-center justify-between gap-3 px-4 py-4", loss ? "bg-red-500/10" : "bg-emerald-500/10")}>
        <span className="flex items-center gap-2">
          {loss ? <TrendingDownIcon className="size-5 text-red-600" /> : <TrendingUpIcon className="size-5 text-emerald-600" />}
          <span>
            <span className="block text-sm font-bold">{t(loss ? "pl.netLoss" : "pl.netProfit")}</span>
            {pl.netMargin !== null && <span className="block text-[11px] text-muted-foreground">{t("pl.margin", { percent: pl.netMargin })}</span>}
          </span>
        </span>
        <Money total={pl.netProfit} strong />
      </div>
    </div>
  )
}
