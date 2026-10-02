"use client"

import { CalendarRangeIcon, ChevronDownIcon } from "lucide-react"
import { useState } from "react"

import { Card } from "@/components/ui/card"
import type { Debt } from "@/lib/data/types"
import { todayDate } from "@/lib/debts"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { debtSchedule, installments, nextInstallment, type Installment, type InstallmentStatus } from "@/lib/loans/installments"
import { formatMoney, roundMoney } from "@/lib/money"
import { cn } from "@/lib/utils"

const STATUS_STYLE: Record<InstallmentStatus, string> = {
  PAID: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  PARTIAL: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
  DUE: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  OVERDUE: "bg-rose-500/12 text-rose-700 dark:text-rose-300",
  PENDING: "bg-muted text-muted-foreground",
}

const ddmmyy = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(2, 4)}`

/** The next unpaid installment's amount left (for the "log payment" pre-fill). */
export function nextInstallmentAmount(debt: Debt): number | undefined {
  const schedule = debtSchedule(debt)
  if (!schedule) return undefined
  const next = nextInstallment(installments(schedule, debt.paid_amount, todayDate(), debt.currency))
  return next ? roundMoney(next.payment - next.paid, debt.currency) : undefined
}

function StatusChip({ status }: { status: InstallmentStatus }) {
  const t = useT()
  return <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap", STATUS_STYLE[status])}>{t(`schedule.status.${status}` as MessageKey)}</span>
}

/** Installment schedule of a debt: next payment, progress, and the full principal + interest table. */
export function ScheduleCard({ debt }: { debt: Debt }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const schedule = debtSchedule(debt)
  if (!schedule) return null
  const list: Installment[] = installments(schedule, debt.paid_amount, todayDate(), debt.currency)
  const next = nextInstallment(list)
  const paidCount = list.filter((i) => i.status === "PAID").length
  const overdue = list.filter((i) => i.status === "OVERDUE").length
  const money = (n: number) => formatMoney(n, debt.currency)
  const weekly = debt.schedule_frequency === "WEEKLY"

  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-1.5 px-1 text-sm font-medium text-muted-foreground">
        <CalendarRangeIcon className="size-4" aria-hidden />
        {t("schedule.title")}
      </h2>
      <Card className="gap-3 px-4 py-3">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span>
            {t("schedule.progress", { paid: paidCount, total: list.length })}
            <span className="text-muted-foreground"> · {t(weekly ? "schedule.WEEKLY" : "schedule.MONTHLY")}</span>
          </span>
          {overdue > 0 && <span className="text-xs font-medium text-rose-600 dark:text-rose-400">{t("schedule.overdueCount", { count: overdue })}</span>}
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.round((paidCount / list.length) * 100)}%` }} />
        </div>

        {next && (
          <div className={cn("flex items-center gap-3 rounded-xl p-3", next.status === "OVERDUE" ? "bg-rose-500/10" : "bg-muted/60")}>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">{t("schedule.next", { n: next.n, total: list.length })}</p>
              <p className="text-lg font-bold tabular-nums">{money(roundMoney(next.payment - next.paid, debt.currency))}</p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {ddmmyy(next.date)} · {t("schedule.split", { principal: money(next.principal), interest: money(next.interest) })}
              </p>
            </div>
            <StatusChip status={next.status} />
          </div>
        )}

        <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center justify-center gap-1 text-sm text-primary" aria-expanded={open}>
          <ChevronDownIcon className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
          {t(open ? "schedule.hideTable" : "schedule.showTable")}
        </button>

        {open && (
          <div className="-mx-4 overflow-x-auto">
            <table className="w-full text-xs tabular-nums">
              <thead className="text-muted-foreground">
                <tr className="border-b">
                  <th className="px-2 py-1.5 text-left font-medium">#</th>
                  <th className="px-2 py-1.5 text-left font-medium">{t("schedule.col.date")}</th>
                  <th className="px-2 py-1.5 text-right font-medium">{t("schedule.col.payment")}</th>
                  <th className="px-2 py-1.5 text-right font-medium">{t("schedule.col.interest")}</th>
                  <th className="px-2 py-1.5 text-right font-medium">{t("schedule.col.balance")}</th>
                  <th className="px-2 py-1.5 text-right font-medium" aria-label={t("schedule.col.status")} />
                </tr>
              </thead>
              <tbody>
                {list.map((i) => (
                  <tr key={i.n} className={cn("border-b last:border-0", i === next && "bg-primary/5")}>
                    <td className="px-2 py-1.5 text-muted-foreground">{i.n}</td>
                    <td className="px-2 py-1.5">{ddmmyy(i.date)}</td>
                    <td className="px-2 py-1.5 text-right font-medium">{money(i.payment)}</td>
                    <td className="px-2 py-1.5 text-right text-muted-foreground">{money(i.interest)}</td>
                    <td className="px-2 py-1.5 text-right text-muted-foreground">{money(i.balance)}</td>
                    <td className="px-2 py-1.5 text-right">
                      <StatusChip status={i.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-medium">
                  <td className="px-2 py-1.5" colSpan={2}>
                    {t("schedule.total")}
                  </td>
                  <td className="px-2 py-1.5 text-right">{money(schedule.totalPayment)}</td>
                  <td className="px-2 py-1.5 text-right">{money(schedule.totalInterest)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </section>
  )
}
