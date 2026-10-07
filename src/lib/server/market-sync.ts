// Server only: fetches live market rates and stores them for every user.
import dns, { type LookupAddress, type LookupOptions } from "dns"
import https from "https"

import { findCsnjItem, parseCsnjArticle, plausible, type LocalGold } from "@/lib/local-gold"
import { khrPerUnit, NBC_CURRENCIES, nextWorkingDay, pickNbc, referenceRates, type FuelPrices, type MarketLive, type NbcRates } from "@/lib/market-calc"
import { parseNbcPage } from "@/lib/nbc"
import { botDb, botKey, tg } from "@/lib/server/telegram-bot"
import { logEvent } from "@/lib/server/events"

/**
 * Sources (no API keys):
 *   - NBC official rates: the National Bank of Cambodia's own page
 *     (nbc.gov.kh exchange_rate.php — today's rate, and from 16:00 the next
 *     working day's through its date form); Frankfurter's NBC mirror only as a
 *     fallback (it lags: on 07/10/2026 it still served 06/10's 4,061)
 *   - Gold / platinum spot ($/oz): gold-api.com
 *   - Phnom Penh counter prices: CSNJ's daily report on Oknha News (RSS feed,
 *     category "តម្លៃមាសប្រចាំថ្ងៃ", published ~09:00), or an admin's /setgold
 * A source that fails keeps its last stored values. Stored in app_settings
 * "market_live" through bot_set_market (needs the bot key).
 */

const FRANKFURTER = "https://api.frankfurter.dev/v2/rates"
const NBC_PAGE = "https://www.nbc.gov.kh/english/economic_research/exchange_rate.php"
// nbc.gov.kh answers 403 to non-browser clients.
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36"
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
  const xml = await withRetries(() => getText(OKNHA_FEED, "application/rss+xml, application/xml, text/xml"))
  if (!xml) {
    sourceStatus.local = { ok: false, at: Date.now(), detail: "Oknha News feed unreachable" }
    return undefined
  }
  const item = findCsnjItem(xml, phnomPenhToday().day)
  const parsed = item ? parseCsnjArticle(item.text) : null
  if (!item || !parsed || !plausible(parsed, reference24k)) return undefined
  sourceStatus.local = { ok: true, at: Date.now(), detail: item.url }
  return { ...parsed, source: "csnj", url: item.url, fetched_at: new Date().toISOString() }
}

/** One HTTPS request (GET, or POST with a form) — status, body and cookies. */
function request(url: string, opts: { form?: Record<string, string>; cookie?: string; referer?: string } = {}): Promise<{ status: number; body: string; cookies: string[] } | null> {
  return new Promise((resolve) => {
    const data = opts.form ? new URLSearchParams(opts.form).toString() : null
    const req = https.request(
      url,
      {
        method: data ? "POST" : "GET",
        lookup,
        timeout: 20_000,
        headers: {
          "User-Agent": BROWSER_UA,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
          ...(opts.cookie ? { Cookie: opts.cookie } : {}),
          ...(opts.referer ? { Referer: opts.referer } : {}),
          ...(data ? { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        let body = ""
        res.setEncoding("utf8")
        res.on("data", (chunk: string) => {
          body += chunk
          if (body.length > 1_000_000) req.destroy()
        })
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body, cookies: (res.headers["set-cookie"] ?? []).map((c) => c.split(";")[0]) }))
      },
    )
    req.on("timeout", () => req.destroy())
    req.on("error", () => resolve(null))
    if (data) req.write(data)
    req.end()
  })
}

/** Up to 3 tries (2 retries, 2 s then 5 s apart) of something that may fail. */
async function withRetries<T>(run: () => Promise<T | null>): Promise<T | null> {
  for (const wait of [0, 2_000, 5_000]) {
    if (wait) await new Promise((r) => setTimeout(r, wait))
    const result = await run().catch(() => null)
    if (result) return result
  }
  return null
}

/** How the last NBC / gold fetch went — for the integrity alerts. */
export const sourceStatus = {
  nbc: { ok: true, at: 0, detail: "" },
  local: { ok: true, at: 0, detail: "" },
}

/**
 * NBC's own page: the latest rate it shows and, from 16:00, the next working
 * day's (asked through its date form). "unpublished" = the page answered but
 * has no rate for that day yet — not a failure.
 */
