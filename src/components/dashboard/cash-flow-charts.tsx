"use client"

import { format } from "date-fns"
import { enUS, km } from "date-fns/locale"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { CategoryIcon } from "@/components/categories/category-icon"
import { Card } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { monthlyTrend, topExpenseCategories } from "@/lib/analytics"
import { categoryLabel } from "@/lib/categories/presets"
import type { Category, Transaction } from "@/lib/data/types"
import { monthKey, monthStart, type MonthKey } from "@/lib/dates"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney } from "@/lib/money"
import { useLocaleStore } from "@/stores/locale-store"
import { usePrefsStore } from "@/stores/prefs-store"

// Colours come from validated theme tokens (globals.css --viz-*), stepped per light/dark.
const SERIES = [
  { key: "income", color: "var(--viz-income)", label: "tx.INCOME" },
  { key: "expense", color: "var(--viz-expense)", label: "tx.EXPENSE" },
] as const

const compactUsd = (v: number) =>
  `$${Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v)}`

function TrendChart({ transactions, months }: { transactions: Transaction[]; months: MonthKey[] }) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const { khrPerUsd, hideBalances } = usePrefsStore()
  const data = monthlyTrend(transactions, months, khrPerUsd)
  const current = data[data.length - 1]
  const money = (v: number) => formatMoney(v, "USD", { hidden: hideBalances })
  const monthLabel = (m: MonthKey) => format(monthStart(m), "MMM", { locale: locale === "km" ? km : enUS })

  if (data.every((d) => d.income === 0 && d.expense === 0)) {
    return <p className="py-10 text-center text-sm text-muted-foreground">{t("chart.noData")}</p>
  }

  return (
    <div className="space-y-3">
      {/* Legend with this month's values: identity is never colour alone. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ backgroundColor: s.color }} aria-hidden />
            <span className="text-muted-foreground">{t(s.label)}</span>
            <span className="font-medium tabular-nums">{money(current[s.key])}</span>
          </span>
        ))}
        <span className="ml-auto text-muted-foreground">{t("chart.inUsd")}</span>
      </div>
      <div className="h-44" role="img" aria-label={t("chart.trend")}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={2} barCategoryGap="28%" margin={{ top: 4, right: 0, bottom: 0, left: -12 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="month"
              tickFormatter={monthLabel}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            />
            <YAxis
              tickFormatter={(v: number) => (hideBalances ? "" : compactUsd(v))}
              tickLine={false}
              axisLine={false}
              width={48}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.6 }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
                    <p className="mb-1 font-medium">{monthLabel(String(label))}</p>
                    {SERIES.map((s) => {
                      const value = payload.find((p) => p.dataKey === s.key)?.value
                      return (
                        <p key={s.key} className="flex items-center gap-1.5">
                          <span className="size-2 rounded-sm" style={{ backgroundColor: s.color }} aria-hidden />
                          <span className="text-muted-foreground">{t(s.label)}</span>
                          <span className="ml-auto pl-3 font-medium tabular-nums">{money(Number(value ?? 0))}</span>
                        </p>
                      )
                    })}
                  </div>
                ) : null
              }
            />
            {SERIES.map((s) => (
              <Bar key={s.key} dataKey={s.key} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={16} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function TopSpending({ transactions, categories }: { transactions: Transaction[]; categories: Category[] }) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const { khrPerUsd, hideBalances } = usePrefsStore()
  const thisMonth = monthKey()
  const monthTx = transactions.filter((tx) => monthKey(new Date(tx.transaction_date)) === thisMonth)
  const { rows, other } = topExpenseCategories(monthTx, khrPerUsd)
  const byId = new Map(categories.map((c) => [c.id, c]))
  const items = [
    ...rows.map((r) => {
      const category = r.categoryId ? byId.get(r.categoryId) : undefined
      return {
        key: r.categoryId ?? "none",
        label: category ? categoryLabel(category, locale) : t("entry.uncategorized"),
        category,
        usd: r.usd,
      }
    }),
    ...(other > 0 ? [{ key: "other", label: t("chart.other"), category: undefined, usd: other }] : []),
  ]
  const max = Math.max(...items.map((i) => i.usd), 0)

  if (items.length === 0) return <p className="py-10 text-center text-sm text-muted-foreground">{t("chart.noData")}</p>

  return (
    <ul className="space-y-3" aria-label={t("chart.topSpending")}>
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-3">
          <CategoryIcon category={item.category} className="size-8" />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate">{item.label}</span>
              <span className="font-medium tabular-nums">{formatMoney(item.usd, "USD", { hidden: hideBalances })}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full"
                style={{ width: `${max > 0 ? (item.usd / max) * 100 : 0}%`, backgroundColor: "var(--viz-bar)" }}
              />
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}

/** Income vs expense trend and this month's top spending categories. */
export function CashFlowCharts({
  transactions,
  categories,
  months,
}: {
  transactions: Transaction[]
  categories: Category[]
  months: MonthKey[]
}) {
  const t = useT()
  return (
    <Card className="gap-3 px-4 py-4">
      <Tabs defaultValue="trend">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="trend">{t("chart.trendTab")}</TabsTrigger>
          <TabsTrigger value="top">{t("chart.topTab")}</TabsTrigger>
        </TabsList>
        <TabsContent value="trend" className="pt-3">
          <TrendChart transactions={transactions} months={months} />
        </TabsContent>
        <TabsContent value="top" className="pt-3">
          <TopSpending transactions={transactions} categories={categories} />
        </TabsContent>
      </Tabs>
    </Card>
  )
}
