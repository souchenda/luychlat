"use client"

import { TrendingDownIcon, TrendingUpIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { Segmented } from "@/components/common/segmented"
import { Amount } from "@/components/money/amount"
import { Card } from "@/components/ui/card"
import { adjustmentCategoryIds } from "@/lib/categories/presets"
import type { Category, Transaction } from "@/lib/data/types"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney } from "@/lib/money"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { pulseTheme, rielTick, spendingPulse, type PulseKind, type PulsePeriod } from "@/lib/spending-pulse"
import { cn } from "@/lib/utils"
import { useLocaleStore } from "@/stores/locale-store"
import { usePrefsStore } from "@/stores/prefs-store"

const PERIOD_KEY = "luychlat:home-pulse-period"
const KIND_KEY = "luychlat:home-pulse-kind"

/**
 * Home «spending pulse» (founder, 17/10/2026): spending per day (the last 7 days, Khmer weekdays), per week
 * or per month — a one-tap switch (2–3 fixed choices are a segmented pill, never a dropdown), the total of
 * the span in riel with ≈ dollars, and the change from the span before (an arrow and words, never colour
 * alone). One series in the validated --viz-expense token; dotted riel guides («១០ ម៉ឺន»). Balances hidden →
 * the shape only: no guide values, every amount masked.
 * One tap between spending and income (founder, 21/10/2026 — Task #446): the title, the total line, the series colour
 * (--viz-expense coral ⇄ --viz-income emerald) and the change pill's meaning follow it (lib/spending-pulse › pulseTheme);
 * the day / week / month tabs work for both. Remembered on this device, like the period.
 */
export function SpendingTrendCard({ transactions, categories }: { transactions: Transaction[]; categories: Category[] }) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const { khrPerUsd, hideBalances } = usePrefsStore()
  const [period, setPeriodState] = useState<PulsePeriod>(() => {
    try {
      const saved = typeof window === "undefined" ? null : localStorage.getItem(PERIOD_KEY)
      return saved === "week" || saved === "month" ? saved : "day"
    } catch {
      return "day"
    }
  })
  const setPeriod = (p: PulsePeriod) => {
    setPeriodState(p)
    try {
      localStorage.setItem(PERIOD_KEY, p)
    } catch {}
  }
  const [kind, setKindState] = useState<PulseKind>(() => {
    try {
      return typeof window !== "undefined" && localStorage.getItem(KIND_KEY) === "INCOME" ? "INCOME" : "EXPENSE"
    } catch {
      return "EXPENSE"
    }
  })
  const setKind = (k: PulseKind) => {
    setKindState(k)
    try {
      localStorage.setItem(KIND_KEY, k)
    } catch {}
  }
  const theme = pulseTheme(kind)
  const pulse = useMemo(
    () => spendingPulse(transactions, period, { khrPerUsd, exclude: adjustmentCategoryIds(categories), locale, kind }),
    [transactions, period, khrPerUsd, categories, locale, kind],
  )
  const up = pulse.pct !== null && pulse.pct > 0
  // Green when the change is good news (less spending, more income), rose when it is not.
  const good = up === theme.riseIsGood
  const empty = pulse.points.every((p) => p.khr === 0)

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3 px-1">
        <h2 className="text-[15px] font-semibold">{t(theme.title as MessageKey)}</h2>
        <Segmented
          aria-label={t("home.pulseKind")}
          value={kind}
          onChange={setKind}
          className="w-44 shrink-0"
          options={[
            { value: "EXPENSE", label: t("tx.EXPENSE") },
            { value: "INCOME", label: t("tx.INCOME") },
          ]}
        />
      </div>
      <Card className="gap-3 px-4 py-4">
        <Segmented
          aria-label={t("home.pulseTitle")}
          value={period}
          onChange={setPeriod}
          options={[
            { value: "day", label: t("home.pulseDay") },
            { value: "week", label: t("home.pulseWeek") },
            { value: "month", label: t("home.pulseMonth") },
          ]}
        />
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{t(`${theme.total}.${period}` as MessageKey)}</p>
            <Amount value={pulse.total} currency="KHR" className="block truncate text-2xl font-bold tracking-tight tabular-nums" />
            <p className="text-[13px] text-muted-foreground tabular-nums">
              ≈ <Amount value={pulse.total / khrPerUsd} currency="USD" />
            </p>
          </div>
          {pulse.pct !== null && !hideBalances && (
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-semibold tabular-nums",
                good ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
              )}
            >
              {up ? <TrendingUpIcon className="size-4" aria-hidden /> : <TrendingDownIcon className="size-4" aria-hidden />}
              {t(`home.pulseVs.${period}`, { pct: `${up ? "+" : ""}${pulse.pct}` })}
            </span>
          )}
        </div>
        {empty ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("chart.noData")}</p>
        ) : (
          <div className="h-44" role="img" aria-label={t(theme.title as MessageKey)}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={pulse.points} margin={{ top: 20, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id={theme.fill} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={theme.color} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={theme.color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                {/* Dotted guides: recessive, behind the line. */}
                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
                {/* The guide values sit inside the plot, over their dotted lines (mirror): the full width stays for the
                    seven Khmer weekday names. */}
                <YAxis
                  mirror
                  width={1}
                  tickLine={false}
                  axisLine={false}
                  tickCount={4}
                  // Drawn by hand: one line each, just above its dotted guide (the library would wrap it in a 1 px axis).
                  tick={(props: { x?: number | string; y?: number | string; payload?: { value?: number | string } }) => {
                    const value = Number(props.payload?.value ?? 0)
                    return hideBalances || value === 0 ? (
                      <g />
                    ) : (
                      <text x={Number(props.x ?? 0) + 2} y={Number(props.y ?? 0) - 5} fontSize={12} fill="var(--muted-foreground)" textAnchor="start">
                        {rielTick(value, locale)}
                      </text>
                    )
                  }}
                />
                <XAxis dataKey="label" tickLine={false} axisLine={false} interval={0} padding={{ left: 20, right: 20 }} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
                <Tooltip
                  cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
                  content={({ active, payload, label }) =>
                    active && payload?.length ? (
                      <div className="rounded-xl border bg-popover px-3 py-2 text-[13px] shadow-md">
                        <p className="font-medium">{String(label)}</p>
                        <p className="text-muted-foreground">
                          {t(theme.tooltip as MessageKey)}{" "}
                          <span className="font-semibold text-foreground tabular-nums">{formatMoney(Number(payload[0]?.value ?? 0), "KHR", { hidden: hideBalances })}</span>
                        </p>
                      </div>
                    ) : null
                  }
                />
                <Area type="monotone" dataKey="khr" isAnimationActive={false} stroke={theme.color} strokeWidth={2} fill={`url(#${theme.fill})`} dot={{ r: 3, strokeWidth: 2, fill: "var(--card)" }} activeDot={{ r: 5 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    </section>
  )
}
