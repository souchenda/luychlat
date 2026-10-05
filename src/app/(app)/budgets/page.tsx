"use client"

import { PlanningTabs } from "@/components/layout/planning-tabs"
import { addMonths, format } from "date-fns"
import { enUS, km } from "date-fns/locale"
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, TargetIcon } from "lucide-react"
import { useMemo, useState } from "react"

import { BudgetSheet } from "@/components/budgets/budget-sheet"
import { BudgetGauge, BudgetRow, BudgetStatusChip } from "@/components/budgets/budget-widgets"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { summarizeBudgets } from "@/lib/budgets"
import { NON_OPERATING_KEYS } from "@/lib/categories/presets"
import { canWrite, useActiveWorkspace, useBudgets, useCategories, useTransactions } from "@/lib/data/hooks"
import type { Budget, Currency } from "@/lib/data/types"
import { monthKey, monthRange, monthStart } from "@/lib/dates"
import { useT } from "@/lib/i18n/use-t"
import { convert, formatMoney } from "@/lib/money"
import { useLocaleStore } from "@/stores/locale-store"
import { usePrefsStore } from "@/stores/prefs-store"

export default function BudgetsPage() {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const { khrPerUsd, hideBalances } = usePrefsStore()
  const { workspace } = useActiveWorkspace()
  const ws = workspace?.id
  const editable = canWrite(workspace)
  const currency: Currency = workspace?.currency_default ?? "USD"

  const [month, setMonth] = useState(() => monthKey())
  const isCurrent = month === monthKey()
  const range = useMemo(() => monthRange(month), [month])
  // The three months before the one shown, for "you usually spend" hints.
  const history = useMemo(
    () => ({ from: addMonths(monthStart(month), -3).toISOString(), to: monthStart(month).toISOString(), type: "EXPENSE" as const }),
    [month],
  )

  const budgets = useBudgets(ws)
  const categoriesQuery = useCategories(ws)
  const transactions = useTransactions(ws, range)
  const past = useTransactions(ws, history)
  const [sheet, setSheet] = useState<{ open: boolean; budget: Budget | null }>({ open: false, budget: null })

  const expenseCategories = useMemo(
    () => (categoriesQuery.data ?? []).filter((c) => c.type === "EXPENSE" && !(c.preset_key && NON_OPERATING_KEYS.has(c.preset_key))),
    [categoriesQuery.data],
  )
  const summary = useMemo(
    () =>
      summarizeBudgets({
        budgets: budgets.data ?? [],
        categories: categoriesQuery.data ?? [],
        transactions: transactions.data ?? [],
        khrPerUsd,
        currency,
      }),
    [budgets.data, categoriesQuery.data, transactions.data, khrPerUsd, currency],
  )
  const averages = useMemo(() => {
    const totals = new Map<string, number>()
    for (const tx of past.data ?? []) {
      if (!tx.category_id) continue
      totals.set(tx.category_id, (totals.get(tx.category_id) ?? 0) + convert(tx.amount, tx.currency, currency, khrPerUsd))
    }
    const step = currency === "USD" ? 1 : 1000
    return new Map(
      [...totals.entries()].map(([id, total]) => [id, { amount: Math.ceil(total / 3 / step) * step, currency }] as const),
    )
  }, [past.data, currency, khrPerUsd])

  const budgeted = new Set((budgets.data ?? []).map((b) => b.category_id))
  const available = expenseCategories.filter((c) => !budgeted.has(c.id))
  const loading = budgets.isLoading || categoriesQuery.isLoading || transactions.isLoading
  const dateLocale = locale === "km" ? km : enUS
  const money = (n: number) => formatMoney(n, currency, { hidden: hideBalances })

  return (
    <div className="space-y-4">
      <PlanningTabs active="budgets" />
      <div className="flex items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <TargetIcon className="size-5 text-primary" aria-hidden />
          {t("budget.title")}
        </h1>
        {editable && available.length > 0 && (
          <Button size="sm" onClick={() => setSheet({ open: true, budget: null })}>
            <PlusIcon />
            {t("budget.add")}
          </Button>
        )}
      </div>

      <div className="flex items-center justify-between rounded-full bg-muted p-1">
        <Button size="icon" variant="ghost" className="size-8 rounded-full" onClick={() => setMonth(monthKey(addMonths(monthStart(month), -1)))} aria-label={t("budget.prevMonth")}>
          <ChevronLeftIcon className="size-4" />
        </Button>
        <span className="text-sm font-medium">
          {format(monthStart(month), "MMMM yyyy", { locale: dateLocale })}
          {isCurrent && <span className="text-muted-foreground"> · {t("budget.thisMonth")}</span>}
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="size-8 rounded-full"
          disabled={isCurrent}
          onClick={() => setMonth(monthKey(addMonths(monthStart(month), 1)))}
          aria-label={t("budget.nextMonth")}
        >
          <ChevronRightIcon className="size-4" />
        </Button>
      </div>

      {loading ? (
        <Skeleton className="h-72 w-full rounded-xl" />
      ) : summary.lines.length === 0 ? (
        <Card className="items-center gap-3 px-6 py-10 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <TargetIcon className="size-7" aria-hidden />
          </span>
          <p className="font-semibold">{t("budget.emptyTitle")}</p>
          <p className="text-sm text-muted-foreground">{t("budget.emptyHint")}</p>
          {editable && (
            <Button onClick={() => setSheet({ open: true, budget: null })}>
              <PlusIcon />
              {t("budget.add")}
            </Button>
          )}
        </Card>
      ) : (
        <>
          <Card className="gap-3 px-4 py-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{t("budget.overall")}</p>
              <BudgetStatusChip status={summary.status} />
            </div>
            <BudgetGauge summary={summary} />
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-muted/60 p-2">
                <p className="text-[11px] text-muted-foreground">{t("budget.planned")}</p>
                <p className="text-sm font-semibold tabular-nums">{money(summary.planned)}</p>
              </div>
              <div className="rounded-lg bg-muted/60 p-2">
                <p className="text-[11px] text-muted-foreground">{t("budget.actual")}</p>
                <p className="text-sm font-semibold tabular-nums">{money(summary.actual)}</p>
              </div>
              <div className="rounded-lg bg-muted/60 p-2">
                <p className="text-[11px] text-muted-foreground">{t("budget.remaining")}</p>
                <p className="text-sm font-semibold tabular-nums">{money(Math.max(0, summary.planned - summary.actual))}</p>
              </div>
            </div>
            {summary.unbudgeted > 0 && (
              <p className="text-center text-xs text-muted-foreground">{t("budget.unbudgeted", { amount: money(summary.unbudgeted) })}</p>
            )}
          </Card>

          <section className="space-y-2">
            <h2 className="px-1 text-sm font-medium text-muted-foreground">{t("budget.byCategory")}</h2>
            <Card className="gap-0 divide-y overflow-hidden py-0">
              {summary.lines.map((line) => (
                <BudgetRow
                  key={line.budget.id}
                  line={line}
                  onClick={editable ? () => setSheet({ open: true, budget: line.budget }) : undefined}
                />
              ))}
            </Card>
            <p className="px-1 text-xs text-muted-foreground">{t("budget.legend")}</p>
          </section>
        </>
      )}

      <BudgetSheet
        open={sheet.open}
        onOpenChange={(open) => setSheet((s) => ({ ...s, open }))}
        workspaceId={ws}
        categories={sheet.budget ? expenseCategories : available}
        budget={sheet.budget}
        defaultCurrency={currency}
        averages={averages}
      />
    </div>
  )
}
