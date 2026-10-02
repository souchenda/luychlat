"use client"

import { ChevronRightIcon, TargetIcon } from "lucide-react"
import Link from "next/link"
import { useMemo } from "react"

import { Card } from "@/components/ui/card"
import { summarizeBudgets } from "@/lib/budgets"
import { useBudgets } from "@/lib/data/hooks"
import type { Category, Currency, Transaction } from "@/lib/data/types"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney } from "@/lib/money"
import { cn } from "@/lib/utils"
import { usePrefsStore } from "@/stores/prefs-store"

import { BUDGET_STATUS, BudgetRow, BudgetStatusChip } from "./budget-widgets"

/** Dashboard: this month's overall budget use and the two categories closest to their cap. */
export function BudgetHomeCard({
  workspaceId,
  currency,
  categories,
  monthTransactions,
}: {
  workspaceId: string | undefined
  currency: Currency
  categories: Category[]
  /** This month's transactions. */
  monthTransactions: Transaction[]
}) {
  const t = useT()
  const { khrPerUsd, hideBalances } = usePrefsStore()
  const budgets = useBudgets(workspaceId)
  const summary = useMemo(
    () => summarizeBudgets({ budgets: budgets.data ?? [], categories, transactions: monthTransactions, khrPerUsd, currency }),
    [budgets.data, categories, monthTransactions, khrPerUsd, currency],
  )
  if (budgets.isLoading) return null

  // No budget yet: show nothing (Home stays data-only; the "Budget" link above opens the planner).
  if (!summary.lines.length) return null

  const { status, ratio } = summary
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <TargetIcon className="size-4" aria-hidden />
          {t("budget.title")}
        </h2>
        <Link href="/budgets" className="flex items-center text-sm text-primary">
          {t("wallets.seeAll")}
          <ChevronRightIcon className="size-4" />
        </Link>
      </div>
      <Card className="gap-0 divide-y overflow-hidden py-0">
        <div className="space-y-2 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm">
              <span className={cn("font-semibold tabular-nums", BUDGET_STATUS[status].text)}>{Math.round(ratio * 100)}%</span>{" "}
              <span className="text-muted-foreground tabular-nums">
                · {formatMoney(summary.actual, currency, { hidden: hideBalances })} / {formatMoney(summary.planned, currency, { hidden: hideBalances })}
              </span>
            </p>
            <BudgetStatusChip status={status} />
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full rounded-full transition-[width] duration-500", BUDGET_STATUS[status].bar)} style={{ width: `${Math.min(ratio, 1) * 100}%` }} />
          </div>
        </div>
        {summary.lines.slice(0, 2).map((line) => (
          <BudgetRow key={line.budget.id} line={line} />
        ))}
      </Card>
    </section>
  )
}
