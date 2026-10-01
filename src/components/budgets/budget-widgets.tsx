"use client"

import { CircleCheckIcon, OctagonAlertIcon, TriangleAlertIcon } from "lucide-react"

import { CategoryIcon } from "@/components/categories/category-icon"
import { categoryLabel } from "@/lib/categories/presets"
import type { BudgetLine, BudgetStatus, BudgetSummary } from "@/lib/budgets"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney } from "@/lib/money"
import { cn } from "@/lib/utils"
import { useLocaleStore } from "@/stores/locale-store"
import { usePrefsStore } from "@/stores/prefs-store"

// Status colours always come with an icon and a text label, never colour alone.
export const BUDGET_STATUS: Record<
  BudgetStatus,
  { icon: typeof CircleCheckIcon; text: string; bar: string; stroke: string; chip: string }
> = {
  safe: {
    icon: CircleCheckIcon,
    text: "text-emerald-700 dark:text-emerald-400",
    bar: "bg-emerald-500",
    stroke: "#10b981",
    chip: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
  },
  near: {
    icon: TriangleAlertIcon,
    text: "text-amber-700 dark:text-amber-400",
    bar: "bg-amber-500",
    stroke: "#f59e0b",
    chip: "bg-amber-500/15 text-amber-800 dark:text-amber-400",
  },
  over: {
    icon: OctagonAlertIcon,
    text: "text-red-700 dark:text-red-400",
    bar: "bg-red-500",
    stroke: "#ef4444",
    chip: "bg-red-500/12 text-red-700 dark:text-red-400",
  },
}

export function BudgetStatusChip({ status, className }: { status: BudgetStatus; className?: string }) {
  const t = useT()
  const { icon: Icon, chip } = BUDGET_STATUS[status]
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", chip, className)}>
      <Icon className="size-3" aria-hidden />
      {t(`budget.status.${status}`)}
    </span>
  )
}

/** Half-circle gauge: total spent against total planned for the month. */
export function BudgetGauge({ summary, className }: { summary: BudgetSummary; className?: string }) {
  const t = useT()
  const hidden = usePrefsStore((s) => s.hideBalances)
  const { ratio, status, planned, actual, currency } = summary
  const r = 80
  const length = Math.PI * r
  const filled = Math.min(ratio, 1) * length
  const tick = (fraction: number) => {
    const angle = Math.PI * (1 - fraction)
    return { x1: 100 + (r - 12) * Math.cos(angle), y1: 100 - (r - 12) * Math.sin(angle), x2: 100 + (r + 12) * Math.cos(angle), y2: 100 - (r + 12) * Math.sin(angle) }
  }
  return (
    <div className={cn("relative mx-auto w-full max-w-[260px]", className)}>
      <svg viewBox="0 0 200 112" className="w-full" role="img" aria-label={t("budget.gaugeLabel", { percent: Math.round(ratio * 100) })}>
        <path d={`M ${100 - r} 100 A ${r} ${r} 0 0 1 ${100 + r} 100`} fill="none" stroke="var(--muted)" strokeWidth="16" strokeLinecap="round" />
        <path
          d={`M ${100 - r} 100 A ${r} ${r} 0 0 1 ${100 + r} 100`}
          fill="none"
          stroke={BUDGET_STATUS[status].stroke}
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${length}`}
          className="transition-[stroke-dasharray] duration-700 ease-out"
        />
        {/* 70% marks where "almost at the limit" begins. */}
        <line {...tick(0.7)} stroke="var(--background)" strokeWidth="2.5" />
      </svg>
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
        <span className={cn("text-3xl font-bold tabular-nums", BUDGET_STATUS[status].text)}>{Math.round(ratio * 100)}%</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatMoney(actual, currency, { hidden })} / {formatMoney(planned, currency, { hidden })}
        </span>
      </div>
    </div>
  )
}

/** One category: icon, name, status, progress bar and what is left. */
export function BudgetRow({ line, onClick }: { line: BudgetLine; onClick?: () => void }) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const hidden = usePrefsStore((s) => s.hideBalances)
  const { budget, category, spent, ratio, status, left } = line
  const money = (n: number) => formatMoney(n, budget.currency, { hidden })
  const Wrapper = onClick ? "button" : "div"
  return (
    <Wrapper
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={cn("block w-full space-y-2 px-4 py-3 text-left", onClick && "transition-colors hover:bg-muted/60")}
    >
      <div className="flex items-center gap-3">
        <CategoryIcon category={category} className="size-9" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{category ? categoryLabel(category, locale) : t("entry.uncategorized")}</p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {money(spent)} / {money(budget.amount)}
          </p>
        </div>
        <BudgetStatusChip status={status} />
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(Math.min(ratio, 1) * 100)}
        aria-label={category ? categoryLabel(category, locale) : undefined}
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-500", BUDGET_STATUS[status].bar)}
          style={{ width: `${Math.min(ratio, 1) * 100}%` }}
        />
      </div>
      <p className={cn("text-xs", left < 0 ? BUDGET_STATUS.over.text : "text-muted-foreground")}>
        {left < 0 ? t("budget.overBy", { amount: money(-left) }) : t("budget.left", { amount: money(left), percent: Math.round(ratio * 100) })}
      </p>
    </Wrapper>
  )
}
