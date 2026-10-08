// Server only: the Ministry of Commerce's fuel prices, without anyone typing them.
// The Ministry posts each retail price notice on its Telegram channel
// (t.me/mocnewsfeed, around 12:00 on the 1st, 11th and 21st — in effect from
// 13:00): a text with the period and one image of the stamped notice.
//
//   1. Read the channel's public page; the newest fuel notice with an image.
//   2. The period from the text (exact); the prices from the image (Gemini Vision,
//      Groq as the fallback). The image's own dates must agree with the text's.
//   3. Read by Gemini and agreeing → stored (source "moc"), the bulletin edits
//      itself, a "new fuel prices" post goes to the community channel and the
//      super admins get a note with the link to check.
//      Anything less certain → nothing is published; the super admins get the
//      reading and the /setfuel line to confirm it. Never a guessed number.
//
// An admin's /setfuel for the same (or a later) period is kept: the notice for
// a period already entered is not read again.
import { cycleText } from "@/lib/bot/fuel"
import type { FuelPrices } from "@/lib/market-calc"
import { channelPosts, cleanNoticePrices, isFuelNotice, parseNoticePeriod, pricesAgree, type ChannelPost, type NoticePrices } from "@/lib/moc-fuel"

import { getChannelPostButtons } from "./channel-buttons"
import { logEvent } from "./events"
import { currentMarket, setFuelPrices } from "./market-sync"
import { askGemini, askGroq, type Answer } from "./slip-bot"
import { botDb, botKey, tg } from "./telegram-bot"

const CHANNEL = "mocnewsfeed"
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"

/** When the channel is checked (Cambodia time): every 15 minutes around the usual noon post, and twice later. */
export const MOC_SLOTS = ["11:45", "12:00", "12:15", "12:30", "12:45", "13:00", "13:15", "13:30", "14:00", "14:30", "15:00", "17:00", "20:00"]

const PROMPT = [
  "This image should be a Cambodian Ministry of Commerce notice (សេចក្តីជូនដំណឹង) of retail fuel prices at stations.",
  "Answer JSON only:",
  '{"is_fuel_notice": boolean, "regular": number | null, "diesel": number | null, "regular_usd": number | null, "diesel_usd": number | null, "from": "YYYY-MM-DD" | null, "to": "YYYY-MM-DD" | null}',
  "regular: the retail price in RIEL per litre for Gasoline 92 (ប្រេងសាំង); diesel: for Gasoil 10ppm (ប្រេងម៉ាស៊ូត).",
  "Take them from the table's LAST row, \"ថ្លៃដែលត្រូវដាក់លក់រាយ/លីត្រ (គិតជារៀល)\" — e.g. \"៥ ១៥០ រៀល\" is 5150.",
  "regular_usd / diesel_usd: the row just above it, \"ថ្លៃដែលត្រូវដាក់លក់រាយ/លីត្រ (គិតជាដុល្លារ)\" — e.g. \"១,២៧ ដុល្លារ\" is 1.27 (the comma is the decimal point).",
  "Khmer digits: ០=0 ១=1 ២=2 ៣=3 ៤=4 ៥=5 ៦=6 ៧=7 ៨=8 ៩=9.",
  "from / to: the period in the title (\"ចាប់ពីថ្ងៃទី១ ដល់ថ្ងៃទី១១ ខែតុលា ឆ្នាំ២០២៦\" → 2026-10-01 / 2026-10-11).",
].join("\n")

const kmDigits = (s: string) => s.replace(/\d/g, (d) => "០១២៣៤៥៦៧៨៩"[Number(d)])
const riel = (n: number) => kmDigits(new Intl.NumberFormat("en-US").format(n))
const communityChat = () => (process.env.TELEGRAM_COMMUNITY_CHAT_ID ?? process.env.TELEGRAM_COMMUNITY_CHANNEL_ID)?.trim() || null

async function claim(job: string, day: string) {
  const { data } = await botDb().rpc("bot_claim_daily", { p_key: botKey(), p_job: job, p_day: day })
  return data === true
}

async function toSuperAdmins(text: string) {
  const { data: chats } = await botDb().rpc("bot_super_admin_chats", { p_key: botKey() })
  for (const c of (chats as { chat_id: number }[] | null) ?? []) await tg("sendMessage", { chat_id: Number(c.chat_id), text, disable_web_page_preview: true }).catch(() => null)
}

/** The newest fuel notice on the channel's public page, or null (page unreadable / none on it). */
async function latestNotice(): Promise<ChannelPost | null | "unreachable"> {
  try {
    const res = await fetch(`https://t.me/s/${CHANNEL}`, { headers: { "User-Agent": UA }, cache: "no-store", signal: AbortSignal.timeout(20_000) })
    if (!res.ok) return "unreachable"
    const notices = channelPosts(await res.text(), CHANNEL).filter((p) => isFuelNotice(p.text) && p.image)
    return notices.sort((a, b) => a.id - b.id).at(-1) ?? null
  } catch {
    return "unreachable"
  }
}

