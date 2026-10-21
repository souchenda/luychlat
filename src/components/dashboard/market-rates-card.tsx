"use client"

import { ChevronRightIcon, CoinsIcon, LandmarkIcon } from "lucide-react"
import Link from "next/link"

import { nbcShortDate } from "@/components/market/nbc-stamp"
import type { WorkspaceType } from "@/lib/data/types"
import { heroTicker, khrText, usdText } from "@/lib/hero-ticker"
import { cn } from "@/lib/utils"
import { useT } from "@/lib/i18n/use-t"
import { useMarket } from "@/lib/market"

/**
 * Home, at the bottom of the total-assets card, one slim line in glass text on the green — opens /market:
 *   Personal / Family: "NBC $1 = 4,057៛ · មាស $5,010/តម្លឹង ›" (kilo gold when recent, else 24K);
 *   Business: "NBC $1 = 4,012៛ · សាំង 5,050៛ · ម៉ាស៊ូត 5,550៛ ›" (MoC retail fuel — founder, 21/10/2026, Task #438).
 * The NBC date, the gold kind and the fuel cycle are in the tooltip (lib/hero-ticker.ts). Hidden until data exists.
 * The fuel line is 12 px with no icon (the words say it): measured in Kantumruy Pro it is 288 px, the width a 360 px
 * phone gives the card's footer — one line, the diesel price never cut.
 */
export function MarketRatesCard({ workspaceType }: { workspaceType?: WorkspaceType | null }) {
  const t = useT()
  const market = useMarket().data
  const { usdKhr, gold, fuel } = heroTicker(market, workspaceType)
  if (!usdKhr && !gold && !fuel) return null
  const title = [
    market?.nbc && `NBC · ${nbcShortDate(market.nbc)}`,
    gold && t(gold.local ? "market.kiloGold" : "market.goldPerDamlung"),
    fuel && `${t("market.tickerFuelSource")} ${fuel.from} – ${fuel.to}${fuel.ended ? ` · ${t("market.tickerFuelEnded")}` : ""}`,
  ]
    .filter(Boolean)
    .join(" · ")
  return (
    <Link
      href="/market"
      title={title}
      className={cn(
        "group -mx-1 flex w-full flex-row items-center gap-1.5 rounded-md px-1 whitespace-nowrap",
        fuel ? "text-[12px]" : "text-[13px]",
        "text-white/85 transition-colors hover:bg-white/10",
      )}
      aria-label={t("market.title")}
    >
      <span className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
        {usdKhr && (
          <span className="flex shrink-0 items-center gap-1">
            <LandmarkIcon className="size-3.5 text-white/75" strokeWidth={2} aria-hidden />
            NBC <span className="font-semibold text-white tabular-nums">$1 = {khrText(usdKhr)}</span>
          </span>
        )}
        {usdKhr && (gold || fuel) && <span aria-hidden className="text-white/50">·</span>}
        {gold && (
          <span className="flex min-w-0 items-center gap-1">
            <CoinsIcon className="size-3.5 shrink-0 text-white/75" strokeWidth={2} aria-hidden />
            <span className="truncate">
              {t(gold.local ? "market.goldShort" : "market.goldPerDamlung")} <span className="font-semibold text-white tabular-nums">{usdText(gold.usd)}</span>
              <span className="text-white/70">{t("market.perDamlung")}</span>
            </span>
          </span>
        )}
        {fuel && (
          <span className="min-w-0 truncate">
            {t("market.tickerRegular")} <span className="font-semibold text-white tabular-nums">{khrText(fuel.regular)}</span>
            <span aria-hidden className="text-white/50"> · </span>
            {t("market.tickerDiesel")} <span className="font-semibold text-white tabular-nums">{khrText(fuel.diesel)}</span>
          </span>
        )}
      </span>
      <ChevronRightIcon className="size-3.5 shrink-0 text-white/70 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  )
}
