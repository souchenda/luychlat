"use client"

import { LandmarkIcon } from "lucide-react"
import Link from "next/link"

import { Card } from "@/components/ui/card"
import { daysUntil, nextDue, useBills } from "@/lib/bills"
import { dayDate } from "@/lib/dates"
import { useT } from "@/lib/i18n/use-t"
import { isVehicleLoan } from "@/lib/loans/loan-detail-read"
import { formatMoney } from "@/lib/money"
import { useLocaleStore } from "@/stores/locale-store"
import { usePrefsStore } from "@/stores/prefs-store"

/** /car: the car / motorbike loans' next installments (their LOAN reminders; nothing when none). */
export function CarLoansCard({ workspaceId }: { workspaceId: string }) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const hidden = usePrefsStore((s) => s.hideBalances)
  const loans = (useBills(workspaceId).data ?? []).filter((b) => b.kind === "LOAN" && b.is_active && isVehicleLoan(b.title))
  if (!loans.length) return null
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-1.5 px-1 text-sm font-medium text-muted-foreground">
        <LandmarkIcon className="size-4" aria-hidden />
        {t("vdoc.carLoans")}
      </h2>
      <Card className="gap-0 divide-y py-0">
        {loans.map((b) => {
          const due = nextDue(b)
          const left = daysUntil(due)
          return (
            <Link key={b.id} href={b.debt_id ? `/debts/${b.debt_id}` : "/bills"} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{b.title}</p>
                <p className={`text-xs ${left < 0 ? "text-rose-600 dark:text-rose-400" : left <= 3 ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}>
                  {t("vdoc.nextInstallment", { date: dayDate(new Date(`${due}T12:00:00`), locale) })}
                  {left >= 0 && left <= 7 ? ` · ${left === 0 ? t("vdoc.today") : t("vdoc.daysLeft", { n: left })}` : left < 0 ? ` · ${t("vdoc.daysAgo", { n: -left })}` : ""}
                </p>
              </div>
              <p className="shrink-0 font-semibold tabular-nums">{formatMoney(b.amount, b.currency, { hidden })}</p>
            </Link>
          )
        })}
      </Card>
    </section>
  )
}
