"use client"

import { useLocaleStore } from "@/stores/locale-store"
import { formatOverdue } from "@/lib/format"
import { ChevronRightIcon, ReceiptIcon } from "lucide-react"
import Link from "next/link"

import { Card } from "@/components/ui/card"
import { BILL_EMOJI, daysUntil, nextDue, useBills } from "@/lib/bills"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney } from "@/lib/money"
import { cn } from "@/lib/utils"
import { usePrefsStore } from "@/stores/prefs-store"

/** Home: bills due within a week (or overdue), opening /bills. Hidden when there are none. */
export function BillsWidget({ workspaceId }: { workspaceId: string | undefined }) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const hidden = usePrefsStore((s) => s.hideBalances)
  const soon = (useBills(workspaceId).data ?? [])
    .filter((b) => b.is_active)
    .map((b) => ({ bill: b, due: nextDue(b), left: daysUntil(nextDue(b)) }))
    .filter((r) => r.left <= 7)
    .sort((a, b) => a.left - b.left)
    .slice(0, 3)
  if (!soon.length) return null
  return (
    <section className="space-y-2">
      <Link href="/bills" className="flex items-center justify-between gap-2 px-1">
        <h2 className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <ReceiptIcon className="size-4" aria-hidden />
          {t("bills.soonTitle")}
        </h2>
        <span className="flex items-center gap-1 text-sm text-primary">
          {t("bills.all")}
          <ChevronRightIcon className="size-4" />
        </span>
      </Link>
      <Card className="gap-0 divide-y py-0">
        {soon.map(({ bill, due, left }) => (
          <Link key={bill.id} href="/bills" className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/60">
            <span className="text-lg" aria-hidden>
              {BILL_EMOJI[bill.kind]}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm">{bill.title}</span>
            <span className="text-right text-xs tabular-nums">
              <span className="block font-semibold">{formatMoney(bill.amount, bill.currency, { hidden })}</span>
              <span className={cn(left < 0 ? "text-rose-600 dark:text-rose-400" : left <= 3 ? "text-amber-600" : "text-muted-foreground")}>
                {left < 0 ? formatOverdue(t, due, locale) : left === 0 ? t("bills.dueToday") : t("bills.inDays", { count: left })}
              </span>
            </span>
          </Link>
        ))}
      </Card>
    </section>
  )
}