async function fetchNbcDirect(): Promise<NbcRates | "unpublished" | null> {
  const page = await withRetries(async () => {
    const r = await request(NBC_PAGE)
    return r && r.status === 200 && parseNbcPage(r.body) ? r : null
  })
  if (!page) return null
  const latest = parseNbcPage(page.body)!
  const stamp = { source: "nbc" as const, fetched_at: new Date().toISOString() }
  const { day, hour } = phnomPenhToday()
  if (hour < 16 || latest.date > day) return { ...latest, ...stamp }
  // Evening: the next working day's rate, once NBC has issued it (~16:30).
  const tk = /name="tk" value="([^"]*)"/.exec(page.body)?.[1]
  const next = nextWorkingDay(day)
  if (!tk) return { ...latest, ...stamp }
  const posted = await withRetries(async () => {
    const r = await request(NBC_PAGE, { form: { exdate: next, tk, view: "View" }, cookie: page.cookies.join("; "), referer: NBC_PAGE })
    return r && r.status === 200 ? r : null
  })
  const tomorrow = posted ? parseNbcPage(posted.body) : null
  return tomorrow && tomorrow.date === next ? { ...tomorrow, ...stamp } : { ...latest, ...stamp }
}

/** Frankfurter's NBC mirror (fallback; it can lag a day). */
async function fetchNbcMirror(): Promise<NbcRates | undefined> {
  const quotes = ["KHR", ...NBC_CURRENCIES.filter((c) => c !== "USD")].join(",")
  const rows = await getJson<{ date: string; quote: string; rate: number }[]>(`${FRANKFURTER}?providers=NBC&base=USD&quotes=${quotes}`)
  const khr = rows?.find((r) => r.quote === "KHR")
  if (!rows || !khr || !(khr.rate > 1000 && khr.rate < 10000)) return undefined
  const perUsd = Object.fromEntries(rows.map((r) => [r.quote, r.rate]))
  return { date: khr.date, usd_khr: khr.rate, khr_per: khrPerUnit(khr.rate, perUsd), source: "frankfurter", fetched_at: new Date().toISOString() }
}

