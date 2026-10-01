"use client"

import type { Currency } from "@/lib/data/types"
import { formatMoney } from "@/lib/money"
import { cn } from "@/lib/utils"
import { usePrefsStore } from "@/stores/prefs-store"

/** Money value that respects the balance privacy toggle. */
export function Amount({
  value,
  currency,
  className,
  signed,
}: {
  value: number
  currency: Currency
  className?: string
  signed?: boolean
}) {
  const hidden = usePrefsStore((s) => s.hideBalances)
  return <span className={cn("tabular-nums", className)}>{formatMoney(value, currency, { hidden, signed })}</span>
}
