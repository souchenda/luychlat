"use client"

import { useQueries } from "@tanstack/react-query"
import { useMemo } from "react"

import { assessCredit, averageMonthlyIncome, incomeLastMonths, monthlyPaymentUsd, type CbcAssessment } from "@/lib/cbc-engine"
import { useCategories, useDebts, useTransactions, useWallets } from "@/lib/data/hooks"
import { todayDate } from "@/lib/debts"
import { personalTransactions } from "@/lib/pool-ledger"
import { usePrefsStore } from "@/stores/prefs-store"

import { loanInstallmentsQuery } from "./bank-loan"
import { cbcClosedOn, cbcMonthStrip } from "./cbc"
import { debtSchedule, installments, isBankLoan } from "./installments"

/** The first day of the month `k` months before today's (ISO date). */
const monthsBack = (today: string, k: number) => new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - k, 1)).toISOString().slice(0, 10)

/**
 * The credit assessment of a workspace (lib/cbc-engine): every loan owed with a schedule, its payment dates, and the income
 * of the last 3 complete months. `null` while loading. Loans without a schedule have no due dates to judge — counted apart.
 */
export function useCbcAssessment(workspaceId: string | undefined, enabled: boolean): { assessment: CbcAssessment | null; unscheduled: number } {
  const khrPerUsd = usePrefsStore((s) => s.khrPerUsd)
  const today = todayDate()
  const debts = useDebts(enabled ? workspaceId : undefined)
  const loans = useMemo(() => (debts.data ?? []).filter((d) => d.type === "PAYABLE"), [debts.data])
  const scheduled = useMemo(() => loans.flatMap((d) => (debtSchedule(d) ? [{ debt: d, schedule: debtSchedule(d)! }] : [])), [loans])
  const paid = useQueries({ queries: scheduled.map(({ debt }) => loanInstallmentsQuery(debt.id, enabled)) })
  const income = useTransactions(enabled ? workspaceId : undefined, { type: "INCOME", from: monthsBack(today, 3) })
  const categories = useCategories(enabled ? workspaceId : undefined)
  const wallets = useWallets(enabled ? workspaceId : undefined)

  const ready = enabled && debts.data && income.data && categories.data && wallets.data && paid.every((q) => q.data)
  const assessment = useMemo(() => {
    if (!ready) return null
    let overdueNow = false
    const histories = scheduled.map(({ debt, schedule }, i) => {
      const list = installments(schedule, debt.paid_amount, today, debt.currency, isBankLoan(debt))
      if (list.some((r) => r.status === "OVERDUE")) overdueNow = true
      const rows = list.map((r) => ({ n: r.n, date: r.date, paid: r.status === "PAID" }))
      const paidOn = new Map((paid[i].data ?? []).map((r) => [r.n, r.paid_at]))
      return {
        months: cbcMonthStrip(rows, paidOn, today, debt.start_date, cbcClosedOn(rows, paidOn)),
        monthlyPaymentUsd: monthlyPaymentUsd(list, debt.schedule_frequency ?? "MONTHLY", debt.currency, khrPerUsd),
      }
    })
    const earnings = incomeLastMonths(personalTransactions(income.data!, wallets.data!), categories.data!, khrPerUsd, today)
    return assessCredit(histories, averageMonthlyIncome(earnings), overdueNow)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `paid` is a new array each render; its data is what matters
  }, [ready, scheduled, paid.map((q) => q.dataUpdatedAt).join(), income.data, categories.data, wallets.data, khrPerUsd, today])

  return { assessment, unscheduled: loans.length - scheduled.length }
}
