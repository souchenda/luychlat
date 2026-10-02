import type { Currency } from "@/lib/data/types"
import { convert, roundMoney } from "@/lib/money"

/**
 * Cambodian gold weights and market value.
 *   1 តម្លឹង (damlung) = 10 ជី (chi) = 100 ហ៊ុន (hun) = 37.5 g
 *   1 ជី = 10 ហ៊ុន = 3.75 g;  1 ហ៊ុន = 0.375 g
 *   1 តម្លឹង = 37.5 / 31.1034768 = 1.20565 troy ounces
 * Weights are kept in hun; rates are USD per damlung.
 */
export const HUN_GRAMS = 0.375
export const HUN_PER_CHI = 10
export const HUN_PER_DAMLUNG = 100
export const TROY_OUNCE_GRAMS = 31.1034768
export const OUNCES_PER_DAMLUNG = (HUN_PER_DAMLUNG * HUN_GRAMS) / TROY_OUNCE_GRAMS

export type GoldKind = "GOLD_BAR" | "GOLD_24K" | "GOLD_18K" | "PLATINUM"
export const GOLD_KINDS: GoldKind[] = ["GOLD_BAR", "GOLD_24K", "GOLD_18K", "PLATINUM"]
/** Metal content, used for the spot-price conversion and for Zakat (pure gold). */
export const PURITY: Record<GoldKind, number> = { GOLD_BAR: 0.9999, GOLD_24K: 0.999, GOLD_18K: 0.75, PLATINUM: 0.95 }
export const isGold = (kind: GoldKind) => kind !== "PLATINUM"

export type GoldRates = Partial<Record<GoldKind, number>>
export type Weight = { damlung: number; chi: number; hun: number }

/** Total hun from the three inputs (each may be fractional or empty). */
export function toHun(w: Partial<Weight>): number {
  const n = (v: number | undefined) => (Number.isFinite(v) ? (v as number) : 0)
  return Math.round((n(w.damlung) * HUN_PER_DAMLUNG + n(w.chi) * HUN_PER_CHI + n(w.hun)) * 100) / 100
}

/** 152.5 hun → 1 damlung, 5 chi, 2.5 hun. */
export function splitHun(totalHun: number): Weight {
  const total = Math.round(totalHun * 100) / 100
  const damlung = Math.floor(total / HUN_PER_DAMLUNG)
  const chi = Math.floor((total - damlung * HUN_PER_DAMLUNG) / HUN_PER_CHI)
  const hun = Math.round((total - damlung * HUN_PER_DAMLUNG - chi * HUN_PER_CHI) * 100) / 100
  return { damlung, chi, hun }
}

export const hunToGrams = (hun: number) => Math.round(hun * HUN_GRAMS * 1000) / 1000

/** "1 តម្លឹង 5 ជី 2.5 ហ៊ុន" (zero parts left out; "0 ហ៊ុន" for nothing). */
export function formatWeight(totalHun: number, locale: "km" | "en"): string {
  const { damlung, chi, hun } = splitHun(totalHun)
  const units = locale === "km" ? ["តម្លឹង", "ជី", "ហ៊ុន"] : ["damlung", "chi", "hun"]
  const parts = [damlung, chi, hun].map((v, i) => (v ? `${v} ${units[i]}` : "")).filter(Boolean)
  return parts.length ? parts.join(" ") : `0 ${units[2]}`
}

/** Market value in USD (null without a rate for that kind). */
export function marketValue(hun: number, kind: GoldKind, rates: GoldRates): number | null {
  const rate = rates[kind]
  return rate ? roundMoney((hun / HUN_PER_DAMLUNG) * rate, "USD") : null
}

/** USD per damlung from a spot price per troy ounce of the pure metal. */
export function rateFromSpot(spotPerOunce: number, kind: GoldKind): number {
  return roundMoney(spotPerOunce * OUNCES_PER_DAMLUNG * PURITY[kind], "USD")
}

export type Holding = {
  kind: GoldKind
  weight_hun: number
  purchase_price: number | null
  purchase_currency: Currency | null
}

export type HoldingPnl = { value: number | null; cost: number | null; profit: number | null; percent: number | null }

/** Value, cost and unrealized profit/loss of one holding, in USD. */
export function holdingPnl(h: Holding, rates: GoldRates, khrPerUsd: number): HoldingPnl {
  const value = marketValue(h.weight_hun, h.kind, rates)
  const cost = h.purchase_price != null && h.purchase_currency ? roundMoney(convert(h.purchase_price, h.purchase_currency, "USD", khrPerUsd), "USD") : null
  const profit = value != null && cost != null ? roundMoney(value - cost, "USD") : null
  const percent = profit != null && cost ? Math.round((profit / cost) * 1000) / 10 : null
  return { value, cost, profit, percent }
}

export type Portfolio = {
  totalHun: number
  grams: number
  /** Pure gold content in grams (for the Zakat Nisab of 85 g); platinum excluded. */
  pureGoldGrams: number
  value: number
  /** Cost and profit over the holdings that have both a price and a rate. */
  cost: number
  profit: number
  percent: number | null
  /** Holdings without a market rate (left out of the value). */
  unpriced: number
}

export function portfolio(holdings: Holding[], rates: GoldRates, khrPerUsd: number): Portfolio {
  let totalHun = 0
  let pure = 0
  let value = 0
  let cost = 0
  let profit = 0
  let unpriced = 0
  for (const h of holdings) {
    totalHun += h.weight_hun
    if (isGold(h.kind)) pure += hunToGrams(h.weight_hun) * PURITY[h.kind]
    const p = holdingPnl(h, rates, khrPerUsd)
    if (p.value == null) unpriced++
    else value += p.value
    if (p.profit != null && p.cost != null) {
      cost += p.cost
      profit += p.profit
    }
  }
  return {
    totalHun: Math.round(totalHun * 100) / 100,
    grams: hunToGrams(totalHun),
    pureGoldGrams: Math.round(pure * 1000) / 1000,
    value: roundMoney(value, "USD"),
    cost: roundMoney(cost, "USD"),
    profit: roundMoney(profit, "USD"),
    percent: cost ? Math.round((profit / cost) * 1000) / 10 : null,
    unpriced,
  }
}

/** Rates from app_settings "gold_rates" (strings) → numbers; empty ones dropped. */
export function parseRates(raw: Record<string, unknown> | null | undefined): GoldRates {
  const out: GoldRates = {}
  for (const kind of GOLD_KINDS) {
    const n = Number(raw?.[kind])
    if (Number.isFinite(n) && n > 0) out[kind] = n
  }
  return out
}
