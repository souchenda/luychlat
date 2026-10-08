// Server only: the daily market bulletin for the LuyChlat community channel / group.
import { longDate } from "@/lib/dates"
import { homeGreeting, isMeritDay } from "@/lib/holidays"
import { dictionaries, type Locale, type MessageKey } from "@/lib/i18n/dictionaries"
import { fuelLines } from "@/lib/bot/fuel"
import type { MarketLive } from "@/lib/market-calc"
import { currentMarket, hasLocalToday, syncMarket } from "@/lib/server/market-sync"
import { botDb, botKey, tg } from "@/lib/server/telegram-bot"
import { getChannelPostButtons } from "@/lib/server/channel-buttons"
import { logEvent } from "@/lib/server/events"

/**
 * Every morning @luychlat_bot posts one Khmer "daily market update" to the
 * community channel — TELEGRAM_COMMUNITY_CHAT_ID or TELEGRAM_COMMUNITY_CHANNEL_ID
 * (e.g. "@LuyChlatCommunity"; the bot must be an admin of the channel): date
 * and festival, NBC official rates with their "As of" day, Phnom Penh gold
 * counter prices per damlung and per chi (CSNJ via Oknha News, or an admin's
 * /setgold), MoC fuel & gas prices (always: "—" until an admin enters them),
 * and buttons to calculate with the bot and to open the app. Market data only
 * — no tips (founder's rule; tips stay in the app and the weekly digest).
 *
 * Timing: from 09:30 (Cambodia) it posts as soon as today's local gold prices
 * are in (shops publish around 09:00); at 10:30 it posts anyway, with the
 * world reference price and a note. (07:00 morning tip and 20:00 check-in:
 * community-routine.ts.) In the evening (17:00–19:30), once NBC's
 * rate for the next working day is in, a short rates post follows. Skipped
 * when no channel is set. bot_claim_daily makes each once a day, also across
 * restarts.
 */

const JOB = "community-bulletin"
const EVENING_JOB = "community-nbc-evening"
const FROM = { hour: 9, minute: 30 }
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

/** "🔄 ធ្វើបច្ចុប្បន្នភាព៖ ម៉ោង ១០:៥១" — on a post edited after fresher data came in. */
const PP_TIME = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Phnom_Penh", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
const updatedLine = (at: Date) => `🔄 ធ្វើបច្ចុប្បន្នភាព៖ ម៉ោង ${kmDigits(PP_TIME.format(at))}`

/** Telegram HTML: text from data (a holiday's name) can't change the markup. */
const html = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

/** The approved rate block: flags and aligned columns in a monospaced block (Telegram HTML). */
function ratesBlock(nbc: NonNullable<MarketLive["nbc"]>): string {
  const rows: string[] = []
  for (const code of ["USD", "CNY", "EUR", "VND", "MYR", "THB"]) {
    const v = nbc.khr_per[code]
    if (!v) continue
    const unit = v < 1 ? 1000 : v < 10 ? 100 : 1
    const label = `${fmt(unit)} ${code}`.padEnd(11)
    const value = fmt(v * unit, v * unit >= 100 ? 0 : 2).padStart(6)
    rows.push(`${FLAGS[code] ?? "💱"} ${label} = ${value} ៛`)
  }
  return `<pre>${rows.join("\n")}</pre>`
}

const SIGNUP = "✨ ចុះឈ្មោះប្រើកម្មវិធីដោយឥតគិតថ្លៃ ដើម្បីទទួលបានមុខងារឆ្លាតៗជាច្រើនទៀត! 👇👇"

/**
 * 09:30 daily market post — the channel's one market template (Telegram HTML), the
 * same as the evening NBC post: date (and the day's holiday), NBC rates with flags in
 * aligned columns, the app's gold price per damlung, the free sign-up line.
 */
