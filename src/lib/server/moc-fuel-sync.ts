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
import type { FuelCycle, FuelPrices } from "@/lib/market-calc"
import { channelPosts, cleanNoticePrices, isFuelNotice, parseNoticePeriod, pricesAgree, type ChannelPost, type NoticePrices } from "@/lib/moc-fuel"

import { logEvent } from "./events"
import { FUEL_DELAY_MIN } from "@/lib/scheduled-posts"
import { facebookConfig, facebookFuelCaption, shouldPublishToFacebook } from "./facebook-publisher"
import { scheduleFuelPost } from "./scheduled-posts"
import { currentMarket, setFuelPrices } from "./market-sync"
import { askGemini, askGroq, type Answer } from "./slip-bot"
import { botDb, botKey, botToken, tg } from "./telegram-bot"
import { founderChats } from "@/lib/server/admin-routes"
import { communityChannelConfigured } from "@/lib/server/channel"

const CHANNEL = "mocnewsfeed"
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"

/**
 * When the channel is checked (Cambodia time): from 06:30 (a notice published early is in by
 * breakfast), every 15 minutes around the usual noon post, and twice later. A check is one page
 * fetch; the notice image is read only once, when a new one appears.
 */
export const MOC_SLOTS = ["06:30", "07:00", "08:00", "09:00", "10:00", "11:00", "11:45", "12:00", "12:15", "12:30", "12:45", "13:00", "13:15", "13:30", "14:00", "14:30", "15:00", "17:00", "20:00"]

const PROMPT = [
  "This image should be a Cambodian Ministry of Commerce notice (សេចក្តីជូនដំណឹង) of retail fuel prices at stations.",
  "Answer JSON only:",
  '{"is_fuel_notice": boolean, "regular": number | null, "super": number | null, "diesel": number | null, "regular_usd": number | null, "diesel_usd": number | null, "from": "YYYY-MM-DD" | null, "to": "YYYY-MM-DD" | null}',
  "regular: the retail price in RIEL per litre for Gasoline 92 (ប្រេងសាំង); diesel: for Gasoil 10ppm (ប្រេងម៉ាស៊ូត).",
  "super: for Gasoline 95 (ប្រេងសាំងស៊ុបពែរ / EA95) ONLY if the table has its own column for it — otherwise null; never copy another column.",
  "Take them from the table's LAST row, \"ថ្លៃដែលត្រូវដាក់លក់រាយ/លីត្រ (គិតជារៀល)\" — e.g. \"៥ ១៥០ រៀល\" is 5150.",
  "regular_usd / diesel_usd: the row just above it, \"ថ្លៃដែលត្រូវដាក់លក់រាយ/លីត្រ (គិតជាដុល្លារ)\" — e.g. \"១,២៧ ដុល្លារ\" is 1.27 (the comma is the decimal point).",
  "Khmer digits: ០=0 ១=1 ២=2 ៣=3 ៤=4 ៥=5 ៦=6 ៧=7 ៨=8 ៩=9.",
  "from / to: the period in the title (\"ចាប់ពីថ្ងៃទី១ ដល់ថ្ងៃទី១១ ខែតុលា ឆ្នាំ២០២៦\" → 2026-10-01 / 2026-10-11).",
].join("\n")

const kmDigits = (s: string) => s.replace(/\d/g, (d) => "០១២៣៤៥៦៧៨៩"[Number(d)])
const riel = (n: number) => kmDigits(new Intl.NumberFormat("en-US").format(n))

async function claim(job: string, day: string) {
  const { data } = await botDb().rpc("bot_claim_daily", { p_key: botKey(), p_job: job, p_day: day })
  return data === true
}

async function toSuperAdmins(text: string) {
  // The founder's private chat — a sync status, not an approval item (founder, 20/10/2026).
  for (const chat of await founderChats()) await tg("sendMessage", { chat_id: chat, text, disable_web_page_preview: true }).catch(() => null)
}

/**
 * The newest fuel notice on the channel's public page, or null (none on it). The page shows only
 * the latest ~20 posts: on a busy news day the notice can scroll off, so one older page is read too.
 */
