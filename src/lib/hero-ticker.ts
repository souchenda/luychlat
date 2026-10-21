/**
 * The one-line market ticker at the bottom of the home hero (components/dashboard/market-rates-card.tsx): NBC $1 = …៛,
 * then gold for a Personal or Family workspace — or, in a Business workspace, the MoC retail fuel prices (founder,
 * 21/10/2026 — Task #438: a merchant runs deliveries on EA92 and diesel; gold is not a daily operating number):
 *   🏛️ NBC $1 = 4,012៛ · ⛽ សាំង 5,050៛ · ម៉ាស៊ូត 5,550៛ ›
 * Pure. Amounts as the source states them (whole riel, 0-9 digits on a screen — rule 7).
 */
import type { WorkspaceType } from "@/lib/data/types"
import type { MarketLive } from "@/lib/market-calc"

const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 })

export type TickerGold = { usd: number; local: boolean }
export type TickerFuel = { regular: number; diesel: number; from: string; to: string; ended: boolean }
export type HeroTicker = { usdKhr: number | null; gold: TickerGold | null; fuel: TickerFuel | null }

/** Which second item the hero shows: fuel in a Business workspace, gold everywhere else. */
export const tickerSecond = (type: WorkspaceType | null | undefined): "fuel" | "gold" => (type === "BUSINESS" ? "fuel" : "gold")

/**
 * What the ticker shows. Gold: the Phnom Penh kilo price when under four days old, else the world 24K reference.
 * Fuel: the latest MoC notice — kept after its cycle ends (the price stands until the next notice), flagged `ended` for
 * the tooltip, never silently passed off as current.
 */
export function heroTicker(market: Pick<MarketLive, "nbc" | "local_gold" | "gold" | "fuel"> | null | undefined, type: WorkspaceType | null | undefined, now = Date.now()): HeroTicker {
  const usdKhr = market?.nbc?.usd_khr ?? null
  if (tickerSecond(type) === "fuel") {
    const f = market?.fuel
    const fuel = f && f.regular > 0 && f.diesel > 0 ? { regular: f.regular, diesel: f.diesel, from: f.from, to: f.to, ended: Date.parse(`${f.to}T23:59:59+07:00`) < now } : null
    return { usdKhr, gold: null, fuel }
  }
  const local = market?.local_gold && now - Date.parse(`${market.local_gold.date}T00:00:00+07:00`) < 4 * 86_400_000 ? market.local_gold : null
  const usd = local?.kilo.sell ?? market?.gold?.reference.GOLD_24K
  return { usdKhr, gold: usd ? { usd, local: Boolean(local) } : null, fuel: null }
}

/** «សាំង 5,050៛ · ម៉ាស៊ូត 5,550៛» — the labels from the dictionary (market.tickerRegular / market.tickerDiesel). */
export const fuelTickerText = (fuel: Pick<TickerFuel, "regular" | "diesel">, labels: { regular: string; diesel: string }) =>
  `${labels.regular} ${whole.format(fuel.regular)}៛ · ${labels.diesel} ${whole.format(fuel.diesel)}៛`

export const khrText = (n: number) => `${whole.format(n)}៛`
export const usdText = (n: number) => `$${whole.format(n)}`