export function bulletinText(date: Date, market: MarketLive | null, updatedAt?: Date): string {
  const lines: string[] = ["📊 <b>ព័ត៌មានទីផ្សារប្រចាំថ្ងៃ</b>", `📅 ${html(longDate(date, "km"))}`]
  const greeting = homeGreeting(date)
  if (greeting.key !== "holiday.everyday") {
    const params = Object.fromEntries(Object.entries(greeting.params ?? {}).map(([k, v]) => [k, kmDigits(String(v))]))
    let text: string = km[greeting.key]
    for (const [k, v] of Object.entries(params)) text = text.replaceAll(`{${k}}`, v)
    lines.push(`${isMeritDay(greeting.key) ? "🙏" : "🎉"} ${html(text)}`)
  }
  const nbc = market?.nbc
  if (nbc) {
    lines.push("", `💵 <b>អត្រាប្តូរប្រាក់ផ្លូវការ (NBC)</b> · គិតត្រឹម ${asOf(nbc.date)}`, "", ratesBlock(nbc), "ℹ️ អត្រាចេញផ្សាយដោយ ធនាគារជាតិនៃកម្ពុជា")
  }
  // Gold: the same figure as the app (the latest local kilo price per damlung).
  if (market) lines.push(...goldLine(market))
  lines.push("", SIGNUP, ...(updatedAt ? ["", updatedLine(updatedAt)] : []))
  return lines.join("\n")
}

/** Evening: NBC's rate for the next working day (published ~16:30). */
const FLAGS: Record<string, string> = { USD: "🇺🇸", CNY: "🇨🇳", EUR: "🇪🇺", VND: "🇻🇳", MYR: "🇲🇾", THB: "🇹🇭" }

/**
 * Evening: NBC's rate for the next working day (published ~16:30), as Telegram
 * HTML — the rates in a monospaced block so the columns line up:
 *
 *   💵 អត្រាប្តូរប្រាក់ផ្លូវការ (NBC)
 *   📅 សម្រាប់ថ្ងៃទី 08/10/2026
 *   🇺🇸 1 USD       =  4,066 ៛
 *   🇻🇳 1,000 VND   =    158 ៛
 *   ℹ️ … ✨ sign up for the app
 */
export function eveningRatesText(market: MarketLive, updatedAt?: Date): string | null {
  const nbc = market.nbc
  if (!nbc) return null
  const lines = [
    "💵 <b>អត្រាប្តូរប្រាក់ផ្លូវការ (NBC)</b>",
    `📅 សម្រាប់ថ្ងៃទី ${nbc.date.split("-").reverse().join("/")}`,
    "",
    ratesBlock(nbc),
    "ℹ️ អត្រាចេញផ្សាយដោយ ធនាគារជាតិនៃកម្ពុជា",
    // Local anchor beside the rates: today's kilo gold (CSNJ / admin), when recent.
    ...goldLine(market),
    "",
    SIGNUP,
    ...(updatedAt ? ["", updatedLine(updatedAt)] : []),
  ]
  return lines.join("\n")
}

/** "🪙 មាសគីឡូ (០៧/១០)៖ $5,030 / តម្លឹង" — the local selling price per damlung, if from the last 3 days. */
function goldLine(market: MarketLive): string[] {
  const g = market.local_gold
  if (!g?.kilo?.sell) return []
  const age = (Date.now() - Date.parse(`${g.date}T12:00:00+07:00`)) / 86_400_000
  if (!(age < 3)) return []
  const [, m, d] = g.date.split("-")
  return [`🪙 មាសគីឡូ (${kmDigits(`${d}/${m}`)})៖ $${fmt(g.kilo.sell)} / តម្លឹង`]
}

/**
 * Posts a market update and removes the previous one, so the channel never
 * shows outdated rates: the new post goes out first, then the old one is
 * deleted (a failure there — already deleted by hand, too old — is ignored).
 * The last post's id is kept in the database (survives restarts).
 */
async function postReplacing(chat: string, payload: Record<string, unknown>, kind: "bulletin" | "evening" = "bulletin") {
  const res = await tg<{ message_id: number }>("sendMessage", { chat_id: chat, ...payload })
  if (!res.ok || !res.result) return res
  const db = botDb()
  try {
    const { data } = await db.rpc("bot_kv_get", { p_key: botKey(), p_name: "community_posts" })
    const last = data as { chat?: string; message_id?: number } | null
    if (last?.message_id && last.chat === chat && last.message_id !== res.result.message_id) {
      const del = await tg("deleteMessage", { chat_id: chat, message_id: last.message_id })
      if (!del.ok) logEvent("warn", "bulletin", `Could not delete the previous post (${del.description ?? "unknown"}) — continuing`, { fold: true })
    }
  } catch {
    // Never let the clean-up stop the update.
  }
  const day = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10)
  await db.rpc("bot_kv_set", {
    p_key: botKey(),
    p_name: "community_posts",
    p_value: { chat, message_id: res.result.message_id, at: new Date().toISOString(), kind, day, sig: String(payload.text ?? "") },
  })
  return res
}


