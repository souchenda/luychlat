"use client"

import { Amount } from "@/components/money/amount"
import { dualTotal } from "@/lib/analytics"
import type { Debt } from "@/lib/data/types"
import { debtStatus, remaining } from "@/lib/debts"
import { usePrefsStore } from "@/stores/prefs-store"

/** Outstanding (unsettled) balance of some debts, in USD and KHR. */
export function useOutstanding(debts: Debt[]) {
  const khrPerUsd = usePrefsStore((s) => s.khrPerUsd)
  const open = debts.filter((d) => debtStatus(d) !== "SETTLED")
  const usd = open.filter((d) => d.currency === "USD").reduce((acc, d) => acc + remaining(d), 0)
  const khr = open.filter((d) => d.currency === "KHR").reduce((acc, d) => acc + remaining(d), 0)
  return dualTotal(usd, khr, khrPerUsd)
}

export function OutstandingAmount({ debts, className }: { debts: Debt[]; className?: string }) {
  const total = useOutstanding(debts)
  return (
    <span className={className}>
      <Amount value={total.usd} currency="USD" className="block text-lg font-bold" />
      <Amount value={total.khr} currency="KHR" className="block text-xs text-muted-foreground" />
    </span>
  )
}
