"use client"

import { CoinsIcon, TrendingDownIcon, TrendingUpIcon } from "lucide-react"

import { Amount } from "@/components/money/amount"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { DualTotal } from "@/lib/analytics"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney } from "@/lib/money"
import { cn } from "@/lib/utils"
import { usePrefsStore } from "@/stores/prefs-store"

/**
 * What was actually received / spent in each currency ($15.00 and 2,000,000៛)
 * — the two lines above are the same total converted, not two balances.
 */
function Split({ native, negative }: { native: NonNullable<DualTotal["native"]>; negative?: boolean }) {
  const hidden = usePrefsStore((s) => s.hideBalances)
  const parts = [
    native.usd ? formatMoney(negative ? -native.usd : native.usd, "USD", { hidden }) : null,
    native.khr ? formatMoney(negative ? -native.khr : native.khr, "KHR", { hidden }) : null,
  ].filter(Boolean)
  if (!parts.length) return null
  return (
    // One currency per line: the three columns are too narrow on phones for "$15.00 · 2,000,000៛".
    <span className="mt-0.5 inline-flex w-fit max-w-full flex-col rounded-lg bg-muted px-2 py-1 text-[10px] leading-tight font-medium text-muted-foreground tabular-nums">
      {parts.map((p, i) => (
        <span key={i} className="truncate">
          {p}
        </span>
      ))}
    </span>
  )
}

function Stat({
  label,
  total,
  icon,
  tone,
  signed,
  negative,
}: {
  label: string
  total: DualTotal
  icon: React.ReactNode
  tone: string
  signed?: boolean
  /** Spending: the split is shown with a minus. */
  negative?: boolean
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 p-3">
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <span className={cn("[&_svg]:size-4", tone)}>{icon}</span>
        <span className="truncate">{label}</span>
      </span>
      <Amount value={total.usd} currency="USD" signed={signed} className="truncate text-base font-semibold" />
      {/* The same total in riel: an equivalent, not a second balance. */}
      <span className="truncate text-xs text-muted-foreground">
        ≈ <Amount value={total.khr} currency="KHR" signed={signed} />
      </span>
      {total.native && <Split native={total.native} negative={negative} />}
    </div>
  )
}

/** This month's income, expense and net flow, each in USD and KHR. */
export function CashFlowCard({
  flow,
  loading,
  action,
}: {
  flow: { income: DualTotal; expense: DualTotal; net: DualTotal }
  loading?: boolean
  /** A link shown at the right of the title row. */
  action?: React.ReactNode
}) {
  const t = useT()
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <h2 className="text-sm font-medium text-muted-foreground">{t("flow.title")}</h2>
        {action}
      </div>
      {loading ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : (
        <Card className="grid grid-cols-3 gap-0 divide-x py-0">
          <Stat label={t("flow.income")} total={flow.income} icon={<TrendingUpIcon />} tone="text-emerald-600 dark:text-emerald-400" />
          <Stat label={t("flow.expense")} total={flow.expense} icon={<TrendingDownIcon />} tone="text-rose-600 dark:text-rose-400" negative />
          <Stat label={t("flow.net")} total={flow.net} icon={<CoinsIcon />} tone="text-cyan-600 dark:text-cyan-400" signed />
        </Card>
      )}
    </section>
  )
}
