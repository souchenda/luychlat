"use client"

import { format, parseISO } from "date-fns"
import { BanknoteArrowDownIcon, BanknoteArrowUpIcon, ChevronRightIcon, MessageSquareTextIcon, PlusIcon } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"

import { DebtFormSheet } from "@/components/debts/debt-form-sheet"
import { RepaymentSheet } from "@/components/debts/repayment-sheet"
import { Amount } from "@/components/money/amount"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { arApSummary, arReminderText, openDebts, overdueDays, type ArApKind } from "@/lib/ar-ap"
import { canWrite, useActiveWorkspace, useDebts, useWallets } from "@/lib/data/hooks"
import type { Debt } from "@/lib/data/types"
import { remaining } from "@/lib/debts"
import { useT } from "@/lib/i18n/use-t"
import { useIslamicEnabled } from "@/lib/islamic-settings"
import { telegramShareUrl } from "@/lib/reminder"
import { cn } from "@/lib/utils"
import { usePrefsStore } from "@/stores/prefs-store"

/**
 * «អតិថិជនជំពាក់» (AR) or «ជំពាក់គេ» (AP) for a Business workspace (founder, 22/10/2026 — Task #453; lib/ar-ap.ts): the
 * totals, then each customer / supplier with what is left, the due date and how late it is. AR: [ រំលឹកទារលុយ ] hands a
 * polite Khmer reminder to the share sheet (the owner sends it, never the app) and [ ទទួលប្រាក់ ] records the payment;
 * AP: [ កត់ត្រាការទូទាត់ ] records what was paid (an expense from the wallet, the payable drops).
 */
export function ArApView({ kind }: { kind: ArApKind }) {
  const t = useT()
  const { workspace } = useActiveWorkspace()
  const ws = workspace?.id
  const debtsQuery = useDebts(ws)
  const wallets = useWallets(ws).data ?? []
  const khrPerUsd = usePrefsStore((s) => s.khrPerUsd)
  const islamic = useIslamicEnabled()
  const editable = canWrite(workspace)
  const [paying, setPaying] = useState<Debt | null>(null)
  const [adding, setAdding] = useState(false)
  const ar = kind === "RECEIVABLE"
  const debts = useMemo(() => openDebts(debtsQuery.data ?? [], kind), [debtsQuery.data, kind])
  const summary = useMemo(() => arApSummary(debtsQuery.data ?? [], kind, khrPerUsd), [debtsQuery.data, kind, khrPerUsd])

  if (workspace && workspace.type !== "BUSINESS") return <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">{t("arap.businessOnly")}</p>

  const remind = async (d: Debt) => {
    const text = arReminderText({ customer: d.party_name, business: workspace?.name ?? "", debt: d, islamic })
    // The phone's share sheet (Telegram, Messenger, SMS…); a computer: Telegram's share page.
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ text })
        return
      } catch {
        // Cancelled, or not allowed here: Telegram below.
      }
    }
    window.open(telegramShareUrl(text), "_blank", "noopener,noreferrer")
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t(ar ? "arap.ar.title" : "arap.ap.title")}</h1>

      {/* The totals at a glance: AR — owed, overdue, debtors; AP — owed, due this week. Riel counted at the rate (≈). */}
      <Card className={cn("grid gap-3 px-4 py-4", ar ? "grid-cols-3" : "grid-cols-2")}>
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{t(ar ? "arap.ar.total" : "arap.ap.total")}</p>
          <p className="truncate text-lg font-bold tabular-nums">
            ≈ <Amount value={summary.totalUsd} currency="USD" />
          </p>
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{t(ar ? "arap.overdue" : "arap.dueWeek")}</p>
          <p className={cn("truncate text-lg font-bold tabular-nums", ar && summary.overdueUsd > 0 && "text-rose-600 dark:text-rose-400")}>
            ≈ <Amount value={ar ? summary.overdueUsd : summary.dueWeekUsd} currency="USD" />
          </p>
        </div>
        {ar && (
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground">{t("arap.debtors")}</p>
            <p className="text-lg font-bold tabular-nums">{summary.count}</p>
          </div>
        )}
      </Card>

      {editable && (
        <Button type="button" variant="outline" className="h-12 w-full gap-2 rounded-2xl" onClick={() => setAdding(true)}>
          <PlusIcon className="size-4" aria-hidden />
          {t(ar ? "arap.ar.add" : "arap.ap.add")}
        </Button>
      )}

      {debtsQuery.isLoading ? (
        <Skeleton className="h-40 w-full rounded-2xl" />
      ) : debts.length === 0 ? (
        <p className="rounded-2xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">{t(ar ? "arap.ar.empty" : "arap.ap.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {debts.map((d) => {
            const late = overdueDays(d)
            return (
              <li key={d.id}>
                <Card className="gap-3 px-4 py-3">
                  <Link href={`/debts/${d.id}`} className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{d.party_name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {d.due_date ? t("arap.due", { date: format(parseISO(d.due_date), "dd/MM/yyyy") }) : t("arap.noDue")}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <Amount value={remaining(d)} currency={d.currency} className="font-bold tabular-nums" />
                      {late !== null && (
                        <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                          {t("arap.overdueDays", { n: late })}
                        </span>
                      )}
                    </span>
                  </Link>
                  {editable && (
                    <div className={cn("grid gap-2", ar ? "grid-cols-2" : "grid-cols-1")}>
                      {ar && (
                        <Button type="button" variant="outline" className="h-11 gap-1.5 rounded-xl" onClick={() => remind(d)}>
                          <MessageSquareTextIcon className="size-4" aria-hidden />
                          {t("arap.remind")}
                        </Button>
                      )}
                      <Button type="button" className="h-11 gap-1.5 rounded-xl" onClick={() => setPaying(d)}>
                        {ar ? <BanknoteArrowDownIcon className="size-4" aria-hidden /> : <BanknoteArrowUpIcon className="size-4" aria-hidden />}
                        {t(ar ? "arap.received" : "arap.pay")}
                      </Button>
                    </div>
                  )}
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      <Link href={`/debts?tab=${kind}`} className="flex items-center justify-center gap-1 py-2 text-sm text-primary">
        {t("arap.allDebts")}
        <ChevronRightIcon className="size-4" aria-hidden />
      </Link>

      {paying && <RepaymentSheet open={Boolean(paying)} onOpenChange={(open) => !open && setPaying(null)} debt={paying} wallets={wallets} />}
      <DebtFormSheet open={adding} onOpenChange={setAdding} workspaceId={ws} defaultType={kind} />
    </div>
  )
}
