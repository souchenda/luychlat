// Server only: the daily market bulletin for the LuyChlat community channel / group.
import { longDate } from "@/lib/dates"
import { homeGreeting, isMeritDay } from "@/lib/holidays"
import { dictionaries } from "@/lib/i18n/dictionaries"
import type { MarketLive } from "@/lib/market-calc"
import { currentMarket, hasLocalToday, syncMarket } from "@/lib/server/market-sync"
import { botDb, botKey, tg } from "@/lib/server/telegram-bot"
import { tipOfTheDay } from "@/lib/tips"
import { logEvent } from "@/lib/server/events"

/**
 * Every morning @luychlat_bot posts one Khmer "daily market update" to the
 * community channel — TELEGRAM_COMMUNITY_CHAT_ID or TELEGRAM_COMMUNITY_CHANNEL_ID
 * (e.g. "@LuyChlatCommunity"; the bot must be an admin of the channel): date
 * and festival, NBC official rates with their "As of" day, Phnom Penh gold
 * counter prices per damlung and per chi (CSNJ via Oknha News, or an admin's
 * /setgold), the tip of the day, and buttons to calculate with the bot and to
 * open the app.
 *
 * Timing: from 08:30 (Cambodia) it posts as soon as today's local gold prices
 * are in (shops publish around 09:00); at 10:30 it posts anyway, with the
 * world reference price and a note. In the evening (17:00–19:30), once NBC's
 * rate for the next working day is in, a short rates post follows. Skipped
 * when no channel is set. bot_claim_daily makes each once a day, also across
 * restarts.
 */

const JOB = "community-bulletin"
const EVENING_JOB = "community-nbc-evening"
const FROM = { hour: 8, minute: 30 }
/** Post without local prices from 10:30. */
const DEADLINE = { hour: 10, minute: 30 }
/** Never after 11:00 (e.g. the server was down all morning). */
const LAST_HOUR = 11
const km = dictionaries.km

/** Now in Cambodia (no daylight saving): a Date whose local fields are Phnom Penh's. */
function phnomPenhNow() {
  const t = new Date(Date.now() + 7 * 3_600_000)
  return { date: new Date(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), 12), hour: t.getUTCHours(), minute: t.getUTCMinutes(), day: t.toISOString().slice(0, 10) }
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

const kmDigits = (s: string) => s.replace(/\d/g, (d) => "០១២៣៤៥៦៧៨៩"[Number(d)])
const fmt = (n: number, digits = 0) => new Intl.NumberFormat("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n)

/** Gold prices in whole dollars, as Cambodian shops quote them. */
const fmtUsd = (n: number) => `$${fmt(n, 0)}`

/** The community channel, from either variable name. */
const communityChat = () => (process.env.TELEGRAM_COMMUNITY_CHAT_ID ?? process.env.TELEGRAM_COMMUNITY_CHANNEL_ID)?.trim() || null

/** "• 1 USD = 4,057 ៛", per 1,000 / 100 units for small currencies ("• 1,000 VND = 157 ៛"). */
const rateLine = (code: string, v: number) => {
  const unit = v < 1 ? 1000 : v < 10 ? 100 : 1
  return `• ${fmt(unit)} ${code} = ${fmt(v * unit, v * unit >= 100 ? 0 : 2)} ៛`
}
const asOf = (iso: string) => kmDigits(iso.split("-").reverse().join("/"))
const CTA = "🧮 គណនាផ្ទាល់ជាមួយ @luychlat_bot៖ ផ្ញើ «/rate 100 usd» ឬ «/gold 2 ជី»"

export function bulletinText(date: Date, market: MarketLive | null, today = ymd(date)): string {
  const lines: string[] = ["📊 ព័ត៌មានទីផ្សារប្រចាំថ្ងៃ · LuyChlat", `📅 ${longDate(date, "km")}`]
  const greeting = homeGreeting(date)
  if (greeting.key !== "holiday.everyday") {
    const params = Object.fromEntries(Object.entries(greeting.params ?? {}).map(([k, v]) => [k, kmDigits(String(v))]))
    let text: string = km[greeting.key]
    for (const [k, v] of Object.entries(params)) text = text.replaceAll(`{${k}}`, v)
    lines.push(`${isMeritDay(greeting.key) ? "🙏" : "🎉"} ${text}`)
  }
  const nbc = market?.nbc
  if (nbc) {
    lines.push("", `💵 អត្រាប្ដូរប្រាក់ផ្លូវការ NBC (គិតត្រឹម ${asOf(nbc.date)})`)
    for (const code of ["USD", "THB", "VND", "CNY", "EUR"]) {
      const v = nbc.khr_per[code]
      if (v) lines.push(rateLine(code, v))
    }
  }
  const local = market?.local_gold?.date === today ? market.local_gold : null
  const ref = market?.gold?.reference
  if (local) {
    lines.push("", "🪙 តម្លៃមាសហាងក្នុងស្រុក (ក្នុង ១ តម្លឹង)")
    lines.push(`• មាសគីឡូ: លក់ចេញ ${fmtUsd(local.kilo.sell)} | ទិញចូល ${fmtUsd(local.kilo.buy)}`)
    lines.push(`  ក្នុង ១ ជី៖ លក់ចេញ $${fmt(local.kilo.sell / 10)} | ទិញចូល $${fmt(local.kilo.buy / 10)}`)
    if (local.jewelry) lines.push(`• មាសគ្រឿង: លក់ចេញ ${fmtUsd(local.jewelry.sell)} | ទិញចូល ${fmtUsd(local.jewelry.buy)}`)
    lines.push(local.source === "csnj" ? "ប្រភព៖ ហាងមាសពេជ្រ CSNJ តាមរយៈ Oknha News" : "ប្រភព៖ តម្លៃហាងក្នុងស្រុក ថ្ងៃនេះ")
  } else if (ref) {
    lines.push("", "🪙 តម្លៃយោងមាសទីផ្សារពិភពលោក (ក្នុង ១ តម្លឹង)")
    if (ref.GOLD_24K) lines.push(`• មាសទឹក១០ 24K៖ $${fmt(ref.GOLD_24K)}`)
    if (ref.GOLD_18K) lines.push(`• មាស 18K៖ $${fmt(ref.GOLD_18K)}`)
    lines.push("(ចំណាំ៖ ជាតម្លៃយោងទីផ្សារអន្តរជាតិ — តម្លៃជាក់ស្តែងអាចមានការប្រែប្រួលទៅតាមបណ្តាហាងមាសក្នុងស្រុក)")
  }
  const tip = tipOfTheDay(date)
  lines.push("", `💡 គន្លឹះថ្ងៃនេះ៖ ${tip.title.km}`, tip.body.km, "", CTA, "", "— លុយឆ្លាត · LuyChlat")
  return lines.join("\n")
}

/** Evening: NBC's rate for the next working day (published ~16:30). */
export function eveningRatesText(market: MarketLive): string | null {
  const nbc = market.nbc
  if (!nbc) return null
  const lines = [`💵 អត្រាប្ដូរប្រាក់ផ្លូវការ NBC សម្រាប់ថ្ងៃ ${asOf(nbc.date)}`]
  for (const code of ["USD", "THB", "VND", "CNY", "EUR"]) {
    const v = nbc.khr_per[code]
    if (v) lines.push(rateLine(code, v))
  }
  lines.push("", "ធនាគារជាតិនៃកម្ពុជា ចេញអត្រាសម្រាប់ថ្ងៃធ្វើការបន្ទាប់ ប្រហែលម៉ោង ៤:៣០ ល្ងាច។", "", CTA, "", "— លុយឆ្លាត · LuyChlat")
  return lines.join("\n")
}

/** Buttons under a post: calculate with the bot, and open the app. */
async function postButtons() {
  const [url, me] = await Promise.all([appUrl(), tg<{ username?: string }>("getMe", {})])
  const row = [
    ...(me.result?.username ? [{ text: "🤖 គណនាជាមួយ Bot", url: `https://t.me/${me.result.username}` }] : []),
    ...(url ? [{ text: "📱 បើកកម្មវិធី", url }] : []),
  ]
  return row.length ? { reply_markup: { inline_keyboard: [row] } } : {}
}

/** The app's public address: PUBLIC_URL, else the origin of the bot's webhook. */
async function appUrl(): Promise<string | null> {
  const fromEnv = process.env.PUBLIC_URL?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, "")
  const info = await tg<{ url?: string }>("getWebhookInfo", {})
  try {
    return info.result?.url ? new URL(info.result.url).origin : null
  } catch {
    return null
  }
}