type Reading = { prices: NoticePrices; reader: "Gemini" | "Groq" }

/** The prices on the notice image; Gemini first, Groq while it is overloaded. */
async function readNotice(imageUrl: string): Promise<Reading | null> {
  const res = await fetch(imageUrl, { cache: "no-store", signal: AbortSignal.timeout(20_000) }).catch(() => null)
  if (!res?.ok) return null
  const type = res.headers.get("content-type")?.split(";")[0] || "image/jpeg"
  const image = Buffer.from(await res.arrayBuffer()).toString("base64")
  const gemini = process.env.GEMINI_API_KEY?.trim()
  const groq = process.env.GROQ_API_KEY?.trim()
  const readers: ["Gemini" | "Groq", () => Promise<Answer>][] = []
  if (gemini) readers.push(["Gemini", () => askGemini(gemini, type, image, PROMPT)])
  if (groq) readers.push(["Groq", () => askGroq(groq, type, image, PROMPT)])
  for (const [reader, ask] of readers) {
    const got = await ask()
    if ("fail" in got) {
      logEvent("warn", "moc-fuel", `Fuel notice read: ${reader} ${got.fail}`, { fold: true })
      continue
    }
    try {
      const prices = cleanNoticePrices(JSON.parse(got.text.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/^\s*```(?:json)?|```\s*$/g, "").trim()))
      if (prices) return { prices, reader }
      logEvent("warn", "moc-fuel", `Fuel notice read: ${reader} found no plausible prices`, { fold: true })
    } catch {
      logEvent("warn", "moc-fuel", `Fuel notice read: ${reader} answered without JSON`, { fold: true })
    }
  }
  return null
}

/** ▲ / ▼ against the previous period's price (none when unchanged or unknown). */
function change(now: number, before: number | null | undefined) {
  if (!before || before === now) return ""
  return ` (${now > before ? "▲" : "▼"} ${riel(Math.abs(now - before))})`
}

/** The community channel post for a new notice. */
export function newPricesText(fuel: Pick<FuelPrices, "regular" | "diesel" | "from" | "to">, previous: Pick<FuelPrices, "regular" | "diesel"> | null, postId: number): string {
  const year = kmDigits(fuel.to.slice(0, 4))
  return [
    "⛽ តម្លៃប្រេងឥន្ធនៈថ្មី — ក្រសួងពាណិជ្ជកម្ម",
    `📅 អនុវត្តចាប់ពីម៉ោង ១ រសៀល · ${cycleText(fuel.from, fuel.to, "km")} ${year}`,
    "",
    `• សាំងធម្មតា (EA92) ៖ ${riel(fuel.regular)} ៛/លីត្រ${change(fuel.regular, previous?.regular)}`,
    `• ម៉ាស៊ូត (Diesel) ៖ ${riel(fuel.diesel)} ៛/លីត្រ${change(fuel.diesel, previous?.diesel)}`,
    "",
    `ℹ️ ប្រភព៖ សេចក្តីជូនដំណឹងក្រសួងពាណិជ្ជកម្ម · t.me/${CHANNEL}/${postId}`,
    "✨ ចុះឈ្មោះប្រើកម្មវិធីដោយឥតគិតថ្លៃ ដើម្បីទទួលបានមុខងារឆ្លាតៗជាច្រើនទៀត! 👇👇",
  ].join("\n")
}

/**
 * One check of the channel (a scheduled slot). `lastSlot`: the day's last noon-window
 * check — when the current prices end today and no new notice has come, the super
 * admins are told once.
 */
export async function checkMocFuel(day: string, lastSlot: boolean): Promise<void> {
  const fuel = (await currentMarket())?.fuel ?? null
  const notice = await latestNotice()
  if (notice === "unreachable") {
    logEvent("warn", "moc-fuel", "t.me/s/mocnewsfeed unreachable — fuel notice not checked", { fold: true })
    return
  }
  const period = notice ? parseNoticePeriod(notice.text) : null
  // Already in: this notice, or an admin's prices for the same or a later period.
  const covered = Boolean(fuel && period && (fuel.post === notice?.id || fuel.to >= period.to))
  if (notice && period && !covered && period.to >= day) await applyNotice(day, notice, period, fuel)
  else if (notice && !period && (await claim(`moc-fuel-period-${notice.id}`, day))) {
    await toSuperAdmins(`⚠️ [តម្លៃប្រេង] រកឃើញសេចក្តីជូនដំណឹងថ្មីរបស់ក្រសួងពាណិជ្ជកម្ម ប៉ុន្តែអានកាលបរិច្ឆេទមិនបាន។\n• t.me/${CHANNEL}/${notice.id}\n• សូមបញ្ចូលដោយដៃ៖ /setfuel`)
    logEvent("error", "moc-fuel", `Fuel notice ${notice.id}: period not readable`)
  }

  const current = (await currentMarket())?.fuel ?? null
  if (lastSlot && current && current.to <= day && !(period && period.to > day) && (await claim("moc-fuel-missing", day))) {
    await toSuperAdmins(`⚠️ [តម្លៃប្រេង] តម្លៃបច្ចុប្បន្នផុតកំណត់ថ្ងៃនេះ ប៉ុន្តែក្រសួងពាណិជ្ជកម្មមិនទាន់ផ្សាយតម្លៃថ្មីនៅ t.me/${CHANNEL} ទេ (ពិនិត្យរហូតដល់ម៉ោង ៣ រសៀល)។\n• Bot នឹងពិនិត្យម្ដងទៀតម៉ោង ៥ និង ៨ យប់\n• ឬបញ្ចូលដោយដៃ៖ /setfuel`)
    logEvent("warn", "moc-fuel", `No new MoC fuel notice by 15:00 although the prices end ${current.to}`)
  }
}

