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
 * Home, at the bottom of the total-assets card, one slim line in glass text on the green:
 * "NBC $1 = 4,057៛ · មាស $5,010/តម្លឹង ›" (kilo gold when recent, else 24K) — opens /market.
 * The NBC date and the gold kind are in the tooltip. Hidden until data exists.
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
  const title = [market?.nbc && `NBC · ${nbcShortDate(market.nbc, locale)}`, gold24 && t(local ? "market.kiloGold" : "market.goldPerDamlung")].filter(Boolean).join(" · ")
  return (
    <Link
      href="/market"
      title={title}
      className="group -mx-1 flex items-center gap-1.5 rounded-md px-1 text-xs whitespace-nowrap text-white/85 transition-colors hover:bg-white/10"
      aria-label={t("market.title")}
    >
      <span className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
        {usdKhr && (
          <span className="flex shrink-0 items-center gap-1">
            <LandmarkIcon className="size-3.5 text-white/75" strokeWidth={2} aria-hidden />
            NBC <span className="font-semibold text-white tabular-nums">$1 = {khr.format(usdKhr)}៛</span>
          </span>
        )}
        {usdKhr && gold24 && <span aria-hidden className="text-white/50">·</span>}
        {gold24 && (
          <span className="flex min-w-0 items-center gap-1">
            <CoinsIcon className="size-3.5 shrink-0 text-white/75" strokeWidth={2} aria-hidden />
            <span className="truncate">
              {t(local ? "market.goldShort" : "market.goldPerDamlung")} <span className="font-semibold text-white tabular-nums">${usd.format(gold24)}</span>
              <span className="text-white/70">{t("market.perDamlung")}</span>
            </span>
          </span>
        )}
      </span>
      <ChevronRightIcon className="size-3.5 shrink-0 text-white/70 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  )
}