/** The app's public address: PUBLIC_URL, else the origin of the bot's webhook. */
export async function appUrl(): Promise<string | null> {
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
  await nudgeFuelPrices(market, now.day)
  const res = await postReplacing(chat, {
    text: bulletinText(now.date, market).slice(0, 4000),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(await getChannelPostButtons()),
  })
  if (!res.ok) console.error("[bulletin] send failed:", res.description)
  logEvent(res.ok ? "info" : "error", "bulletin", res.ok ? `Daily bulletin sent to ${chat}${hasLocalToday(market) ? "" : " (no local gold prices yet)"}` : `Daily bulletin failed: ${res.description ?? "unknown"}`)
  return res.ok
}

/**
 * No fuel prices for the current 10-day cycle: tell the admins (their linked
 * chats), once a day, so the bulletin's fuel section gets real numbers.
 */
async function nudgeFuelPrices(market: MarketLive | null, day: string) {
  const fuel = market?.fuel
  if (fuel && fuel.to >= day) return
  const db = botDb()
  const { data: claimed } = await db.rpc("bot_claim_daily", { p_key: botKey(), p_job: "fuel-nudge", p_day: day })
  if (claimed !== true) return
  const { data: chats } = await db.rpc("bot_admin_chats", { p_key: botKey() })
  const text = [
    fuel ? "⛽ តម្លៃប្រេងក្នុង Bulletin ជាវដ្ដមុន — សូមបញ្ចូលតម្លៃថ្មីរបស់ក្រសួងពាណិជ្ជកម្ម។" : "⛽ មិនទាន់មានតម្លៃប្រេងក្នុង Bulletin ទេ — សូមបញ្ចូលតម្លៃរបស់ក្រសួងពាណិជ្ជកម្ម។",
    "ឧ. /setfuel 4150 4500 3950 3800kg",
    "",
    fuel ? "⛽ The bulletin's fuel prices are from the previous cycle — please enter MoC's new prices." : "⛽ The bulletin has no fuel prices yet — please enter MoC's prices.",
    "/setfuel <EA92> <EA95> <diesel> <LPG>kg  (or Admin › Fuel prices)",
  ].join("\n")
  for (const c of (chats as { chat_id: number }[] | null) ?? []) await tg("sendMessage", { chat_id: Number(c.chat_id), text }).catch(() => null)
  logEvent("warn", "bulletin", fuel ? "Fuel prices are from a previous cycle — admins reminded" : "No fuel prices entered — admins reminded", { fold: true })
}

type PostedRecord = { chat?: string; message_id?: number; at?: string; kind?: "bulletin" | "evening"; day?: string; sig?: string }

/**
 * Called every minute: today's market post in the channel always shows the
 * same verified data as the app. When the rates, gold or fuel behind it
 * changed (a fresher NBC rate, today's gold, /setfuel…), the post is edited in
 * place — same buttons — with "🔄 ធ្វើបច្ចុប្បន្នភាព៖ ម៉ោង …". `sig` is the post's
 * text without that line, so nothing is edited when nothing changed.
 */
export async function syncCommunityPost(): Promise<"edited" | "same" | "none"> {
  const chat = communityChat()
  if (!chat) return "none"
  const db = botDb()
  const { data } = await db.rpc("bot_kv_get", { p_key: botKey(), p_name: "community_posts" })
  const post = data as PostedRecord | null
  const now = phnomPenhNow()
  // Only today's post (yesterday's evening post is replaced by this morning's bulletin anyway).
  const postDay = post?.day ?? (post?.at ? phnomPenhDay(post.at) : null)
  if (!post?.message_id || post.chat !== chat || postDay !== now.day) return "none"
  const market = await currentMarket()
  if (!market) return "none"
  const kind = post.kind ?? "bulletin"
  const fresh = kind === "evening" ? eveningRatesText(market) : bulletinText(now.date, market)
  if (!fresh || fresh === post.sig) return "same"
  const at = new Date()
  const text = (kind === "evening" ? eveningRatesText(market, at) : bulletinText(now.date, market, at))!.slice(0, 4000)
  const res = await tg("editMessageText", {
    chat_id: chat,
    message_id: post.message_id,
    text,
    disable_web_page_preview: true,
    parse_mode: "HTML",
    ...(await getChannelPostButtons()),
  })
  // "message is not modified" also means it already shows this.
  if (!res.ok && !/not modified/i.test(res.description ?? "")) {
    logEvent("error", "bulletin", `Updating the channel post failed: ${res.description ?? "unknown"}`, { fold: true })
    return "none"
  }
  await db.rpc("bot_kv_set", { p_key: botKey(), p_name: "community_posts", p_value: { ...post, kind, day: now.day, sig: fresh, updated_at: at.toISOString() } })
  logEvent("info", "bulletin", `Channel ${kind} post updated with the latest verified data`)
  return "edited"
}

