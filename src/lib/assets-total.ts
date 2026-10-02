"use client"

import { useMemo } from "react"

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
 */
export function useAssetsTotal(workspaceId: string | undefined) {
  const khrPerUsd = usePrefsStore((s) => s.khrPerUsd)
  const gold = useGoldHoldings(workspaceId).data
  const { rates } = useGoldRates()
  const diamonds = useDiamonds(workspaceId).data
  const investments = useInvestments(workspaceId).data
  const { prices } = useMarketPrices()
  const property = usePhysicalAssets(workspaceId).data
  return useMemo(() => {
    const goldUsd = portfolio(gold ?? [], rates, khrPerUsd).value
    const diamondUsd = diamondTotals(diamonds ?? [], khrPerUsd).liquidUsd
    const investUsd = investmentTotals(investments ?? [], prices, khrPerUsd).valueUsd
    const propertyUsd = assetsTotalUsd(property ?? [], khrPerUsd)
    return { goldUsd, diamondUsd, investUsd, propertyUsd, totalUsd: Math.round((goldUsd + diamondUsd + investUsd + propertyUsd) * 100) / 100 }
  }, [gold, rates, diamonds, investments, prices, property, khrPerUsd])
}