async function latestNotice(): Promise<ChannelPost | null | "unreachable"> {
  try {
    const page = async (before?: number) => {
      const res = await fetch(`https://t.me/s/${CHANNEL}${before ? `?before=${before}` : ""}`, { headers: { "User-Agent": UA }, cache: "no-store", signal: AbortSignal.timeout(20_000) })
      return res.ok ? channelPosts(await res.text(), CHANNEL) : null
    }
    const first = await page()
    if (!first) return "unreachable"
    const newest = (posts: ChannelPost[]) => posts.filter((p) => isFuelNotice(p.text) && p.image).sort((a, b) => a.id - b.id).at(-1) ?? null
    const found = newest(first)
    if (found || !first.length) return found
    const oldest = Math.min(...first.map((p) => p.id))
    return newest((await page(oldest)) ?? [])
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

const KM_MONTHS = ["មករា", "កុម្ភៈ", "មីនា", "មេសា", "ឧសភា", "មិថុនា", "កក្កដា", "សីហា", "កញ្ញា", "តុលា", "វិច្ឆិកា", "ធ្នូ"]

/** «សម្រាប់ថ្ងៃទី ១១ ដល់ ២១ ខែតុលា ឆ្នាំ ២០២៦» — the period exactly as the notice states it. */
export function periodLine(from: string, to: string): string {
  const [fy, fm, fd] = from.split("-").map(Number)
  const [ty, tm, td] = to.split("-").map(Number)
  const day = (n: number) => kmDigits(String(n).padStart(2, "0"))
  const start = fm === tm && fy === ty ? `${day(fd)}` : `${day(fd)} ខែ${KM_MONTHS[fm - 1]}${fy === ty ? "" : ` ឆ្នាំ ${kmDigits(String(fy))}`}`
  return `សម្រាប់ថ្ងៃទី ${start} ដល់ ${day(td)} ខែ${KM_MONTHS[tm - 1]} ឆ្នាំ ${kmDigits(String(ty))}`
}

/** The community channel post for a new notice. */
export function newPricesText(fuel: Pick<FuelPrices, "regular" | "diesel" | "from" | "to"> & { super?: number | null }, previous: Pick<FuelPrices, "regular" | "diesel"> & { super?: number | null } | null, postId: number): string {
  return [
    "⛽ តម្លៃលក់រាយប្រេងឥន្ធនៈផ្លូវការ (ក្រសួងពាណិជ្ជកម្ម)",
    `📅 ${periodLine(fuel.from, fuel.to)} (អនុវត្តចាប់ពីម៉ោង ១ រសៀល)`,
    "",
    `• សាំងធម្មតា (EA92) ៖ ${riel(fuel.regular)} ៛/លីត្រ${change(fuel.regular, previous?.regular)}`,
    // EA95 only when the notice lists it — never a placeholder.
    ...(fuel.super ? [`• សាំងស៊ុបពែរ (EA95) ៖ ${riel(fuel.super)} ៛/លីត្រ${change(fuel.super, previous?.super)}`] : []),
    `• ប្រេងម៉ាស៊ូត (Diesel) ៖ ${riel(fuel.diesel)} ៛/លីត្រ${change(fuel.diesel, previous?.diesel)}`,
    "",
    `ℹ️ ប្រភព៖ សេចក្តីជូនដំណឹងក្រសួងពាណិជ្ជកម្ម · t.me/${CHANNEL}/${postId}`,
    "✨ ចុះឈ្មោះប្រើអេប លុយឆ្លាត ដោយឥតគិតថ្លៃ ដើម្បីទទួលបានមុខងារឆ្លាតៗជាច្រើនទៀត! 👇👇",
  ].join("\n")
}

/**
 * One check of the channel (a scheduled slot). `lastSlot`: the day's last noon-window
 * check — when the current prices end today and no new notice has come, the super
 * admins are told once.
 */
export async function checkMocFuel(day: string, lastSlot: boolean): Promise<string> {
  const fuel = (await currentMarket())?.fuel ?? null
  const notice = await latestNotice()
  if (notice === "unreachable") {
    logEvent("warn", "moc-fuel", "t.me/s/mocnewsfeed unreachable — fuel notice not checked", { fold: true })
    return "unreachable"
  }
  const period = notice ? parseNoticePeriod(notice.text) : null
  // Already in: this notice, or an admin's prices for the same or a later period.
  const covered = Boolean(fuel && period && (fuel.post === notice?.id || fuel.to >= period.to))
  if (notice && period && !covered && period.to >= day) await applyNotice(day, notice, period, fuel)
  else if (covered) await announceAppliedFuel(day)
  else if (notice && !period && (await claim(`moc-fuel-period-${notice.id}`, day))) {
    await toSuperAdmins(`⚠️ [តម្លៃប្រេង] រកឃើញសេចក្តីជូនដំណឹងថ្មីរបស់ក្រសួងពាណិជ្ជកម្ម ប៉ុន្តែអានកាលបរិច្ឆេទមិនបាន។\n• t.me/${CHANNEL}/${notice.id}\n• សូមបញ្ចូលដោយដៃ៖ /setfuel`)
    logEvent("error", "moc-fuel", `Fuel notice ${notice.id}: period not readable`)
  }

  const current = (await currentMarket())?.fuel ?? null
  if (lastSlot && current && current.to <= day && !(period && period.to > day) && (await claim("moc-fuel-missing", day))) {
    await toSuperAdmins(`⚠️ [តម្លៃប្រេង] តម្លៃបច្ចុប្បន្នផុតកំណត់ថ្ងៃនេះ ប៉ុន្តែក្រសួងពាណិជ្ជកម្មមិនទាន់ផ្សាយតម្លៃថ្មីនៅ t.me/${CHANNEL} ទេ (ពិនិត្យរហូតដល់ម៉ោង ៣ រសៀល)។\n• Bot នឹងពិនិត្យម្ដងទៀតម៉ោង ៥ និង ៨ យប់\n• ឬពិនិត្យភ្លាមៗ៖ /fuelsync · ឬបញ្ចូលដោយដៃ៖ /setfuel`)
    logEvent("warn", "moc-fuel", `No new MoC fuel notice by 15:00 although the prices end ${current.to}`)
  }
  if (!notice) return "no fuel notice on the channel's latest pages"
  if (!period) return `notice ${notice.id}: period not readable`
  return current?.post === notice.id ? `applied: notice ${notice.id} (${period.from} → ${period.to})` : covered ? `already in: ${current?.from} → ${current?.to}` : `notice ${notice.id} (${period.from} → ${period.to}) found — not published (see the note above)`
}

/**
 * The announcement of a notice, once per notice, preview-first: the card reaches «LCA Approval» and nothing is posted
 * without ✅ / 🚀. A change in EA92 or diesel → the community channel and the Facebook Page, 45 minutes after the card
 * (unless decided first); unchanged prices → the channel only (lib/server/facebook-publisher › shouldPublishToFacebook).
 */
async function announceFuel(day: string, fuel: FuelPrices, prev: FuelCycle | null, noticeId: number) {
  const chat = communityChannelConfigured()
  const link = `t.me/${CHANNEL}/${noticeId}`
  const prevPair = prev ? { regular: prev.regular, diesel: prev.diesel } : null
  if (shouldPublishToFacebook({ kind: "fuel", now: fuel, previous: prevPair })) {
    const telegram = chat ? newPricesText(fuel, prev, noticeId) : null
    const facebook = facebookFuelCaption({ now: fuel, previous: prevPair!, period: periodLine(fuel.from, fuel.to), sourceUrl: `https://${link}` })
    await scheduleFuelPost(noticeId, telegram ?? "", facebookConfig() ? facebook : null, new Date(Date.now() + FUEL_DELAY_MIN * 60_000).toISOString())
  } else if (chat && (await claim(`moc-fuel-post-${noticeId}`, day))) {
    // Unchanged prices: Telegram only — held for the founder's approval like every post (founder, 18/10/2026).
    await scheduleFuelPost(noticeId, newPricesText(fuel, prev, noticeId), null, new Date(Date.now() + 60_000).toISOString())
  }
}

/**
 * A notice stored outside the automatic reading — an admin's /setfuel, a migration with the founder's confirmed figures
 * (notice #36200, 21/10/2026) — still gets its announcement card, once: when the stored prices are the Ministry's
 * (source «moc», its post id), for the current cycle, with the cycle before kept. Idempotent: the post is one per notice
 * (bot_post_schedule), so a later call neither repeats nor re-sends the card.
 */
export async function announceAppliedFuel(day: string): Promise<string> {
  const fuel = (await currentMarket())?.fuel
  const due = fuelAnnouncementDue(fuel, day)
  if (!due || !fuel?.post) return "nothing to announce"
  await announceFuel(day, fuel, fuel.previous ?? null, fuel.post)
  return `announcement scheduled for notice ${fuel.post}`
}

/** Should the stored prices be announced now? The Ministry's own, this cycle (started within 2 days), the cycle before known. */
export function fuelAnnouncementDue(fuel: FuelPrices | null | undefined, day: string): boolean {
  if (!fuel || fuel.source !== "moc" || !fuel.post || !fuel.previous || fuel.previous.to > fuel.from) return false
  const started = Date.parse(`${day}T00:00:00Z`) - Date.parse(`${fuel.from}T00:00:00Z`)
  return fuel.to >= day && started >= 0 && started <= 2 * 86_400_000
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
          `• បើត្រឹមត្រូវ៖ /setfuel ${reading.prices.regular} ${reading.prices.super ?? previous?.super ?? reading.prices.regular} ${reading.prices.diesel} ${from} ${to}`,
        ]
      : [`⚠️ [តម្លៃប្រេង] សេចក្តីជូនដំណឹងថ្មី (${cycleText(period.from, period.to, "km")}) — អានតម្លៃពីរូបមិនបាន (Gemini / Groq)។`, `• ពិនិត្យរូប៖ ${link}`, `• បញ្ចូលដោយដៃ៖ /setfuel <សាំង> <ស៊ុបពែរ> <ម៉ាស៊ូត> ${from} ${to}`]
    await toSuperAdmins(lines.join("\n"))
    logEvent("warn", "moc-fuel", `Fuel notice ${notice.id} not applied: ${reading ? `${reading.reader} reading${datesAgree ? "" : ", dates disagree"}${consistent ? "" : ", riel/USD disagree"}` : "unreadable"}`)
    return
  }

  const saved = await setFuelPrices(
    { regular: reading.prices.regular, super: reading.prices.super, diesel: reading.prices.diesel, lpg: null, lpg_unit: "kg", from: period.from, to: period.to, post: notice.id },
    "moc",
  )
  if (!saved?.fuel) {
    logEvent("error", "moc-fuel", `Fuel notice ${notice.id}: storing the prices failed`)
    return
  }
  logEvent("info", "moc-fuel", `MoC fuel prices applied from ${link}: EA92 ${reading.prices.regular}${reading.prices.super ? `, EA95 ${reading.prices.super}` : ""}, diesel ${reading.prices.diesel} (${period.from}–${period.to})`)
  // The same audit trail as an admin's /setfuel, with no human actor.
  await botDb()
    .rpc("bot_system_audit", {
      p_key: botKey(),
      p_action: "AUTO_SET_FUEL_PRICES",
      p_note: `${reading.prices.regular}/${reading.prices.super ?? "—"}/${reading.prices.diesel} · ${period.from}–${period.to} · ${reading.reader}`,
      p_ref: link,
      p_metadata: { post: notice.id, reader: reading.reader, prices: reading.prices },
    })
    .then(({ error }) => error && logEvent("warn", "moc-fuel", `Fuel audit not written: ${error.message}`, { fold: true }))

  await announceFuel(day, saved.fuel, previous && previous.to <= period.from ? previous : null, notice.id)
  await toSuperAdmins(
    `✅ [តម្លៃប្រេង] បានធ្វើបច្ចុប្បន្នភាពដោយស្វ័យប្រវត្តិពីក្រសួងពាណិជ្ជកម្ម (${cycleText(period.from, period.to, "km")})៖ សាំង ${riel(reading.prices.regular)}៛ · ម៉ាស៊ូត ${riel(reading.prices.diesel)}៛\n• ពិនិត្យ៖ ${link}\n• បើខុស៖ /setfuel ដើម្បីកែ`,
  )
}

