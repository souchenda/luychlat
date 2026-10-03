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
import type { LocalGold } from "@/lib/local-gold"

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
  /** Phnom Penh counter prices (CSNJ via Oknha News, or an admin's /setgold). */
  local_gold?: LocalGold
  nbc?: NbcRates
}

/**
 * NBC official rates. NBC publishes each working day at ~16:30 the rate for the
 * NEXT working day ("As of 05-Oct-2026" on Friday 02-Oct); `date` is that
 * "As of" day. Frankfurter's NBC feed (the automatic source) sometimes lags a
 * day behind NBC; an admin can then enter the newer rate (/setrate).
 */
export type NbcRates = {
  /** The day the rate is official for: NBC's "As of" date (YYYY-MM-DD). */
  date: string
  /** KHR per 1 USD. */
  usd_khr: number
  /** KHR per 1 unit of each currency (USD included). */
  khr_per: Record<string, number>
  /** "frankfurter" (automatic) or "manual" (an admin's /setrate, USD only). */
  source?: "frankfurter" | "manual"
  /** When this rate was last fetched or confirmed (ISO). */
  fetched_at?: string
  /** With a manual USD rate: the "As of" date of the other currencies. */
  others_date?: string
}

/** The next working day after a date (Saturday and Sunday skipped; public holidays are not known). */
export function nextWorkingDay(day: string): string {
  let t = Date.parse(`${day}T12:00:00Z`)
  do t += 86_400_000
  while ([0, 6].includes(new Date(t).getUTCDay()))
  return new Date(t).toISOString().slice(0, 10)
}

/**
 * Which NBC rates to keep after a fetch: an admin's manual rate stays until
 * the automatic source has caught up (same or later "As of" date); the other
 * currencies are still refreshed under it.
 */
export function pickNbc(previous: NbcRates | undefined, fetched: NbcRates | undefined): NbcRates | undefined {
  if (!fetched) return previous
  if (previous?.source === "manual" && fetched.date < previous.date) {
    return { ...previous, khr_per: { ...fetched.khr_per, USD: previous.usd_khr }, others_date: fetched.date, fetched_at: fetched.fetched_at }
  }
  return fetched
}

/** /setrate 4057 [05-10-2026 | 2026-10-05] · /setrate clear — date defaults to the next working day. */
export function parseSetRate(text: string, today: string): { usd_khr: number; date: string } | "clear" | null {
  const args = text.trim().split(/\s+/).slice(1)
  if (args[0]?.toLowerCase() === "clear") return "clear"
  const rate = Number((args[0] ?? "").replace(/[,៛]/g, ""))
  if (!(rate > 3000 && rate < 6000)) return null
  let date = nextWorkingDay(today)
  if (args[1]) {
    const m = args[1].match(/^(\d{4})-(\d{2})-(\d{2})$/) ?? args[1].match(/^(\d{2})[-/.](\d{2})[-/.](\d{4})$/)
    if (!m) return null
    date = m[1].length === 4 ? `${m[1]}-${m[2]}-${m[3]}` : `${m[3]}-${m[2]}-${m[1]}`
    if (Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return null
  }
  return { usd_khr: Math.round(rate), date }
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

/** Local prices no older than this still value holdings (weekends, holidays). */
const LOCAL_MAX_AGE_DAYS = 4

/**
 * Rates used to value holdings: the world reference; then the local buy price
 * (what an owner would get selling today) for kilo gold and 24K jewelry when
 * recent; then any admin-entered rate for that kind.
 */
export function effectiveRates(admin: GoldRates, live: MarketLive | null | undefined, now = Date.now()): GoldRates {
  const reference = (live?.gold?.reference ?? {}) as GoldRates
  const out: GoldRates = { ...reference }
  const local = live?.local_gold
  if (local && now - Date.parse(`${local.date}T00:00:00+07:00`) < LOCAL_MAX_AGE_DAYS * 86_400_000) {
    out.GOLD_BAR = local.kilo.buy
    out.GOLD_24K = local.jewelry?.buy ?? local.kilo.buy
  }
  for (const [k, v] of Object.entries(admin) as [RateKey, number | undefined][]) if (v && v > 0) out[k] = v
  return out
}
