"use client"

import { format } from "date-fns"
import { enUS, km } from "date-fns/locale"
import { TrendingDownIcon, TrendingUpIcon } from "lucide-react"
import { useMemo } from "react"
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts"

import { Amount } from "@/components/money/amount"
import { Card } from "@/components/ui/card"
import { monthlyTrend, spendingChange } from "@/lib/analytics"
import { adjustmentCategoryIds } from "@/lib/categories/presets"
import type { Category, Transaction } from "@/lib/data/types"
import { monthStart, type MonthKey } from "@/lib/dates"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney } from "@/lib/money"
import { cn } from "@/lib/utils"
import { useLocaleStore } from "@/stores/locale-store"
import { usePrefsStore } from "@/stores/prefs-store"

/**
 * Home (founder, 17/10/2026 — the infographic dashboard): spending over the last six months, one series
 * (--viz-expense, a validated theme token), with this month's total and the change from last month as the
 * headline. Tap a month for its amount. Balances hidden → the shape only, every amount masked.
 */
export function SpendingTrendCard({ transactions, categories, months }: { transactions: Transaction[]; categories: Category[]; months: MonthKey[] }) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const { khrPerUsd, hideBalances } = usePrefsStore()
  const data = useMemo(() => monthlyTrend(transactions, months, khrPerUsd, adjustmentCategoryIds(categories)), [transactions, months, khrPerUsd, categories])
  const change = spendingChange(data.map((d) => d.expense))
  const monthLabel = (m: MonthKey) => format(monthStart(m), "MMM", { locale: locale === "km" ? km : enUS })
  const empty = data.every((d) => d.expense === 0)
  // Spending going up is the warning direction: an arrow and words, never colour alone.
  const up = change.pct !== null && change.pct > 0

  return (
    <section className="space-y-2">
      <h2 className="px-1 text-[15px] font-semibold">{t("home.spendTitle")}</h2>
      <Card className="gap-3 px-4 py-4">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{t("home.spendThisMonth")}</p>
            <Amount value={change.current} currency="USD" className="block truncate text-2xl font-bold tracking-tight tabular-nums" />
            <p className="text-[13px] text-muted-foreground tabular-nums">
              ≈ <Amount value={change.current * khrPerUsd} currency="KHR" />
            </p>
          </div>
          {change.pct !== null && !hideBalances && (
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-semibold tabular-nums",
                up ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
              )}
            >
              {up ? <TrendingUpIcon className="size-4" aria-hidden /> : <TrendingDownIcon className="size-4" aria-hidden />}
              {t("home.spendVsLast", { pct: `${up ? "+" : ""}${change.pct}` })}
            </span>
          )}
        </div>
        {empty ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("chart.noData")}</p>
        ) : (
          <div className="h-36" role="img" aria-label={t("home.spendTitle")}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 6 }}>
                <defs>
                  <linearGradient id="spend-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--viz-expense)" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="var(--viz-expense)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" tickFormatter={monthLabel} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} interval={0} />
                <Tooltip
                  cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
                  content={({ active, payload, label }) =>
                    active && payload?.length ? (
                      <div className="rounded-xl border bg-popover px-3 py-2 text-[13px] shadow-md">
                        <p className="font-medium">{monthLabel(String(label) as MonthKey)}</p>
                        <p className="text-muted-foreground">
                          {t("tx.EXPENSE")} <span className="font-semibold text-foreground tabular-nums">{formatMoney(Number(payload[0]?.value ?? 0), "USD", { hidden: hideBalances })}</span>
                        </p>
                      </div>
                    ) : null
                  }
                />
                <Area type="monotone" dataKey="expense" stroke="var(--viz-expense)" strokeWidth={2} fill="url(#spend-fill)" dot={{ r: 3, strokeWidth: 2, fill: "var(--card)" }} activeDot={{ r: 5 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    </section>
  )
}
