"use client"

import { ArrowUpNarrowWideIcon, CircleAlertIcon, CircleCheckIcon, InfoIcon, OctagonAlertIcon, PercentIcon, TrophyIcon } from "lucide-react"

import { Card } from "@/components/ui/card"
import type { Insight, Severity } from "@/lib/advisor/engine"
import { scoreFraction } from "@/lib/advisor/credit-score"
import { scoreBand, type SnapshotLabels } from "@/lib/advisor/snapshot"
import type { StrategyComparison } from "@/lib/advisor/strategy"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney } from "@/lib/money"
import { cn } from "@/lib/utils"
import { usePrefsStore } from "@/stores/prefs-store"

// Status colours always come with an icon and the text, never colour alone.
const SEVERITY: Record<Severity, { icon: typeof InfoIcon; className: string }> = {
  good: { icon: CircleCheckIcon, className: "text-emerald-600 dark:text-emerald-400" },
  info: { icon: InfoIcon, className: "text-sky-600 dark:text-sky-400" },
  warn: { icon: CircleAlertIcon, className: "text-amber-600 dark:text-amber-400" },
  critical: { icon: OctagonAlertIcon, className: "text-red-600 dark:text-red-400" },
}

const RING_COLORS = { excellent: "#10b981", good: "#84cc16", fair: "#f59e0b", needs_work: "#ef4444" } as const

/** Compact score badge for the dashboard (300–850). */
export function ScoreRing({ score, className }: { score: number; className?: string }) {
  const color = RING_COLORS[scoreBand(score)]
  const circumference = 2 * Math.PI * 26
  return (
    <div className={cn("relative size-16 shrink-0", className)} role="img" aria-label={`${score}/850`}>
      <svg viewBox="0 0 64 64" className="size-full -rotate-90">
        <circle cx="32" cy="32" r="26" fill="none" stroke="var(--muted)" strokeWidth="7" />
        <circle
          cx="32"
          cy="32"
          r="26"
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - scoreFraction(score))}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums">{score}</span>
    </div>
  )
}

export function InsightList({ insights, limit }: { insights: Insight[]; limit?: number }) {
  return (
    <ul className="space-y-2">
      {insights.slice(0, limit).map((insight) => {
        const { icon: Icon, className } = SEVERITY[insight.severity]
        return (
          <li key={insight.id} className="flex gap-3 rounded-xl border bg-card px-3 py-2.5">
            <Icon className={cn("mt-0.5 size-5 shrink-0", className)} aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-medium">{insight.title}</p>
              <p className="text-xs text-muted-foreground">{insight.body}</p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/** Snowball vs Avalanche side by side; the recommended plan is marked with a label and icon. */
export function StrategyCard({ strategy, labels }: { strategy: StrategyComparison; labels: SnapshotLabels }) {
  const t = useT()
  const hidden = usePrefsStore((s) => s.hideBalances)
  const money = (n: number) => formatMoney(n, "USD", { hidden })
  const name = (ref: string) => labels.debts[ref] ?? ref

  return (
    <Card className="gap-3 px-4 py-4">
      <div>
        <p className="font-semibold">{t("advisor.strategyTitle")}</p>
        <p className="text-xs text-muted-foreground">
          {t(strategy.budgetAssumed ? "advisor.budgetAssumed" : "advisor.budgetSurplus", { amount: money(strategy.monthlyBudget) })}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(["snowball", "avalanche"] as const).map((key) => {
          const plan = strategy[key]
          const recommended = strategy.recommended === key
          return (
            <div key={key} className={cn("space-y-1.5 rounded-xl border p-3", recommended && "border-primary bg-primary/5")}>
              <p className="flex items-center gap-1 text-sm font-semibold">
                {key === "snowball" ? (
                  <ArrowUpNarrowWideIcon className="size-4 text-sky-600 dark:text-sky-400" aria-hidden />
                ) : (
                  <PercentIcon className="size-4 text-violet-600 dark:text-violet-400" aria-hidden />
                )}
                {key === "snowball" ? "Snowball" : "Avalanche"}
              </p>
              <p className="text-[11px] text-muted-foreground">{t(`advisor.${key}Desc`)}</p>
              {recommended && (
                <p className="flex items-center gap-1 text-[11px] font-medium text-primary">
                  <TrophyIcon className="size-3" />
                  {t("advisor.recommended")}
                </p>
              )}
              <p className="text-xs">
                {plan.incomplete ? t("advisor.tooLong") : t("advisor.months", { count: plan.months })}
              </p>
              <p className="text-xs">{t("advisor.interest", { amount: money(plan.totalInterest) })}</p>
              <ol className="list-decimal pl-4 text-[11px] text-muted-foreground">
                {plan.order.map((ref) => (
                  <li key={ref} className="truncate">
                    {name(ref)}
                  </li>
                ))}
              </ol>
            </div>
          )
        })}
      </div>
      {strategy.interestSaved > 0 && (
        <p className="text-xs text-muted-foreground">{t("advisor.interestSaved", { amount: money(strategy.interestSaved) })}</p>
      )}
    </Card>
  )
}
