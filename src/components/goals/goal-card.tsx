"use client"

import { format, parseISO } from "date-fns"
import { ArrowDownToLineIcon, ArrowUpFromLineIcon, PartyPopperIcon } from "lucide-react"

import { Amount } from "@/components/money/amount"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import type { Wallet } from "@/lib/data/types"
import { goalEmoji, goalProgress } from "@/lib/goals"
import { useT } from "@/lib/i18n/use-t"
import { cn } from "@/lib/utils"

/** One savings goal: progress bar, saved / target, what's left, and deposit / withdraw. */
export function GoalCard({
  goal,
  onEdit,
  onDeposit,
  onWithdraw,
  compact,
}: {
  goal: Wallet
  onEdit?: () => void
  onDeposit?: () => void
  onWithdraw?: () => void
  compact?: boolean
}) {
  const t = useT()
  const p = goalProgress(goal)
  // A button only when it opens the editor (on Home the whole card is a link).
  const header = (
    <>
      <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-2xl" aria-hidden>
        {goalEmoji(goal.icon)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{goal.name}</span>
        <span className="block text-xs text-muted-foreground">
          {goal.goal_date ? t("goals.by", { date: format(parseISO(goal.goal_date), "dd/MM/yyyy") }) : t("goals.noDate")}
        </span>
      </span>
      <span className={cn("shrink-0 text-lg font-bold tabular-nums", p.reached ? "text-emerald-600 dark:text-emerald-400" : "text-primary")}>
        {p.percent}%
      </span>
    </>
  )
  const headerClass = "flex w-full items-start gap-3 text-left"

  return (
    <Card className={cn("gap-3 px-4 py-4", goal.archived_at && "opacity-60")}>
      {onEdit ? (
        <button type="button" onClick={onEdit} className={headerClass}>
          {header}
        </button>
      ) : (
        <div className={headerClass}>{header}</div>
      )}

      <div
        className="h-3 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={p.percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={goal.name}
      >
        <div className="h-full rounded-full bg-linear-to-r from-emerald-500 to-teal-500 transition-[width] duration-500" style={{ width: `${p.percent}%` }} />
      </div>

      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span>
          <Amount value={p.saved} currency={goal.currency} className="font-semibold" />
          <span className="text-muted-foreground"> / </span>
          <Amount value={p.target} currency={goal.currency} className="text-muted-foreground" />
        </span>
        {p.reached ? (
          <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            <PartyPopperIcon className="size-4" aria-hidden />
            {t("goals.reached")}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            {t("goals.left")} <Amount value={p.remaining} currency={goal.currency} className="font-medium text-foreground" />
          </span>
        )}
      </div>
      {!compact && p.perMonth !== null && (
        <p className="text-xs text-muted-foreground">
          {t("goals.perMonth")} <Amount value={p.perMonth} currency={goal.currency} className="font-medium text-foreground" />
        </p>
      )}

      {!compact && (onDeposit || onWithdraw) && !goal.archived_at && (
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" onClick={onDeposit} disabled={!onDeposit}>
            <ArrowDownToLineIcon />
            {t("goals.deposit")}
          </Button>
          <Button type="button" variant="outline" onClick={onWithdraw} disabled={!onWithdraw || p.saved <= 0}>
            <ArrowUpFromLineIcon />
            {t("goals.withdraw")}
          </Button>
        </div>
      )}
    </Card>
  )
}
