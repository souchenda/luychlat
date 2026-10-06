"use client"

import { ChevronRightIcon, CoinsIcon, LandmarkIcon } from "lucide-react"
import Link from "next/link"

import { nbcShortDate } from "@/components/market/nbc-stamp"
import { useT } from "@/lib/i18n/use-t"
import { useMarket } from "@/lib/market"
import { useLocaleStore } from "@/stores/locale-store"

const khr = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 })
const usd = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 })

/**
 * Home, at the bottom of the total-assets card: NBC $1 = …៛ · date, and kilo gold (or 24K) $…/damlung,
 * in translucent glass text on the green — opens /market. Hidden until data exists.
 */
export function MarketRatesCard() {
  const t = useT()
  const market = useMarket().data
  const locale = useLocaleStore((s) => s.locale)
  const usdKhr = market?.nbc?.usd_khr
  // Local Phnom Penh kilo gold (sell) when recent, else the world reference for 24K.
  const local = market?.local_gold && Date.now() - Date.parse(`${market.local_gold.date}T00:00:00+07:00`) < 4 * 86_400_000 ? market.local_gold : null
  const gold24 = local?.kilo.sell ?? market?.gold?.reference.GOLD_24K
  if (!usdKhr && !gold24) return null
  const disc = "mr-1 inline-flex size-5 items-center justify-center rounded-full bg-white/15 align-[-5px] text-white ring-1 ring-white/20"
  return (
    <Link href="/market" className="group -mx-1 flex items-center gap-2 rounded-lg px-1 py-0.5 text-xs text-white/85 transition-colors hover:bg-white/10" aria-label={t("market.title")}>
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
        {usdKhr && (
          <span className="whitespace-nowrap">
            <span aria-hidden className={disc}>
              <LandmarkIcon className="size-3" strokeWidth={2} />
            </span>
            NBC <span className="font-semibold text-white tabular-nums">$1 = {khr.format(usdKhr)}៛</span>
            {market?.nbc && <span className="text-white/70 tabular-nums"> · {nbcShortDate(market.nbc, locale)}</span>}
          </span>
        )}
        {gold24 && (
          <span className="whitespace-nowrap">
            <span aria-hidden className={disc}>
              <CoinsIcon className="size-3" strokeWidth={2} />
            </span>
            {t(local ? "market.kiloGold" : "market.goldPerDamlung")} <span className="font-semibold text-white tabular-nums">${usd.format(gold24)}</span>
            <span className="text-white/70">{t("market.perDamlung")}</span>
          </span>
        )}
      </span>
      <ChevronRightIcon className="size-4 shrink-0 text-white/70 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  )
}