/** The Cambodian day of an ISO time. */
const phnomPenhDay = (iso: string) => new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().slice(0, 10)

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
  const res = await postReplacing(chat, { text, parse_mode: "HTML", disable_web_page_preview: true, ...(await getChannelPostButtons()) }, "evening")
  logEvent(res.ok ? "info" : "error", "bulletin", res.ok ? `Evening NBC rates sent to ${chat} (as of ${market.nbc.date})` : `Evening NBC post failed: ${res.description ?? "unknown"}`)
}

/**
 * /market in the bot: the whole snapshot in one message — NBC rates (with the
 * As-of day), gold (local CSNJ kilo / jewelry per damlung and per chi when
 * recent, plus the world 24K / 18K reference) and MoC fuel & gas.
 */
export function marketSnapshotText(market: MarketLive | null, locale: Locale, today: string): string {
  const km = locale === "km"
  const t = (key: MessageKey, params?: Record<string, string | number>) =>
    Object.entries(params ?? {}).reduce((text, [k, v]) => text.replaceAll(`{${k}}`, String(v)), dictionaries[locale][key] as string)
  const d = (s: string) => (km ? kmDigits(s) : s)
  const lines = [t("bot.marketTitle")]
  const nbc = market?.nbc
  if (nbc) {
    lines.push("", t("bot.marketNbc", { date: d(nbc.date.split("-").reverse().join("/")) }))
    for (const code of ["USD", "CNY", "EUR", "VND", "MYR", "THB"]) {
      const v = nbc.khr_per[code]
      if (v) lines.push(rateLine(code, v))
    }
  }
  const local = market?.local_gold && Date.parse(`${today}T00:00:00Z`) - Date.parse(`${market.local_gold.date}T00:00:00Z`) <= 3 * 86_400_000 ? market.local_gold : null
  if (local) {
    lines.push("", t("bot.marketLocalGold", { date: d(local.date.split("-").reverse().join("/")) }))
    lines.push(`• ${t("bot.goldKilo")}: ${t("bot.marketSellBuy", { sell: fmtUsd(local.kilo.sell), buy: fmtUsd(local.kilo.buy) })} · ${t("bot.marketPerChi", { sell: fmtUsd(local.kilo.sell / 10), buy: fmtUsd(local.kilo.buy / 10) })}`)
    if (local.jewelry) lines.push(`• ${t("bot.goldJewelry")}: ${t("bot.marketSellBuy", { sell: fmtUsd(local.jewelry.sell), buy: fmtUsd(local.jewelry.buy) })} · ${t("bot.marketPerChi", { sell: fmtUsd(local.jewelry.sell / 10), buy: fmtUsd(local.jewelry.buy / 10) })}`)
  }
  const ref = market?.gold?.reference
  if (ref?.GOLD_24K || ref?.GOLD_18K) {
    lines.push("", t("bot.marketWorldGold"))
    if (ref.GOLD_24K) lines.push(`• 24K: ${fmtUsd(ref.GOLD_24K)} · ${t("bot.marketChi", { price: fmtUsd(ref.GOLD_24K / 10) })}`)
    if (ref.GOLD_18K) lines.push(`• 18K: ${fmtUsd(ref.GOLD_18K)} · ${t("bot.marketChi", { price: fmtUsd(ref.GOLD_18K / 10) })}`)
  }
  if (market?.fuel) lines.push("", ...fuelLines(market.fuel, t, today, locale))
  if (lines.length === 1) lines.push("", t("bot.rateNone"))
  lines.push("", t("bot.marketCta"))
  return lines.join("\n")
}