/** NBC's page first; the mirror only when the page can't be read, and the newer "As of" day wins. */
export async function fetchNbc(): Promise<MarketLive["nbc"] | undefined> {
  const direct = await fetchNbcDirect()
  if (direct && direct !== "unpublished") {
    sourceStatus.nbc = { ok: true, at: Date.now(), detail: `${direct.date} ${direct.usd_khr}` }
    return direct
  }
  const mirror = await fetchNbcMirror()
  sourceStatus.nbc = { ok: false, at: Date.now(), detail: `nbc.gov.kh unreadable${mirror ? `; mirror ${mirror.date} ${mirror.usd_khr}` : "; mirror failed too"}` }
  logEvent("warn", "nbc", `nbc.gov.kh unreadable after retries — ${mirror ? `using Frankfurter (${mirror.date})` : "keeping the last rate"}`, { fold: true })
  return mirror
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
let lastRead = 0
let lastRun = 0
let running: Promise<MarketLive | null> | null = null

/** How long the stored data is trusted before it is read again (the other deploy slot, or a change made in the database). */
const READ_TTL_MS = 60_000

/** The stored data, re-read from the database at most once a minute. */
export async function currentMarket(): Promise<MarketLive | null> {
  if (last && Date.now() - lastRead < READ_TTL_MS) return last
  const { data, error } = await botDb().rpc("bot_get_market", { p_key: botKey() })
  // A failed read keeps what we had rather than blanking the bulletin.
  if (!error) {
    last = (data as MarketLive | null) ?? null
    lastRead = Date.now()
  }
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
  lastRead = Date.now()
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

/** /setrate: NBC's newer official USD rate entered by an admin, or "clear" to go back to the automatic source. */
export async function setManualRate(input: { usd_khr: number; date: string } | "clear"): Promise<MarketLive | null> {
  const previous = await currentMarket()
  let nbc: NbcRates | undefined
  if (input === "clear") {
    nbc = (await fetchNbc()) ?? (previous?.nbc?.source === "manual" ? undefined : previous?.nbc)
  } else {
    const base = previous?.nbc
    nbc = {
      date: input.date,
      usd_khr: input.usd_khr,
      khr_per: { ...(base?.khr_per ?? {}), USD: input.usd_khr },
      source: "manual",
      fetched_at: new Date().toISOString(),
      others_date: base?.source === "manual" ? base.others_date : base?.date,
    }
  }
  const next: MarketLive = { ...(previous ?? { fetched_at: new Date().toISOString() }), nbc }
  return (await store(next)) ? next : null
}

/** /setfuel and /admin: the MoC fuel and gas prices for a 10-day cycle. */
export async function setFuelPrices(input: Omit<FuelPrices, "source" | "updated_at">): Promise<MarketLive | null> {
  const previous = await currentMarket()
  const fuel: FuelPrices = { ...input, source: "manual", updated_at: new Date().toISOString() }
  const next: MarketLive = { ...(previous ?? { fetched_at: new Date().toISOString() }), fuel }
  return (await store(next)) ? next : null
}

/** NBC checks: morning verification 08:00 / 08:30, and 16:30 / 17:00 / 17:30 for the next working day's rate. */
export const NBC_SLOTS = ["08:00", "08:30", "16:30", "17:00", "17:30"]
/** Local gold: every 15 minutes 09:00–10:15 until today's prices are in. */
export const GOLD_SLOTS = ["09:00", "09:15", "09:30", "09:45", "10:00", "10:15"]

/** The slot due at this time ("HH:MM"), if any. */
export const dueSlot = (slots: string[], hour: number, minute: number) => slots.find((s) => s === `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`) ?? null

const ranSlots = new Set<string>()
/** Runs a slot once (per process and, through bot_claim_daily, across restarts / both deploy slots). */
async function claimSlot(kind: string, day: string, slot: string) {
  const key = `${kind}:${day}:${slot}`
  if (ranSlots.has(key)) return false
  ranSlots.add(key)
  if (ranSlots.size > 200) ranSlots.delete(ranSlots.values().next().value!)
  const { data } = await botDb().rpc("bot_claim_daily", { p_key: botKey(), p_job: `market-${kind}-${slot}`, p_day: day })
  return data === true
}

/**
 * "No silent failures": a priority alert to the super admins' linked chats,
 * once a day per source.
 */
async function integrityAlert(kind: "nbc" | "gold", day: string, detail: string) {
  const db = botDb()
  const { data: claimed } = await db.rpc("bot_claim_daily", { p_key: botKey(), p_job: `integrity-${kind}`, p_day: day })
  if (claimed !== true) return
  const what = kind === "nbc" ? "អត្រាប្តូរប្រាក់ NBC" : "តម្លៃមាសក្នុងស្រុក"
  const text = [
    `⚠️ [ការព្រមានសុក្រឹតភាព] មិនអាចទាញយកទិន្នន័យ ${what} ថ្ងៃនេះបានទេ! ប្រព័ន្ធកំពុងរក្សាទិន្នន័យចាស់។`,
    "",
    `• ${detail}`,
    kind === "nbc" ? "• កែដោយដៃ៖ /setrate <អត្រា> (ឬ Admin › អត្រា NBC)" : "• កែដោយដៃ៖ /setgold <លក់> <ទិញ> (ឬ Admin › តម្លៃមាស)",
  ].join("\n")
  const { data: chats } = await db.rpc("bot_super_admin_chats", { p_key: botKey() })
  for (const c of (chats as { chat_id: number }[] | null) ?? []) await tg("sendMessage", { chat_id: Number(c.chat_id), text }).catch(() => null)
  logEvent("error", kind === "nbc" ? "nbc" : "local-gold", `Integrity alert sent: ${detail}`)
}

/** Called every minute by the dispatcher: the NBC and gold schedules, and their alerts. */
export async function marketScheduleTick() {
  const { day, hour, minute } = phnomPenhToday()
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay()
  const working = weekday !== 0 && weekday !== 6

  const nbcSlot = dueSlot(NBC_SLOTS, hour, minute)
  if (nbcSlot && (hour < 12 || working) && (await claimSlot("nbc", day, nbcSlot))) {
    await syncMarket(true)
    const nbc = (await currentMarket())?.nbc
    // Morning: today's rate must be in on a working day; evening (last slot): NBC unreadable.
    if (nbcSlot === "08:30" && working && !sourceStatus.nbc.ok)
      await integrityAlert("nbc", day, `nbc.gov.kh មិនឆ្លើយតប (បានសាក ៣ ដង) — កំពុងបង្ហាញ ${nbc ? `${nbc.usd_khr}៛ គិតត្រឹម ${nbc.date}` : "គ្មានអត្រា"}`)
    if (nbcSlot === "17:30" && !sourceStatus.nbc.ok)
      await integrityAlert("nbc", day, `nbc.gov.kh មិនឆ្លើយតបនៅល្ងាច (បានសាក ៣ ដង) — អត្រាថ្ងៃធ្វើការបន្ទាប់មិនទាន់ទទួលបាន`)
  }

  const goldSlot = dueSlot(GOLD_SLOTS, hour, minute)
  if (goldSlot && !hasLocalToday(await currentMarket()) && (await claimSlot("gold", day, goldSlot))) {
    await syncMarket(true)
    if (goldSlot === GOLD_SLOTS[GOLD_SLOTS.length - 1] && !hasLocalToday(await currentMarket())) {
      const local = (await currentMarket())?.local_gold
      await integrityAlert("gold", day, `${sourceStatus.local.ok ? "CSNJ មិនទាន់ចេញតម្លៃថ្ងៃនេះ" : sourceStatus.local.detail} — កំពុងបង្ហាញ ${local ? `តម្លៃថ្ងៃ ${local.date}` : "តម្លៃយោងពិភពលោក"}`)
    }
  }
}

/** True once today's local prices are in (from CSNJ or /setgold). */
export const hasLocalToday = (m: MarketLive | null | undefined) => m?.local_gold?.date === phnomPenhToday().day


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
        nbc: pickNbc(previous?.nbc, nbc),
        gold: gold ?? previous?.gold,
        local_gold: pickLocal(previous?.local_gold, local),
        // Entered by an admin; kept until replaced.
        fuel: previous?.fuel,
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
