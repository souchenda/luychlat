/**
 * Live market data (app_settings "market_live"), shared by the server sync and
 * the app. Pure: no app or server imports beyond the gold maths.
 *
 *   NBC  official exchange rates of the National Bank of Cambodia, as KHR per
 *        1 unit of each currency (Frankfurter's NBC provider, published daily).
 *   Gold international spot $/troy oz → reference price per damlung:
 *        spot × 1.20565 (oz per damlung) × purity.
 */

import { GRADE_PURITY, OUNCES_PER_DAMLUNG, PURITY, isWhiteGold, type GoldRates, type PlatinumGrade, type RateKey } from "@/lib/gold"

export type MarketLive = {
  /** When the server last fetched (ISO). */
  fetched_at: string
  gold?: {
    /** USD per troy ounce of pure gold / platinum. */
    gold_spot: number
    platinum_spot: number
    /** The feed's own timestamp (ISO). */
    updated_at: string
    /** USD per damlung, by rate key (plus GOLD_14K for display). */
    reference: Partial<Record<RateKey | "GOLD_14K", number>>
  }
  nbc?: {
    /** NBC publication date (YYYY-MM-DD). */
    date: string
    /** KHR per 1 USD. */
    usd_khr: number
    /** KHR per 1 unit of each currency (USD included). */
    khr_per: Record<string, number>
  }
}

/** Currencies shown in the NBC table, in this order. */
export const NBC_CURRENCIES = ["USD", "THB", "VND", "CNY", "EUR", "JPY", "KRW", "SGD", "MYR", "AUD", "GBP", "HKD"] as const

const round2 = (n: number) => Math.round(n * 100) / 100

/** Reference price per damlung for every purity, from the two spot prices. */
export function referenceRates(goldSpot: number, platinumSpot: number): NonNullable<MarketLive["gold"]>["reference"] {
  const perDamlung = (spot: number, purity: number) => round2(spot * OUNCES_PER_DAMLUNG * purity)
  const out: NonNullable<MarketLive["gold"]>["reference"] = {
    GOLD_BAR: perDamlung(goldSpot, PURITY.GOLD_BAR),
    GOLD_24K: perDamlung(goldSpot, PURITY.GOLD_24K),
    GOLD_18K: perDamlung(goldSpot, PURITY.GOLD_18K),
    GOLD_14K: perDamlung(goldSpot, 0.585),
    PLATINUM: perDamlung(platinumSpot, PURITY.PLATINUM),
  }
  for (const grade of Object.keys(GRADE_PURITY) as PlatinumGrade[]) {
    // White gold is gold; PT950 / PT900 are platinum.
    out[`PLATINUM_${grade}`] = perDamlung(isWhiteGold(grade) ? goldSpot : platinumSpot, GRADE_PURITY[grade])
  }
  return out
}

/** KHR per 1 unit of each currency, from rates quoted as "units per 1 USD". */
export function khrPerUnit(usdKhr: number, perUsd: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = { USD: usdKhr }
  for (const [code, rate] of Object.entries(perUsd)) {
    if (code === "KHR" || !(rate > 0)) continue
    const v = usdKhr / rate
    out[code] = v >= 100 ? Math.round(v) : v >= 1 ? round2(v) : Math.round(v * 10000) / 10000
  }
  return out
}

/**
 * Rates used to value holdings: the live reference, with any admin-entered
 * rate (local shop price) taking precedence for that kind.
 */
export function effectiveRates(admin: GoldRates, live: MarketLive | null | undefined): GoldRates {
  const reference = (live?.gold?.reference ?? {}) as GoldRates
  const out: GoldRates = { ...reference }
  for (const [k, v] of Object.entries(admin) as [RateKey, number | undefined][]) if (v && v > 0) out[k] = v
  return out
}
