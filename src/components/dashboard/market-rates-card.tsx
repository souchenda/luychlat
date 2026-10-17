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
 * Home, a standalone utility row under the total-assets card (founder, 17/10/2026 — like ACLEDA's
 * exchange-rate shortcut): "NBC $1 = 4,057៛ · មាស $5,010/តម្លឹង ›" (kilo gold when recent, else 24K),
 * opens /market. One full-width line: NBC on the left, gold on the right (founder, 17/10/2026).
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
      className="group flex min-h-12 w-full flex-row items-center gap-2 rounded-2xl border bg-card px-4 py-2.5 text-sm whitespace-nowrap shadow-xs transition-colors hover:bg-muted/40"
      aria-label={t("market.title")}
    >
      <span className="flex min-w-0 flex-1 flex-row items-center justify-between gap-3">
        {usdKhr && (
          <span className="flex shrink-0 items-center gap-1">
            <LandmarkIcon className="size-4 text-primary" strokeWidth={2} aria-hidden />
            <span className="text-muted-foreground">NBC</span> <span className="font-semibold tabular-nums">$1 = {khr.format(usdKhr)}៛</span>
          </span>
        )}

        {gold24 && (
          <span className="flex min-w-0 items-center gap-1">
            <CoinsIcon className="size-4 shrink-0 text-amber-500" strokeWidth={2} aria-hidden />
            <span className="truncate">
              <span className="text-muted-foreground">{t(local ? "market.goldShort" : "market.goldPerDamlung")}</span> <span className="font-semibold tabular-nums">${usd.format(gold24)}</span>
              <span className="text-muted-foreground">{t("market.perDamlung")}</span>
            </span>
          </span>
        )}
      </span>
      <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  )
}
