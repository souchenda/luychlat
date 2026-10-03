// Server only: fetches live market rates and stores them for every user.
import dns, { type LookupAddress, type LookupOptions } from "dns"
import https from "https"

import { findCsnjItem, parseCsnjArticle, plausible, type LocalGold } from "@/lib/local-gold"
import { khrPerUnit, NBC_CURRENCIES, referenceRates, type MarketLive } from "@/lib/market-calc"
import { botDb, botKey } from "@/lib/server/telegram-bot"
import { logEvent } from "@/lib/server/events"

/**
 * Sources (no API keys):
 *   - NBC official rates: Frankfurter's "NBC" provider (National Bank of
 *     Cambodia, published daily) — https://frankfurter.dev/providers/nbc/
 *   - Gold / platinum spot ($/oz): gold-api.com
 *   - Phnom Penh counter prices: CSNJ's daily report on Oknha News (RSS feed,
 *     category "តម្លៃមាសប្រចាំថ្ងៃ", published ~09:00), or an admin's /setgold
 * A source that fails keeps its last stored values. Stored in app_settings
 * "market_live" through bot_set_market (needs the bot key).
 */

const FRANKFURTER = "https://api.frankfurter.dev/v2/rates"
const GOLD_API = "https://api.gold-api.com/price"
const OKNHA_FEED = "https://www.oknha.news/feed"
const MIN_INTERVAL_MS = 5 * 60_000

/**
 * Host lookup that asks DNS directly first: in the Alpine (musl) container the
 * system lookup fails for some hosts with large DNS answers (gold-api.com),
 * while a plain A-record query works. Falls back to the normal lookup.
 */
function lookup(hostname: string, options: LookupOptions, callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void) {
  dns.resolve4(hostname, (err, addresses) => {
    if (err || !addresses.length) return dns.lookup(hostname, options, callback as never)
    if (options.all) return callback(null, addresses.map((address) => ({ address, family: 4 })))
    callback(null, addresses[0], 4)
  })
}

function getText(url: string, accept = "application/json"): Promise<string | null> {
  return new Promise((resolve) => {
    const req = https.get(url, { headers: { Accept: accept, "User-Agent": "LuyChlat/1.0 (+market rates)" }, lookup, timeout: 15_000 }, (res) => {
      if (!res.statusCode || res.statusCode >= 300) {
        res.resume()
        return resolve(null)
      }
      let body = ""
      res.setEncoding("utf8")
      res.on("data", (chunk: string) => {
        body += chunk
        if (body.length > 1_000_000) req.destroy()
      })
      res.on("end", () => resolve(body))
    })
    req.on("timeout", () => req.destroy())
    req.on("error", () => resolve(null))
  })
}

async function getJson<T>(url: string): Promise<T | null> {
  const body = await getText(url)
  try {
    return body ? (JSON.parse(body) as T) : null
  } catch {
    return null
  }
}

/** Today in Cambodia (YYYY-MM-DD) and the hour there. */
export function phnomPenhToday() {
  const t = new Date(Date.now() + 7 * 3_600_000)
  return { day: t.toISOString().slice(0, 10), hour: t.getUTCHours(), minute: t.getUTCMinutes() }
}

/** Today's CSNJ prices from the Oknha News feed, if published and plausible. */
async function fetchLocalGold(reference24k: number | null | undefined): Promise<LocalGold | undefined> {
  const xml = await getText(OKNHA_FEED, "application/rss+xml, application/xml, text/xml")
  if (!xml) return undefined
  const item = findCsnjItem(xml, phnomPenhToday().day)
  const parsed = item ? parseCsnjArticle(item.text) : null
  if (!item || !parsed || !plausible(parsed, reference24k)) return undefined
  return { ...parsed, source: "csnj", url: item.url, fetched_at: new Date().toISOString() }
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
  const { data } = await botDb().rpc("bot_get_market", { p_key: botKey() })
  last = (data as MarketLive | null) ?? null
  return last
}

async function store(next: MarketLive): Promise<boolean> {
  const { error } = await botDb().rpc("bot_set_market", { p_key: botKey(), p_value: next })
  if (error) {
    console.error("[market] store failed:", error.message)
    logEvent("error", "market", `Storing market data failed: ${error.message}`, { fold: true })
    return false
  }
  last = next
  return true
}

/**
 * Local prices to keep: an admin's /setgold wins for its day; else today's
 * CSNJ report; else the previous ones (shown with their date).
 */
function pickLocal(previous: LocalGold | undefined, fetched: LocalGold | undefined): LocalGold | undefined {
  const today = phnomPenhToday().day
  if (previous?.source === "manual" && previous.date === today) return previous
  return fetched ?? previous
}

/** /setgold: today's local prices from an admin, or "clear" to go back to the automatic source. */
export async function setManualGold(input: Pick<LocalGold, "kilo" | "jewelry"> | "clear"): Promise<MarketLive | null> {
  const previous = await currentMarket()
  const today = phnomPenhToday().day
  let local: LocalGold | undefined
  if (input === "clear") {
    local = (await fetchLocalGold(previous?.gold?.reference.GOLD_24K)) ?? (previous?.local_gold?.source === "manual" ? undefined : previous?.local_gold)
  } else {
    local = { date: today, kilo: input.kilo, jewelry: input.jewelry ?? previous?.local_gold?.jewelry ?? null, source: "manual", fetched_at: new Date().toISOString() }
  }
  const next: MarketLive = { ...(previous ?? { fetched_at: new Date().toISOString() }), local_gold: local }
  return (await store(next)) ? next : null
}

/** True once today's local prices are in (from CSNJ or /setgold). */
export const hasLocalToday = (m: MarketLive | null | undefined) => m?.local_gold?.date === phnomPenhToday().day

let lastLocalTry = 0
/** 09:00–11:00 Cambodia time: look for today's CSNJ report every 5 minutes until it's in. */
export async function maybeRefreshLocalGold() {
  const { hour } = phnomPenhToday()
  if (hour < 9 || hour >= 11 || Date.now() - lastLocalTry < 5 * 60_000) return
  if (hasLocalToday(await currentMarket())) return
  lastLocalTry = Date.now()
  await syncMarket(true)
}

/** Fetch and store; at most once every 5 minutes (also for the Refresh button). */
export function syncMarket(force = false): Promise<MarketLive | null> {
  if (running) return running
  if (!force && Date.now() - lastRun < MIN_INTERVAL_MS) return currentMarket()
  running = (async () => {
    lastRun = Date.now()
    try {
      const [nbc, gold, previous] = await Promise.all([fetchNbc(), fetchGold(), currentMarket()])
      const local = await fetchLocalGold((gold ?? previous?.gold)?.reference.GOLD_24K)
      if (!nbc) logEvent("warn", "nbc", "NBC rates unavailable (Frankfurter) — keeping the last ones", { fold: true })
      if (!gold) logEvent("warn", "gold-spot", "World gold price unavailable (gold-api.com) — keeping the last one", { fold: true })
      if (!nbc && !gold && !local) return previous
      const next: MarketLive = {
        fetched_at: new Date().toISOString(),
        nbc: nbc ?? previous?.nbc,
        gold: gold ?? previous?.gold,
        local_gold: pickLocal(previous?.local_gold, local),
      }
      return (await store(next)) ? next : previous
    } catch (error) {
      console.error("[market] sync failed:", (error as Error).message)
      logEvent("error", "market", `Market sync failed: ${(error as Error).message}`, { fold: true })
      return last
    } finally {
      running = null
    }
  })()
  return running
}
