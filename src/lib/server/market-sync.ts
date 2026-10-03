// Server only: fetches live market rates and stores them for every user.
import { khrPerUnit, NBC_CURRENCIES, referenceRates, type MarketLive } from "@/lib/market-calc"
import { botDb, botKey } from "@/lib/server/telegram-bot"

/**
 * Sources (no API keys):
 *   - NBC official rates: Frankfurter's "NBC" provider (National Bank of
 *     Cambodia, published daily) — https://frankfurter.dev/providers/nbc/
 *   - Gold / platinum spot ($/oz): gold-api.com
 * A source that fails keeps its last stored values. Stored in app_settings
 * "market_live" through bot_set_market (needs the bot key).
 */

const FRANKFURTER = "https://api.frankfurter.dev/v2/rates"
const GOLD_API = "https://api.gold-api.com/price"
const MIN_INTERVAL_MS = 5 * 60_000

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000), headers: { Accept: "application/json" } })
    return res.ok ? ((await res.json()) as T) : null
  } catch {
    return null
  }
}

async function fetchNbc(): Promise<MarketLive["nbc"] | undefined> {
  const quotes = ["KHR", ...NBC_CURRENCIES.filter((c) => c !== "USD")].join(",")
  const rows = await getJson<{ date: string; quote: string; rate: number }[]>(`${FRANKFURTER}?providers=NBC&base=USD&quotes=${quotes}`)
  const khr = rows?.find((r) => r.quote === "KHR")
  if (!rows || !khr || !(khr.rate > 1000 && khr.rate < 10000)) return undefined
  const perUsd = Object.fromEntries(rows.map((r) => [r.quote, r.rate]))
  return { date: khr.date, usd_khr: khr.rate, khr_per: khrPerUnit(khr.rate, perUsd) }
}

async function fetchGold(): Promise<MarketLive["gold"] | undefined> {
  type Price = { price: number; updatedAt: string }
  const [gold, platinum] = await Promise.all([getJson<Price>(`${GOLD_API}/XAU`), getJson<Price>(`${GOLD_API}/XPT`)])
  // Sanity bounds so a broken feed never shows nonsense prices.
  if (!gold || !platinum || !(gold.price > 500 && gold.price < 50_000) || !(platinum.price > 200 && platinum.price < 50_000)) return undefined
  return {
    gold_spot: Math.round(gold.price * 100) / 100,
    platinum_spot: Math.round(platinum.price * 100) / 100,
    updated_at: gold.updatedAt,
    reference: referenceRates(gold.price, platinum.price),
  }
}

let last: MarketLive | null = null
let lastRun = 0
let running: Promise<MarketLive | null> | null = null

/** The last stored data (read once from the database after a restart). */
export async function currentMarket(): Promise<MarketLive | null> {
  if (last) return last
  const { data } = await botDb().from("app_settings").select("value").eq("key", "market_live").maybeSingle()
  last = (data?.value as MarketLive | undefined) ?? null
  return last
}

/** Fetch and store; at most once every 5 minutes (also for the Refresh button). */
export function syncMarket(force = false): Promise<MarketLive | null> {
  if (running) return running
  if (!force && Date.now() - lastRun < MIN_INTERVAL_MS) return currentMarket()
  running = (async () => {
    lastRun = Date.now()
    try {
      const [nbc, gold, previous] = await Promise.all([fetchNbc(), fetchGold(), currentMarket()])
      if (!nbc && !gold) return previous
      const next: MarketLive = { fetched_at: new Date().toISOString(), nbc: nbc ?? previous?.nbc, gold: gold ?? previous?.gold }
      const { error } = await botDb().rpc("bot_set_market", { p_key: botKey(), p_value: next })
      if (error) {
        console.error("[market] store failed:", error.message)
        return previous
      }
      last = next
      return next
    } catch (error) {
      console.error("[market] sync failed:", (error as Error).message)
      return last
    } finally {
      running = null
    }
  })()
  return running
}
