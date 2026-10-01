"use client"

import { Amount } from "@/components/money/amount"
import type { Debt } from "@/lib/data/types"
import { progressPercent, remaining } from "@/lib/debts"
import { useT } from "@/lib/i18n/use-t"
import { cn } from "@/lib/utils"

/** "60% paid · $200 left" with a bar. */
export function DebtProgress({ debt, className }: { debt: Debt; className?: string }) {
  const t = useT()
  const percent = progressPercent(debt)
  return (
    <div className={cn("space-y-1.5", className)}>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={t("debts.paidPercent", { percent })}
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-500", percent >= 100 ? "bg-emerald-500" : "bg-primary")}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{t("debts.paidPercent", { percent })}</span>
        <span>
          <RemainingLabel debt={debt} />
        </span>
      </div>
    </div>
  )
}

function RemainingLabel({ debt }: { debt: Debt }) {
  const t = useT()
  // Split the translated template around {amount} so the amount can respect the privacy toggle.
  const [before, after] = t("debts.remaining", { amount: "\u0000" }).split("\u0000")
  return (
    <>
      {before}
      <Amount value={remaining(debt)} currency={debt.currency} className="font-medium text-foreground" />
      {after}
    </>
  )
}
