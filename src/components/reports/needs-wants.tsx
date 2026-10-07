"use client"

import { Amount } from "@/components/money/amount"
import { Card } from "@/components/ui/card"
import type { Currency } from "@/lib/data/types"
import { useT } from "@/lib/i18n/use-t"
import { inCurrency, percentOf, type SpendingSplit } from "@/lib/reports/summary"
import { cn } from "@/lib/utils"

const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const

/** Needs vs Wants for the period (one stacked bar + rows), then food by meal when there is food. */
export function NeedsWants({ split, currency, khrPerUsd }: { split: SpendingSplit; currency: Currency; khrPerUsd: number }) {
  const t = useT()
  const v = (n: SpendingSplit["need"]) => inCurrency(n, currency, khrPerUsd)
  const rows = [
    { key: "need", label: t("nw.NEED"), value: v(split.need), bar: "bg-emerald-500", dot: "bg-emerald-500" },
    { key: "want", label: t("nw.WANT"), value: v(split.want), bar: "bg-amber-400", dot: "bg-amber-400" },
    { key: "unset", label: t("nw.none"), value: v(split.unset), bar: "bg-muted-foreground/25", dot: "bg-muted-foreground/40" },
  ]
  const total = rows.reduce((a, r) => a + r.value, 0)
  if (total <= 0) return null
  const tagged = rows[0].value + rows[1].value > 0
  const meals = MEALS.map((m) => ({ key: m, value: v(split.meals[m]) })).filter((m) => m.value > 0)
  const foodTotal = MEALS.reduce((a, m) => a + v(split.meals[m]), 0) + v(split.meals.none)

  return (
    <section className="space-y-2 print:hidden">
      <h2 className="px-1 text-sm font-medium text-muted-foreground">{t("nw.title")}</h2>
      <Card className="gap-3 px-4 py-4">
        {/* One bar, three parts; 2px gaps keep the parts apart. */}
        <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" aria-hidden>
          {rows
            .filter((r) => r.value > 0)
            .map((r) => (
              <span key={r.key} className={cn("h-full first:rounded-l-full last:rounded-r-full transition-[flex-grow] duration-500", r.bar)} style={{ flexGrow: r.value }} />
            ))}
        </div>
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.key} className={cn("flex items-center gap-2 text-sm", r.value === 0 && "text-muted-foreground")}>
              <span className={cn("size-2.5 shrink-0 rounded-full", r.dot)} aria-hidden />
              <span className="flex-1">{r.label}</span>
              <Amount value={r.value} currency={currency} className="font-semibold" />
              <span className="w-12 text-right text-xs text-muted-foreground tabular-nums">{percentOf(r.value, total)}%</span>
            </li>
          ))}
        </ul>
        {!tagged && <p className="text-xs leading-relaxed text-muted-foreground">{t("nw.hint")}</p>}

        {split.hasFood && meals.length > 0 && (
          <div className="space-y-2 border-t pt-3">
            <p className="text-xs font-medium text-muted-foreground">{t("nw.mealsTitle")}</p>
            {meals.map((m) => {
              const share = percentOf(m.value, foodTotal)
              return (
                <div key={m.key} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span>{t(`meal.${m.key}`)}</span>
                    <span className="flex items-baseline gap-2">
                      <Amount value={m.value} currency={currency} className="font-medium" />
                      <span className="w-12 text-right text-xs text-muted-foreground tabular-nums">{share}%</span>
                    </span>
                  </div>
                  <span className="block h-1.5 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full rounded-full bg-emerald-500/70" style={{ width: `${Math.min(100, share)}%` }} />
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </section>
  )
}
