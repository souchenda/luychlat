"use client"

import { ChevronRightIcon } from "lucide-react"
import Link from "next/link"

import { OutstandingAmount } from "@/components/debts/debt-summary"
import { UrgencyBadge } from "@/components/debts/urgency-badge"
import { Amount } from "@/components/money/amount"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { Debt } from "@/lib/data/types"
import { byUrgency, debtStatus, remaining } from "@/lib/debts"
import { useT } from "@/lib/i18n/use-t"

const PREVIEW = 3

/** Outstanding totals per side and the most urgent open debts. */
export function DebtTrackerWidget({ debts, loading }: { debts: Debt[] | undefined; loading?: boolean }) {
  const t = useT()
  const all = debts ?? []
  const urgent = all.filter((d) => debtStatus(d) !== "SETTLED").sort(byUrgency).slice(0, PREVIEW)

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-medium text-muted-foreground">📋 {t("debtWidget.title")}</h2>
        <Link href="/debts" className="flex items-center text-sm text-primary">
          {t("wallets.seeAll")}
          <ChevronRightIcon className="size-4" />
        </Link>
      </div>
      {loading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <div className="grid grid-cols-2 divide-x border-b">
            {(["PAYABLE", "RECEIVABLE"] as const).map((type) => (
              <Link key={type} href={`/debts?tab=${type}`} className="px-4 py-3 hover:bg-muted/60">
                <p className="text-xs text-muted-foreground">
                  {type === "PAYABLE" ? "📤" : "📥"} {t(`debts.${type}`)}
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
                    <span aria-hidden>{d.type === "PAYABLE" ? "📤" : "📥"}</span>
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