async function applyNotice(day: string, notice: ChannelPost, period: { from: string; to: string }, previous: FuelPrices | null) {
  const reading = notice.image ? await readNotice(notice.image) : null
  const datesAgree = Boolean(reading && (!reading.prices.from || reading.prices.from === period.from) && (!reading.prices.to || reading.prices.to === period.to))
  const usdKhr = (await currentMarket())?.nbc?.usd_khr
  const consistent = Boolean(reading && pricesAgree(reading.prices, usdKhr))
  const link = `t.me/${CHANNEL}/${notice.id}`

  // Not certain enough to publish: the super admins confirm it (once per notice).
  if (!reading || reading.reader !== "Gemini" || !datesAgree || !consistent) {
    if (!(await claim(`moc-fuel-confirm-${notice.id}`, day))) return
    const from = period.from.split("-").reverse().join("-")
    const to = period.to.split("-").reverse().join("-")
    const lines = reading
      ? [
          `⚠️ [តម្លៃប្រេង] សេចក្តីជូនដំណឹងថ្មី (${cycleText(period.from, period.to, "km")}) — ការអានមិនទាន់ប្រាកដ (${reading.reader}${datesAgree ? "" : ", កាលបរិច្ឆេទមិនត្រូវគ្នា"}${consistent ? "" : ", តម្លៃរៀល/ដុល្លារមិនត្រូវគ្នា"}) មិនទាន់ផ្សាយទេ។`,
          `• អានបាន៖ សាំង ${riel(reading.prices.regular)}៛ · ម៉ាស៊ូត ${riel(reading.prices.diesel)}៛`,
          `• ពិនិត្យរូប៖ ${link}`,
          `• បើត្រឹមត្រូវ៖ /setfuel ${reading.prices.regular} ${previous?.super ?? reading.prices.regular} ${reading.prices.diesel} ${from} ${to}`,
        ]
      : [`⚠️ [តម្លៃប្រេង] សេចក្តីជូនដំណឹងថ្មី (${cycleText(period.from, period.to, "km")}) — អានតម្លៃពីរូបមិនបាន (Gemini / Groq)។`, `• ពិនិត្យរូប៖ ${link}`, `• បញ្ចូលដោយដៃ៖ /setfuel <សាំង> <ស៊ុបពែរ> <ម៉ាស៊ូត> ${from} ${to}`]
    await toSuperAdmins(lines.join("\n"))
    logEvent("warn", "moc-fuel", `Fuel notice ${notice.id} not applied: ${reading ? `${reading.reader} reading${datesAgree ? "" : ", dates disagree"}${consistent ? "" : ", riel/USD disagree"}` : "unreadable"}`)
    return
  }

  const saved = await setFuelPrices(
    { regular: reading.prices.regular, super: null, diesel: reading.prices.diesel, lpg: null, lpg_unit: "kg", from: period.from, to: period.to, post: notice.id },
    "moc",
  )
  if (!saved?.fuel) {
    logEvent("error", "moc-fuel", `Fuel notice ${notice.id}: storing the prices failed`)
    return
  }
  logEvent("info", "moc-fuel", `MoC fuel prices applied from ${link}: EA92 ${reading.prices.regular}, diesel ${reading.prices.diesel} (${period.from}–${period.to})`)

  // The community channel: once per notice.
  const chat = communityChat()
  if (chat && (await claim(`moc-fuel-post-${notice.id}`, day))) {
    const prev = previous && previous.to <= period.from ? previous : null
    await tg("sendMessage", { chat_id: chat, text: newPricesText(saved.fuel, prev, notice.id), disable_web_page_preview: true, ...(await getChannelPostButtons()) }).catch(() => null)
  }
  await toSuperAdmins(
    `✅ [តម្លៃប្រេង] បានធ្វើបច្ចុប្បន្នភាពដោយស្វ័យប្រវត្តិពីក្រសួងពាណិជ្ជកម្ម (${cycleText(period.from, period.to, "km")})៖ សាំង ${riel(reading.prices.regular)}៛ · ម៉ាស៊ូត ${riel(reading.prices.diesel)}៛\n• ពិនិត្យ៖ ${link}\n• បើខុស៖ /setfuel ដើម្បីកែ`,
  )
}
