"use client"

import { ChevronRightIcon, CoinsIcon, LandmarkIcon } from "lucide-react"
import Link from "next/link"

import { nbcShortDate } from "@/components/market/nbc-stamp"
import { useT } from "@/lib/i18n/use-t"
import { useMarket } from "@/lib/market"
import { useLocaleStore } from "@/stores/locale-store"

const khr = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 })
const usd = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 })

/** Home: one compact line — NBC $1 = …៛ · gold 24K $…/damlung — opening /market. Hidden until data exists. */
export function MarketRatesCard() {
  const t = useT()
  const market = useMarket().data
  const locale = useLocaleStore((s) => s.locale)
  const usdKhr = market?.nbc?.usd_khr
  // Local Phnom Penh kilo gold (sell) when recent, else the world reference for 24K.
  const local = market?.local_gold && Date.now() - Date.parse(`${market.local_gold.date}T00:00:00+07:00`) < 4 * 86_400_000 ? market.local_gold : null
  const gold24 = local?.kilo.sell ?? market?.gold?.reference.GOLD_24K
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
            <span aria-hidden className="mr-1 inline-flex size-5 items-center justify-center rounded-full bg-emerald-50 align-[-5px] text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"><LandmarkIcon className="size-3" strokeWidth={2} /></span>
            <span className="text-muted-foreground">NBC</span> <span className="font-semibold tabular-nums">$1 = {khr.format(usdKhr)}៛</span>
            {market?.nbc && <span className="text-[11px] text-muted-foreground tabular-nums"> · {nbcShortDate(market.nbc, locale)}</span>}
          </span>
        )}
        {gold24 && (
          <span className="whitespace-nowrap">
            <span aria-hidden className="mr-1 inline-flex size-5 items-center justify-center rounded-full bg-amber-50 align-[-5px] text-amber-600 dark:bg-amber-500/10 dark:text-amber-400"><CoinsIcon className="size-3" strokeWidth={2} /></span>
            <span className="text-muted-foreground">{t(local ? "market.kiloGold" : "market.goldPerDamlung")}</span>{" "}
            <span className="font-semibold tabular-nums">${usd.format(gold24)}</span>
            <span className="text-xs text-muted-foreground">{t("market.perDamlung")}</span>
          </span>
        )}
      </span>
      <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  )
}
