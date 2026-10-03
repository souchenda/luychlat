"use client"

import { ChevronRightIcon } from "lucide-react"
import Link from "next/link"

import { useT } from "@/lib/i18n/use-t"
import { useMarket } from "@/lib/market"

const khr = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 })
const usd = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 })

/** Home: one compact line — NBC $1 = …៛ · gold 24K $…/damlung — opening /market. Hidden until data exists. */
export function MarketRatesCard() {
  const t = useT()
  const market = useMarket().data
  const usdKhr = market?.nbc?.usd_khr
  const gold24 = market?.gold?.reference.GOLD_24K
  if (!usdKhr && !gold24) return null
  return (
    <Link
      href="/market"
      className="flex items-center gap-2 rounded-2xl border bg-card px-3.5 py-2.5 text-sm shadow-xs transition-colors hover:bg-muted/60"
      aria-label={t("market.title")}
    >
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-0.5">
        {usdKhr && (
          <span className="whitespace-nowrap">
            <span aria-hidden>💵</span> <span className="text-muted-foreground">NBC</span> <span className="font-semibold tabular-nums">$1 = {khr.format(usdKhr)}៛</span>
          </span>
        )}
        {gold24 && (
          <span className="whitespace-nowrap">
            <span aria-hidden>🪙</span> <span className="text-muted-foreground">{t("market.goldPerDamlung")}</span>{" "}
            <span className="font-semibold tabular-nums">${usd.format(gold24)}</span>
            <span className="text-xs text-muted-foreground">{t("market.perDamlung")}</span>
          </span>
        )}
      </span>
      <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  )
}
