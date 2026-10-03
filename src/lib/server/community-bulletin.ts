// Server only: the daily market bulletin for the LuyChlat community channel / group.
import { longDate } from "@/lib/dates"
import { homeGreeting, isMeritDay } from "@/lib/holidays"
import { dictionaries } from "@/lib/i18n/dictionaries"
import type { MarketLive } from "@/lib/market-calc"
import { currentMarket, hasLocalToday, syncMarket } from "@/lib/server/market-sync"
import { botDb, botKey, tg } from "@/lib/server/telegram-bot"
import { tipOfTheDay } from "@/lib/tips"

/**
 * Every morning @luychlat_bot posts one Khmer bulletin to
 * TELEGRAM_COMMUNITY_CHAT_ID (e.g. "@LuyChlatCommunity"; the bot must be an
 * admin of the channel): date and festival, NBC official rates, Phnom Penh
 * gold counter prices (CSNJ via Oknha News, or an admin's /setgold), the tip
 * of the day and a button to open the app.
 *
 * Timing: shops publish around 09:00, so from 09:00 (Cambodia) it posts as
 * soon as today's local gold prices are in; at 10:30 it posts anyway, with the
 * world reference price and a note. Skipped when the chat id isn't set.
 * bot_claim_daily makes it once a day, also across restarts.
 */

const JOB = "community-bulletin"
const FROM_HOUR = 9
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

const fmtUsd = (n: number) => `$${fmt(n, 0)}`

export function bulletinText(date: Date, market: MarketLive | null, today = ymd(date)): string {
  const lines: string[] = [`📅 ${longDate(date, "km")}`]
  const greeting = homeGreeting(date)
  if (greeting.key !== "holiday.everyday") {
    const params = Object.fromEntries(Object.entries(greeting.params ?? {}).map(([k, v]) => [k, kmDigits(String(v))]))
    let text: string = km[greeting.key]
    for (const [k, v] of Object.entries(params)) text = text.replaceAll(`{${k}}`, v)
    lines.push(`${isMeritDay(greeting.key) ? "🙏" : "🎉"} ${text}`)
  }
  const nbc = market?.nbc
  if (nbc) {
    lines.push("", `💵 អត្រាប្ដូរប្រាក់ផ្លូវការ NBC (${kmDigits(nbc.date.split("-").reverse().join("/"))})`)
    for (const code of ["USD", "THB", "VND", "CNY", "EUR"]) {
      const v = nbc.khr_per[code]
      if (v) lines.push(`• 1 ${code} = ${fmt(v, v >= 100 ? 0 : v >= 1 ? 2 : 3)} ៛`)
    }
  }
  const local = market?.local_gold?.date === today ? market.local_gold : null
  const ref = market?.gold?.reference
  if (local) {
    lines.push("", "🪙 តម្លៃមាសហាងក្នុងស្រុក (ក្នុង ១ តម្លឹង)")
    lines.push(`• មាសគីឡូ: លក់ចេញ ${fmtUsd(local.kilo.sell)} | ទិញចូល ${fmtUsd(local.kilo.buy)}`)
    if (local.jewelry) lines.push(`• មាសគ្រឿង: លក់ចេញ ${fmtUsd(local.jewelry.sell)} | ទិញចូល ${fmtUsd(local.jewelry.buy)}`)
    lines.push(local.source === "csnj" ? "ប្រភព៖ ហាងមាសពេជ្រ CSNJ តាមរយៈ Oknha News" : "ប្រភព៖ តម្លៃហាងក្នុងស្រុក ថ្ងៃនេះ")
  } else if (ref) {
    lines.push("", "🪙 តម្លៃយោងមាសទីផ្សារពិភពលោក (ក្នុង ១ តម្លឹង)")
    if (ref.GOLD_24K) lines.push(`• មាសទឹក១០ 24K៖ $${fmt(ref.GOLD_24K, 2)}`)
    if (ref.GOLD_18K) lines.push(`• មាស 18K៖ $${fmt(ref.GOLD_18K, 2)}`)
    lines.push("(តម្លៃហាងក្នុងស្រុកថ្ងៃនេះ មិនទាន់ចេញ — ហាងអាចខុសពីនេះបន្តិច)")
  }
  const tip = tipOfTheDay(date)
  lines.push("", `💡 គន្លឹះថ្ងៃនេះ៖ ${tip.title.km}`, tip.body.km, "", "— លុយឆ្លាត · LuyChlat")
  return lines.join("\n")
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
  const chat = process.env.TELEGRAM_COMMUNITY_CHAT_ID?.trim()
  if (!chat) return false
  const now = phnomPenhNow()
  if (now.hour < FROM_HOUR || now.hour >= LAST_HOUR) return false
  let market = await currentMarket()
  const pastDeadline = now.hour > DEADLINE.hour || (now.hour === DEADLINE.hour && now.minute >= DEADLINE.minute)
  if (!hasLocalToday(market) && !pastDeadline) return false
  const { data: claimed } = await botDb().rpc("bot_claim_daily", { p_key: botKey(), p_job: JOB, p_day: now.day })
  if (claimed !== true) return false

  // Fresh rates if the stored ones are older than 2 hours.
  if (!market || Date.now() - Date.parse(market.fetched_at) > 2 * 3_600_000) market = (await syncMarket(true)) ?? market
  const url = await appUrl()
  const res = await tg("sendMessage", {
    chat_id: chat,
    text: bulletinText(now.date, market, now.day).slice(0, 4000),
    disable_web_page_preview: true,
    ...(url ? { reply_markup: { inline_keyboard: [[{ text: "📱 បើកកម្មវិធីលុយឆ្លាត", url }]] } } : {}),
  })
  if (!res.ok) console.error("[bulletin] send failed:", res.description)
  return res.ok
}
