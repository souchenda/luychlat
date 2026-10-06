"use client"

import { ArrowDownLeftIcon, ArrowUpRightIcon, ChevronRightIcon, FileSpreadsheetIcon, PlusIcon } from "lucide-react"
import Link from "next/link"

import { OutstandingAmount } from "@/components/debts/debt-summary"
import { UrgencyBadge } from "@/components/debts/urgency-badge"
import { Amount } from "@/components/money/amount"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { Debt } from "@/lib/data/types"
import { byUrgency, debtStatus, remaining } from "@/lib/debts"
import { useT } from "@/lib/i18n/use-t"

// Home stays short: the 2 most urgent; the rest are one tap away on /debts.
const PREVIEW = 2

/** Outstanding totals per side and the most urgent open debts. `onAdd` shows a "+ Add debt" action (omitted for read-only viewers). */
export function DebtTrackerWidget({ debts, loading, onAdd }: { debts: Debt[] | undefined; loading?: boolean; onAdd?: () => void }) {
  const t = useT()
  const all = debts ?? []
  const urgent = all.filter((d) => debtStatus(d) !== "SETTLED").sort(byUrgency).slice(0, PREVIEW)

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <FileSpreadsheetIcon className="size-4" aria-hidden />
          {t("debtWidget.title")}
        </h2>
        <div className="flex items-center gap-4">
          {onAdd && (
            <button type="button" onClick={onAdd} className="flex items-center gap-0.5 text-sm text-primary">
              <PlusIcon className="size-4" aria-hidden />
              {t("debts.add")}
            </button>
          )}
          <Link href="/debts" className="flex items-center text-sm text-primary">
            {t("wallets.seeAll")}
            <ChevronRightIcon className="size-4" />
          </Link>
        </div>
      </div>
      {loading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <div className="grid grid-cols-2 divide-x border-b">
            {(["PAYABLE", "RECEIVABLE"] as const).map((type) => (
              <Link key={type} href={`/debts?tab=${type}`} className="px-4 py-3 hover:bg-muted/60">
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  {type === "PAYABLE" ? <ArrowUpRightIcon className="size-3.5 text-rose-600 dark:text-rose-400" aria-hidden /> : <ArrowDownLeftIcon className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />}
                  {t(`debts.${type}`)}
                </p>
                <OutstandingAmount debts={all.filter((d) => d.type === type)} />
              </Link>
            ))}
          </div>
          {urgent.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">{t("debtWidget.empty")}</p>
          ) : (
            <ul className="divide-y">
              {urgent.map((d) => (
                <li key={d.id}>
                  <Link href={`/debts/${d.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/60">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                      {d.type === "PAYABLE" ? (
                        <ArrowUpRightIcon className="size-4 text-rose-600 dark:text-rose-400" aria-hidden />
                      ) : (
                        <ArrowDownLeftIcon className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{d.party_name}</span>
                      <UrgencyBadge debt={d} />
                    </span>
                    <Amount value={remaining(d)} currency={d.currency} className="text-sm font-semibold" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </section>
  )
}