/**
 * An admin sends the bot the MoC notice image (founder, 21/10/2026 — forwarded from @mocnewsfeed, or captioned «/setfuel»
 * / «ក្រសួងពាណិជ្ជកម្ម»): read like the channel's notice (Gemini, else Groq), the riel checked against the dollar row,
 * the period from the caption or the image — and the prefilled /setfuel to confirm. Never applied by itself.
 */
export async function handleFuelNoticePhoto(chatId: number, fileId: string, caption: string | undefined): Promise<void> {
  const say = (text: string) => tg("sendMessage", { chat_id: chatId, text, disable_web_page_preview: true }).catch(() => null)
  const file = await tg<{ file_path?: string }>("getFile", { file_id: fileId }).catch(() => null)
  const token = botToken()
  if (!file?.ok || !file.result?.file_path || !token) {
    await say("⚠️ មិនអាចទាញយករូបបានទេ។ សូមផ្ញើម្ដងទៀត។")
    return
  }
  const reading = await readNotice(`https://api.telegram.org/file/bot${token}/${file.result.file_path}`)
  if (!reading) {
    await say("⚠️ អានតម្លៃប្រេងពីរូបនេះមិនបានទេ (Gemini / Groq)។ សូមបញ្ចូលដោយដៃ៖ /setfuel <សាំង> <ស៊ុបពែរ> <ម៉ាស៊ូត> <ពី dd-mm-yyyy> <ដល់ dd-mm-yyyy>")
    logEvent("warn", "moc-fuel", "Fuel notice sent to the bot: unreadable")
    return
  }
  const p = reading.prices
  const period = (caption ? parseNoticePeriod(caption) : null) ?? (p.from && p.to ? { from: p.from, to: p.to } : null)
  const usdKhr = (await currentMarket())?.nbc?.usd_khr
  const agree = pricesAgree(p, usdKhr)
  const ddmm = (iso: string) => iso.split("-").reverse().join("-")
  const previous = (await currentMarket())?.fuel
  await say(
    [
      `⛽ សេចក្តីជូនដំណឹងតម្លៃប្រេង (ក្រសួងពាណិជ្ជកម្ម) — អានដោយ ${reading.reader}`,
      `• សាំងធម្មតា (EA92) ៖ ${riel(p.regular)} ៛/លីត្រ`,
      ...(p.super ? [`• សាំងស៊ុបពែរ ៖ ${riel(p.super)} ៛/លីត្រ`] : []),
      `• ម៉ាស៊ូត (Diesel) ៖ ${riel(p.diesel)} ៛/លីត្រ`,
      `• វដ្ត៖ ${period ? cycleText(period.from, period.to, "km") : "មិនស្គាល់ — សូមបញ្ចូលកាលបរិច្ឆេទ"}`,
      `• រៀល/ដុល្លារ៖ ${agree ? "✅ ត្រូវគ្នា" : "⚠️ មិនត្រូវគ្នា — ពិនិត្យរូបម្ដងទៀត"}`,
      "",
      period
        ? `បើត្រឹមត្រូវ៖ /setfuel ${p.regular} ${p.super ?? previous?.super ?? p.regular} ${p.diesel} ${ddmm(period.from)} ${ddmm(period.to)}`
        : `បើត្រឹមត្រូវ៖ /setfuel ${p.regular} ${p.super ?? previous?.super ?? p.regular} ${p.diesel} <ពី dd-mm-yyyy> <ដល់ dd-mm-yyyy>`,
    ].join("\n"),
  )
  logEvent("info", "moc-fuel", `Fuel notice sent to the bot read by ${reading.reader}: EA92 ${p.regular}, diesel ${p.diesel}${agree ? "" : " (riel/USD disagree)"}`)
}

/** A photo that is the MoC notice: forwarded from @mocnewsfeed, or captioned «/setfuel» / «ក្រសួងពាណិជ្ជកម្ម» (never «ប្រេង» alone — a fuel receipt). */
export function isFuelNoticePhoto(o: { caption?: string | null; forwardedFrom?: string | null }): boolean {
  return (o.forwardedFrom ?? "").toLowerCase() === CHANNEL.toLowerCase() || /^\s*\/setfuel\b|ក្រសួងពាណិជ្ជកម្ម/.test(o.caption ?? "")
}
