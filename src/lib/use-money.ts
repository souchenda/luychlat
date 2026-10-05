"use client"

import { useCallback } from "react"

import type { Currency } from "@/lib/data/types"
import { formatMoney } from "@/lib/money"
import { usePrefsStore } from "@/stores/prefs-store"

/**
 * formatMoney that follows the 👁 privacy toggle ($***** / *****៛ when on).
 * Screens that show amounts use this (or <Amount>), so masking is the same everywhere.
 */
export function useMoney() {
  const hidden = usePrefsStore((s) => s.hideBalances)
  return useCallback((amount: number, currency: Currency, opts?: { signed?: boolean }) => formatMoney(amount, currency, { ...opts, hidden }), [hidden])
}
