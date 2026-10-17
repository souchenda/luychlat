"use client"

import { TrendingDownIcon, TrendingUpIcon, WalletIcon } from "lucide-react"

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
        <span key={p} className={cn("max-w-full truncate rounded-md px-2 py-0.5 text-[13px] font-semibold tabular-nums", PILL[kind])}>
          {p}
        </span>
      ))}
    </div>
  )
}

/** Income or expense: its own card, the label at 14 px and the amount large (founder, 17/10/2026). */
function Stat({ label, total, icon, tone, kind }: { label: string; total: DualTotal; icon: React.ReactNode; tone: string; kind: Exclude<Kind, "net"> }) {
  return (
    <Card className="flex min-w-0 flex-col gap-1 px-4 py-3.5">
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <span className={cn("[&_svg]:size-4", tone)}>{icon}</span>
        <span>{label}</span>
      </span>
      <Amount value={total.usd} currency="USD" className="block truncate text-2xl font-bold tracking-tight tabular-nums" />
      {/* The same total in riel: an equivalent, not a second balance. */}
      <span className="truncate text-sm text-muted-foreground tabular-nums">
        ≈ <Amount value={total.khr} currency="KHR" />
      </span>
      {total.native && <Split native={total.native} kind={kind} />}
    </Card>
  )
}

/** The month's net: one full-width row under the two cards. */
function NetRow({ label, total, icon }: { label: string; total: DualTotal; icon: React.ReactNode }) {
  const up = total.usd >= 0
  return (
    <Card className="flex flex-row items-center justify-between gap-3 px-4 py-3">
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <span className="text-teal-500 [&_svg]:size-4">{icon}</span>
        {label}
      </span>
      <span className="text-right tabular-nums">
        <Amount value={total.usd} currency="USD" signed className={cn("block text-xl font-bold", up ? "text-teal-600 dark:text-teal-400" : "text-rose-600 dark:text-rose-400")} />
        <span className="block text-[13px] text-muted-foreground">
          ≈ <Amount value={total.khr} currency="KHR" signed />
        </span>
      </span>
    </Card>
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
        <h2 className="text-[15px] font-semibold">{t("flow.title")}</h2>
        {action}
      </div>
      {loading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Stat label={t("flow.income")} total={flow.income} icon={<TrendingUpIcon strokeWidth={2} />} tone="text-emerald-500" kind="income" />
            <Stat label={t("flow.expense")} total={flow.expense} icon={<TrendingDownIcon strokeWidth={2} />} tone="text-rose-500" kind="expense" />
          </div>
          <NetRow label={t("flow.net")} total={flow.net} icon={<WalletIcon strokeWidth={2} />} />
        </div>
      )}
    </section>
  )
}
