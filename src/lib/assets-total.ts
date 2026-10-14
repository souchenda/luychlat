"use client"

import { useMemo } from "react"

import { assetGaps } from "@/lib/asset-gaps"
import { assetsTotalUsd } from "@/lib/assets"
import { usePhysicalAssets } from "@/lib/assets-data"
import { diamondTotals } from "@/lib/diamonds"
import { useDiamonds } from "@/lib/diamonds-data"
import { portfolio } from "@/lib/gold"
import { useGoldHoldings, useGoldRates } from "@/lib/gold-data"
import { investmentTotals } from "@/lib/investments"
import { useInvestments, useMarketPrices } from "@/lib/investments-data"
import { usePrefsStore } from "@/stores/prefs-store"

/**
 * Value of everything on the Assets page in USD, as it counts in net worth:
 * gold & platinum at today's rate, diamonds at their liquid resale value,
 * stocks & crypto at market (cost when unpriced), property at its estimate.
 * `gaps` names what could not be counted (a failed load, gold without a rate) — the card says so,
 * never a silently smaller total; `retry` loads the failed lists again.
 */
export function useAssetsTotal(workspaceId: string | undefined) {
  const khrPerUsd = usePrefsStore((s) => s.khrPerUsd)
  const goldQuery = useGoldHoldings(workspaceId)
  const { rates } = useGoldRates()
  const diamondsQuery = useDiamonds(workspaceId)
  const investmentsQuery = useInvestments(workspaceId)
  const { prices } = useMarketPrices()
  const propertyQuery = usePhysicalAssets(workspaceId)
  const gold = goldQuery.data
  const diamonds = diamondsQuery.data
  const investments = investmentsQuery.data
  const property = propertyQuery.data
  const errors = [goldQuery.isError, diamondsQuery.isError, investmentsQuery.isError, propertyQuery.isError]
  const totals = useMemo(() => {
    const goldBook = portfolio(gold ?? [], rates, khrPerUsd)
    const goldUsd = goldBook.value
    const diamondUsd = diamondTotals(diamonds ?? [], khrPerUsd).liquidUsd
    const investUsd = investmentTotals(investments ?? [], prices, khrPerUsd).valueUsd
    const propertyUsd = assetsTotalUsd(property ?? [], khrPerUsd)
    return { goldUsd, diamondUsd, investUsd, propertyUsd, goldUnpriced: goldBook.unpriced, totalUsd: Math.round((goldUsd + diamondUsd + investUsd + propertyUsd) * 100) / 100 }
  }, [gold, rates, diamonds, investments, prices, property, khrPerUsd])
  const [goldError, diamondsError, investmentsError, propertyError] = errors
  const gaps = useMemo(
    () => assetGaps({ goldError, goldUnpriced: totals.goldUnpriced, diamondsError, investmentsError, propertyError }),
    [goldError, diamondsError, investmentsError, propertyError, totals.goldUnpriced],
  )
  const retry = () => {
    for (const q of [goldQuery, diamondsQuery, investmentsQuery, propertyQuery]) if (q.isError) void q.refetch()
  }
  return { ...totals, gaps, retry }
}
