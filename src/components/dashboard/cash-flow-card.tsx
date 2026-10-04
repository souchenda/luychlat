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

type Kind = "income" | "expense" | "net"

const PILL: Record<Exclude<Kind, "net">, string> = {
  income: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  expense: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
}

/**
 * What was actually received / spent in each currency, one chip each
 * (+$15.00 · +2,000,000៛ / -$10.00 · -11,500៛) — the lines above are the same
 * total converted, not two balances.
 */
function Split({ native, kind }: { native: NonNullable<DualTotal["native"]>; kind: Exclude<Kind, "net"> }) {
  const hidden = usePrefsStore((s) => s.hideBalances)
  const sign = kind === "income" ? 1 : -1
  const parts = [
    native.usd ? formatMoney(sign * native.usd, "USD", { hidden, signed: true }) : null,
    native.khr ? formatMoney(sign * native.khr, "KHR", { hidden, signed: true }) : null,
  ].filter((p): p is string => Boolean(p))
  if (!parts.length) return null
  return (
    <div className="mt-auto flex flex-wrap gap-1 pt-0.5">
      {parts.map((p) => (
        <span key={p} className={cn("max-w-full truncate rounded px-1.5 py-0.5 text-[9.5px] font-semibold tabular-nums", PILL[kind])}>
          {p}
        </span>
      ))}
    </div>
  )
}

function Stat({ label, total, icon, tone, kind }: { label: string; total: DualTotal; icon: React.ReactNode; tone: string; kind: Kind }) {
  const net = kind === "net"
  return (
    <div className="flex min-w-0 flex-col gap-0.5 p-3">
      <span className="mb-0.5 flex items-center gap-1 text-xs text-muted-foreground">
        <span className={cn("[&_svg]:size-4", tone)}>{icon}</span>
        <span className="truncate">{label}</span>
      </span>
      <Amount
        value={total.usd}
        currency="USD"
        signed={net}
        className={cn("truncate text-base font-bold", net && (total.usd >= 0 ? "text-teal-600 dark:text-teal-400" : "text-rose-600 dark:text-rose-400"))}
      />
      {/* The same total in riel: an equivalent, not a second balance. */}
      <span className="truncate text-[11px] text-muted-foreground">
        ≈ <Amount value={total.khr} currency="KHR" signed={net} />
      </span>
      {!net && total.native && <Split native={total.native} kind={kind} />}
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
          <Stat label={t("flow.income")} total={flow.income} icon={<TrendingUpIcon />} tone="text-emerald-600 dark:text-emerald-400" kind="income" />
          <Stat label={t("flow.expense")} total={flow.expense} icon={<TrendingDownIcon />} tone="text-rose-600 dark:text-rose-400" kind="expense" />
          <Stat label={t("flow.net")} total={flow.net} icon={<CoinsIcon />} tone="text-teal-600 dark:text-teal-400" kind="net" />
        </Card>
      )}
    </section>
  )
}
