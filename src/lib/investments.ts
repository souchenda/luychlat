import type { Currency } from "@/lib/data/types"
import { convert, roundMoney } from "@/lib/money"

/**
 * Stocks (CSX, international) and crypto. A holding's price comes from, in
 * order: the admin's daily price for its symbol (app_settings
 * "market_prices", CSX in riel, others in US dollars), the user's own latest
 * price, or 1 USD for a dollar stablecoin. Without any, it is "unpriced" and
 * its buy cost stands in for its value in totals.
 */
export type Market = "STOCK_CSX" | "STOCK_INTL" | "CRYPTO"
export const MARKETS: Market[] = ["STOCK_CSX", "STOCK_INTL", "CRYPTO"]

export type Investment = {
  id: string
  workspace_id: string
  market: Market
  symbol: string
  name: string | null
  quantity: number
  /** Average buy price per unit, in `currency`. */
  avg_cost: number
  currency: Currency
  current_price: number | null
  price_updated_at: string | null
  created_at: string
}
export type InvestmentInput = Pick<Investment, "market" | "symbol" | "name" | "quantity" | "avg_cost" | "currency" | "current_price" | "price_updated_at">

/** Suggestions only: any valid symbol can be typed. */
export const SYMBOL_SUGGESTIONS: Record<Market, string[]> = {
  STOCK_CSX: ["ABC", "PWSA", "PAS", "CGSM", "GTI", "PPAP", "PPSP", "PEPC", "DBDE", "JSL", "MJQE"],
  STOCK_INTL: ["AAPL", "TSLA", "NVDA", "MSFT", "AMZN", "GOOGL", "META"],
  CRYPTO: ["USDT", "BTC", "ETH", "SOL", "BNB", "XRP", "USDC", "TON", "TRX", "DOGE"],
}
const STABLECOINS = new Set(["USDT", "USDC", "FDUSD", "DAI"])
/** Currency the admin's price for a market is quoted in. */
export const PRICE_CURRENCY: Record<Market, Currency> = { STOCK_CSX: "KHR", STOCK_INTL: "USD", CRYPTO: "USD" }

export type MarketPrices = Record<string, number>
export const priceKey = (market: Market, symbol: string) => `${market}:${symbol}`

/** "abc " → "ABC"; null when it isn't a valid ticker (letters, digits, . and -). */
export function normalizeSymbol(input: string): string | null {
  const s = input.trim().toUpperCase()
  return /^[A-Z0-9.-]{1,15}$/.test(s) ? s : null
}

/** Admin prices from app_settings (strings) → numbers; invalid ones dropped. */
export function parseMarketPrices(raw: Record<string, unknown> | null | undefined): MarketPrices {
  const out: MarketPrices = {}
  for (const [k, v] of Object.entries(raw ?? {})) {
    const n = Number(v)
    if (/^(STOCK_CSX|STOCK_INTL|CRYPTO):[A-Z0-9.-]{1,15}$/.test(k) && Number.isFinite(n) && n >= 0) out[k] = n
  }
  return out
}

export type PriceSource = "ADMIN" | "OWN" | "STABLE" | null

/** Current price per unit in the holding's currency, and where it came from. */
export function currentPrice(h: Pick<Investment, "market" | "symbol" | "currency" | "current_price">, prices: MarketPrices, khrPerUsd: number): { price: number | null; source: PriceSource } {
  const admin = prices[priceKey(h.market, h.symbol)]
  if (admin !== undefined) return { price: convert(admin, PRICE_CURRENCY[h.market], h.currency, khrPerUsd), source: "ADMIN" }
  if (h.current_price != null) return { price: h.current_price, source: "OWN" }
  if (h.market === "CRYPTO" && STABLECOINS.has(h.symbol)) return { price: convert(1, "USD", h.currency, khrPerUsd), source: "STABLE" }
  return { price: null, source: null }
}

export type InvestmentPnl = {
  /** In the holding's currency. */
  cost: number
  value: number | null
  profit: number | null
  percent: number | null
  source: PriceSource
}

export function investmentPnl(h: Investment, prices: MarketPrices, khrPerUsd: number): InvestmentPnl {
  const { price, source } = currentPrice(h, prices, khrPerUsd)
  const cost = roundMoney(h.quantity * h.avg_cost, h.currency)
  const value = price === null ? null : roundMoney(h.quantity * price, h.currency)
  const profit = value === null ? null : roundMoney(value - cost, h.currency)
  const percent = profit !== null && cost > 0 ? Math.round((profit / cost) * 1000) / 10 : null
  return { cost, value, profit, percent, source }
}

export type InvestmentTotals = {
  /** Market value in USD (buy cost stands in for unpriced holdings). */
  valueUsd: number
  costUsd: number
  profitUsd: number
  percent: number | null
  unpriced: number
}

/** Totals in USD over the given holdings (e.g. one market). */
export function investmentTotals(holdings: Investment[], prices: MarketPrices, khrPerUsd: number): InvestmentTotals {
  let value = 0
  let cost = 0
  let pricedCost = 0
  let pricedValue = 0
  let unpriced = 0
  for (const h of holdings) {
    const p = investmentPnl(h, prices, khrPerUsd)
    const usd = (n: number) => convert(n, h.currency, "USD", khrPerUsd)
    cost += usd(p.cost)
    if (p.value === null) {
      unpriced++
      value += usd(p.cost)
    } else {
      value += usd(p.value)
      pricedValue += usd(p.value)
      pricedCost += usd(p.cost)
    }
  }
  const profit = pricedValue - pricedCost
  return {
    valueUsd: roundMoney(value, "USD"),
    costUsd: roundMoney(cost, "USD"),
    profitUsd: roundMoney(profit, "USD"),
    percent: pricedCost > 0 ? Math.round((profit / pricedCost) * 1000) / 10 : null,
    unpriced,
  }
}

/** Quantity without trailing zeros: 0.01234567, 500, 1.5. */
export function formatQuantity(q: number): string {
  return Number(q.toFixed(8)).toLocaleString("en-US", { maximumFractionDigits: 8 })
}
