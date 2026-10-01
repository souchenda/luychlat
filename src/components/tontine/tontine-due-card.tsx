"use client"

import { BellRingIcon, ChevronRightIcon } from "lucide-react"
import Link from "next/link"

import { useTontinePayments, useTontines } from "@/lib/data/hooks"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney } from "@/lib/money"
import { dueTontines } from "@/lib/tontine"

import { DueText } from "./tontine-list"

/** Home reminder: tontine rounds due within 2 days (or overdue). Hidden otherwise. */
export function TontineDueCard({ workspaceId }: { workspaceId: string | undefined }) {
  const t = useT()
  const tontines = useTontines(workspaceId).data ?? []
  const payments = useTontinePayments(workspaceId).data ?? []
  const due = dueTontines(tontines, payments)
  if (due.length === 0) return null

  return (
    <section className="overflow-hidden rounded-xl border border-amber-500/30 bg-amber-500/5">
      <p className="flex items-center gap-2 px-4 pt-3 text-sm font-medium text-amber-800 dark:text-amber-300">
        <BellRingIcon className="size-4" aria-hidden />
        {t("tontine.reminderTitle")}
      </p>
      <div className="divide-y divide-amber-500/15">
        {due.slice(0, 3).map(({ t: x, p }) => (
          <Link key={x.id} href={`/debts/tontine/${x.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-amber-500/10">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{x.name}</span>
              <span className="block text-xs">
                #{p.nextRound} · <DueText p={p} />
              </span>
            </span>
            <span className="text-sm font-semibold tabular-nums">{formatMoney(x.share_amount, x.currency)}</span>
            <ChevronRightIcon className="size-4 text-muted-foreground" aria-hidden />
          </Link>
        ))}
      </div>
    </section>
  )
}