/** Called every minute by the dispatcher; posts once a day (see the timing above). */
export async function sendCommunityBulletin(): Promise<boolean> {
  const chat = communityChat()
  if (!chat) return false
  const now = phnomPenhNow()
  await maybeSendEveningRates(chat, now)
  if (now.hour < FROM.hour || (now.hour === FROM.hour && now.minute < FROM.minute) || now.hour >= LAST_HOUR) return false
  let market = await currentMarket()
  const pastDeadline = now.hour > DEADLINE.hour || (now.hour === DEADLINE.hour && now.minute >= DEADLINE.minute)
  if (!hasLocalToday(market) && !pastDeadline) return false
  const { data: claimed } = await botDb().rpc("bot_claim_daily", { p_key: botKey(), p_job: JOB, p_day: now.day })
  if (claimed !== true) return false

  // Fresh rates if the stored ones are older than 2 hours.
  if (!market || Date.now() - Date.parse(market.fetched_at) > 2 * 3_600_000) market = (await syncMarket(true)) ?? market
  const res = await tg("sendMessage", {
    chat_id: chat,
    text: bulletinText(now.date, market, now.day).slice(0, 4000),
    disable_web_page_preview: true,
    ...(await postButtons()),
  })
  if (!res.ok) console.error("[bulletin] send failed:", res.description)
  logEvent(res.ok ? "info" : "error", "bulletin", res.ok ? `Daily bulletin sent to ${chat}${hasLocalToday(market) ? "" : " (no local gold prices yet)"}` : `Daily bulletin failed: ${res.description ?? "unknown"}`)
  return res.ok
}

/** 17:00–19:30: once NBC's next-working-day rate is in, post it (once a day). */
async function maybeSendEveningRates(chat: string, now: ReturnType<typeof phnomPenhNow>) {
  // Working days only: NBC publishes Monday–Friday (a weekend would repeat Friday's rate).
  if ([0, 6].includes(now.date.getDay())) return
  if (now.hour < 17 || now.hour > 19 || (now.hour === 19 && now.minute > 30)) return
  const market = await currentMarket()
  if (!market?.nbc || market.nbc.date <= now.day) return
  const text = eveningRatesText(market)
  if (!text) return
  const { data: claimed } = await botDb().rpc("bot_claim_daily", { p_key: botKey(), p_job: EVENING_JOB, p_day: now.day })
  if (claimed !== true) return
  const res = await tg("sendMessage", { chat_id: chat, text, disable_web_page_preview: true, ...(await postButtons()) })
  logEvent(res.ok ? "info" : "error", "bulletin", res.ok ? `Evening NBC rates sent to ${chat} (as of ${market.nbc.date})` : `Evening NBC post failed: ${res.description ?? "unknown"}`)
}
