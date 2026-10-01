"use client"

import { CoinsIcon, TrendingDownIcon, TrendingUpIcon } from "lucide-react"

import { Amount } from "@/components/money/amount"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { DualTotal } from "@/lib/analytics"
import { useT } from "@/lib/i18n/use-t"
import { cn } from "@/lib/utils"

function Stat({
  label,
  total,
  icon,
  tone,
  signed,
}: {
  label: string
  total: DualTotal
  icon: React.ReactNode
  tone: string
  signed?: boolean
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 p-3">
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <span className={cn("[&_svg]:size-4", tone)}>{icon}</span>
        <span className="truncate">{label}</span>
      </span>
      <Amount value={total.usd} currency="USD" signed={signed} className="truncate text-base font-semibold" />
      <Amount value={total.khr} currency="KHR" signed={signed} className="truncate text-xs text-muted-foreground" />
    </div>
  )
}

/** This month's income, expense and net flow, each in USD and KHR. */
export function CashFlowCard({
  flow,
  loading,
}: {
  flow: { income: DualTotal; expense: DualTotal; net: DualTotal }
  loading?: boolean
}) {
  const t = useT()
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-sm font-medium text-muted-foreground">{t("flow.title")}</h2>
      {loading ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : (
        <Card className="grid grid-cols-3 gap-0 divide-x py-0">
          <Stat label={t("flow.income")} total={flow.income} icon={<TrendingUpIcon />} tone="text-emerald-600 dark:text-emerald-400" />
          <Stat label={t("flow.expense")} total={flow.expense} icon={<TrendingDownIcon />} tone="text-rose-600 dark:text-rose-400" />
          <Stat label={t("flow.net")} total={flow.net} icon={<CoinsIcon />} tone="text-cyan-600 dark:text-cyan-400" signed />
        </Card>
      )}
    </section>
  )
}
