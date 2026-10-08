"use client"

import { useMemo } from "react"

import { Amount } from "@/components/money/amount"
import { Card } from "@/components/ui/card"
import { dualTotal } from "@/lib/analytics"
import type { Transaction } from "@/lib/data/types"
import { khmerDigits } from "@/lib/dates"
import { useT } from "@/lib/i18n/use-t"
import { useMoney } from "@/lib/use-money"
import { useLocaleStore } from "@/stores/locale-store"
import { usePrefsStore } from "@/stores/prefs-store"

const monthOf = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

/** Spending on the children (👶) in a set of entries: USD + KHR, as one dual total, and how many. */
export function kidsTotal(transactions: Transaction[], khrPerUsd: number) {
  const kids = transactions.filter((t) => t.type === "EXPENSE" && t.for_child)
  const usd = kids.filter((t) => t.currency === "USD").reduce((s, t) => s + t.amount, 0)
  const khr = kids.filter((t) => t.currency === "KHR").reduce((s, t) => s + t.amount, 0)
  return { total: dualTotal(usd, khr, khrPerUsd), count: kids.length }
}

/**
 * "👶 ចំណាយលើកូនខែនេះ: $120.50 (≈ 494,050៛)" with last month beside it — the expenses
 * flagged for a child (the bot's [👶 សម្រាប់កូន], or a note that says so).
 * `period` (Reports) totals the given entries instead of this month vs last.
 */
export function KidsCard({ transactions, period = false }: { transactions: Transaction[]; period?: boolean }) {
  const t = useT()
  const money = useMoney()
  const khrPerUsd = usePrefsStore((s) => s.khrPerUsd)
  const locale = useLocaleStore((s) => s.locale)
  const now = new Date()
  const thisMonth = monthOf(now.toISOString())
  const lastMonth = monthOf(new Date(now.getFullYear(), now.getMonth() - 1, 15).toISOString())
  const { current, previous } = useMemo(
    () =>
      period
        ? { current: kidsTotal(transactions, khrPerUsd), previous: null }
        : {
            current: kidsTotal(transactions.filter((x) => monthOf(x.transaction_date) === thisMonth), khrPerUsd),
            previous: kidsTotal(transactions.filter((x) => monthOf(x.transaction_date) === lastMonth), khrPerUsd),
          },
    [transactions, khrPerUsd, period, thisMonth, lastMonth],
  )
  // Home shows it once there is something to show; Reports always (with the how-to).
  if (!period && current.count === 0 && (previous?.count ?? 0) === 0) return null
  const n = (v: number) => (locale === "km" ? khmerDigits(String(v)) : String(v))

  return (
    <Card className="gap-1 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold">{t(period ? "kids.titlePeriod" : "kids.title")}</span>
        <span className="text-right">
          <Amount value={current.total.usd} currency="USD" className="block font-bold tabular-nums" />
          <span className="block text-[11px] text-muted-foreground tabular-nums">
            ≈ <Amount value={current.total.khr} currency="KHR" />
          </span>
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        {current.count > 0 ? t("kids.count", { n: n(current.count) }) : t("kids.hint")}
        {previous && previous.count > 0 ? ` · ${t("kids.lastMonth", { amount: money(previous.total.usd, "USD") })}` : ""}
      </p>
    </Card>
  )
}
