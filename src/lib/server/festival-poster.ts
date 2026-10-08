// Server only: festival posters (1080 × 1080, MiSans Khmer) on the standard
// frame (poster-kit.ts: logo left, category pill right, app-first two-line
// footer). Pchum Ben 2026 follows the brand (deep emerald slate, emerald and
// Khmer gold — no blue) and the founder's religious wording: "សូមអនុមោទនា…",
// never "រីករាយ"; a blessing, not a money lecture. Motifs (pagoda, lotus, tiffin
// carrier, ansom) are drawn in gold line art. Dates: the official national
// holiday, Sat 10 – Mon 12 Oct 2026. The approved artwork is saved in
// public/posters; "/poster pchumben" (admins) previews it with a one-tap
// broadcast to @LuyChlatCommunity, allowed during its window and only once.
import { readFileSync } from "node:fs"
import path from "node:path"

import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas"

import { getChannelPostButtons } from "./channel-buttons"
import { logEvent } from "./events"
import { FAMILIES, FRAME, drawFooter, drawHeader, loadFonts, roundRect, wrap } from "./poster-kit"
import { botDb, botKey, botToken, tg } from "./telegram-bot"

const { W, H, PAD } = FRAME
const MINT = "#34d399"
const GOLD = "#fbbf24"
const GOLD_DEEP = "#d97706"
const CREAM = "#fdf6e3"

/** A lotus blossom (filled petals in gold) centred on its base (x, y). */
function lotus(ctx: SKRSContext2D, x: number, y: number, s: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  const petal = (angle: number, len: number, wide: number, alpha: number) => {
    ctx.save()
    ctx.rotate(angle)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.quadraticCurveTo(-wide, -len * 0.55, 0, -len)
    ctx.quadraticCurveTo(wide, -len * 0.55, 0, 0)
    const g = ctx.createLinearGradient(0, -len, 0, 0)
    g.addColorStop(0, `rgba(253,230,138,${alpha})`)
    g.addColorStop(1, `rgba(217,119,6,${alpha})`)
    ctx.fillStyle = g
    ctx.fill()
    ctx.lineWidth = 1.6
    ctx.strokeStyle = "rgba(253,230,138,0.9)"
    ctx.stroke()
    ctx.restore()
  }
  for (const a of [-1.15, 1.15]) petal(a, 34, 13, 0.55)
  for (const a of [-0.62, 0.62]) petal(a, 44, 15, 0.75)
  petal(0, 54, 16, 0.95)
  ctx.beginPath()
  ctx.moveTo(-40, 4)
  ctx.quadraticCurveTo(0, 18, 40, 4)
  ctx.lineWidth = 2.4
  ctx.strokeStyle = "rgba(52,211,153,0.8)"
  ctx.stroke()
  ctx.restore()
}

/** A Khmer pagoda (vihara): tiered roofs with upturned ends, a tall spire, the hall and steps. */
function pagoda(ctx: SKRSContext2D, cx: number, base: number, s: number) {
  ctx.save()
  ctx.translate(cx, base)
  ctx.scale(s, s)
  const fill = ctx.createLinearGradient(0, -330, 0, 0)
  fill.addColorStop(0, "rgba(251,191,36,0.5)")
  fill.addColorStop(1, "rgba(217,119,6,0.22)")
  ctx.fillStyle = fill
  ctx.strokeStyle = GOLD
  ctx.lineWidth = 2.6
  ctx.lineJoin = "round"
  const shape = (draw: () => void) => {
    ctx.beginPath()
    draw()
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }
  // Steps and the hall with its pillars.
  shape(() => ctx.rect(-120, -16, 240, 16))
  shape(() => ctx.rect(-96, -96, 192, 80))
  for (const x of [-72, -36, 0, 36, 72]) {
    ctx.beginPath()
    ctx.moveTo(x, -92)
    ctx.lineTo(x, -20)
    ctx.stroke()
  }
  // Three roof tiers, each with upturned (chovea) ends.
  const tier = (y: number, half: number, rise: number) =>
    shape(() => {
      ctx.moveTo(-half - 18, y - 10)
      ctx.quadraticCurveTo(-half, y, -half + 10, y - 4)
      ctx.lineTo(-half * 0.45, y - rise)
      ctx.lineTo(half * 0.45, y - rise)
      ctx.lineTo(half - 10, y - 4)
      ctx.quadraticCurveTo(half, y, half + 18, y - 10)
      ctx.lineTo(half, y + 2)
      ctx.lineTo(-half, y + 2)
    })
  tier(-96, 124, 46)
  tier(-142, 92, 42)
  tier(-184, 62, 38)
  // The spire: stacked rings, then the point.
  for (const [y, w] of [[-222, 26], [-238, 20], [-252, 15]] as const) shape(() => ctx.rect(-w, y, w * 2, 14))
  shape(() => {
    ctx.moveTo(-11, -252)
    ctx.lineTo(0, -330)
    ctx.lineTo(11, -252)
  })
  ctx.restore()
}

/** A tiffin carrier (ចានស្រាក់, carried to the pagoda): three stacked pots with a handle. */
function tiffin(ctx: SKRSContext2D, cx: number, base: number, s: number) {
  ctx.save()
  ctx.translate(cx, base)
  ctx.scale(s, s)
  ctx.strokeStyle = GOLD
  ctx.lineWidth = 2.4
  for (let i = 0; i < 3; i++) {
    roundRect(ctx, -26, -26 - i * 28, 52, 26, 8)
    ctx.fillStyle = `rgba(251,191,36,${0.32 + i * 0.08})`
    ctx.fill()
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.moveTo(-30, -24)
  ctx.lineTo(-30, -96)
  ctx.quadraticCurveTo(0, -122, 30, -96)
  ctx.lineTo(30, -24)
  ctx.stroke()
  ctx.restore()
}

/** Ansom (នំអន្សម): a leaf-wrapped rice cake lying down, tied with string. */
function ansom(ctx: SKRSContext2D, cx: number, base: number, s: number) {
  ctx.save()
  ctx.translate(cx, base)
  ctx.scale(s, s)
  roundRect(ctx, -42, -30, 84, 30, 15)
  ctx.fillStyle = "rgba(52,211,153,0.28)"
  ctx.fill()
  ctx.strokeStyle = MINT
  ctx.lineWidth = 2.4
  ctx.stroke()
  ctx.strokeStyle = GOLD
  for (const x of [-20, 0, 20]) {
    ctx.beginPath()
    ctx.moveTo(x, -30)
    ctx.lineTo(x, 0)
    ctx.stroke()
  }
  ctx.restore()
}

const PCHUM_BEN_2026 = {
  pill: "ពិធីបុណ្យប្រពៃណីជាតិខ្មែរ",
  lead: "សូមអនុមោទនាពិធីបុណ្យ",
  title: "ភ្ជុំបិណ្ឌ",
  // The official national holiday (Sat 10 – Mon 12 Oct 2026).
  date: "ថ្ងៃទី ១០ ដល់ ១២ ខែតុលា ឆ្នាំ២០២៦",
  blessing:
    "សូមឧទ្ទិសកុសលផលបុណ្យជូនដល់បុព្វការីជនដែលបានចែកឋាន និងសូមជូនពរលោកអ្នកព្រមទាំងក្រុមគ្រួសារ ជួបតែសេចក្តីសុខ សុភមង្គល និងសុវត្ថិភាពក្នុងការធ្វើដំណើរទៅស្រុកកំណើតជួបជុំបងប្អូន។",
}

/**
 * Festival posters: the generator, the approved artwork saved in public/posters
 * (that exact file is what gets broadcast), the days it may go to the channel
 * (Cambodia dates, inclusive) and its caption.
 */
export const FESTIVAL_POSTERS = {
  pchumben: {
    render: () => pchumBenPoster(),
    file: "pchum-ben-2026.png",
    window: ["2026-10-10", "2026-10-12"] as const,
    /** Published on its own on the window's first day at this Cambodia time (founder, 08/10); /poster stays as the fallback. */
    autoAt: "07:00",
    caption: "🪷 សូមអនុមោទនាពិធីបុណ្យភ្ជុំបិណ្ឌ\n\nសូមឧទ្ទិសកុសលផលបុណ្យជូនដល់បុព្វការីជន និងសូមជូនពរលោកអ្នកព្រមទាំងក្រុមគ្រួសារ ធ្វើដំណើរទៅស្រុកកំណើតដោយសុខសុវត្ថិភាព។\n\n— លុយឆ្លាត · LuyChlat",
  },
} as const
export type FestivalPosterKey = keyof typeof FESTIVAL_POSTERS

export function pchumBenPoster(): Buffer {
  loadFonts()
  const c = PCHUM_BEN_2026
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext("2d")

  // Deep emerald slate, an emerald glow behind the pagoda and a warm one below.
  const bg = ctx.createLinearGradient(0, 0, W * 0.35, H)
  bg.addColorStop(0, "#031c15")
  bg.addColorStop(1, "#052e23")
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W * 0.78, H * 0.32, 0, W * 0.78, H * 0.32, W * 0.55)
  glow.addColorStop(0, "rgba(16,185,129,0.26)")
  glow.addColorStop(1, "rgba(16,185,129,0)")
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)
  const warm = ctx.createRadialGradient(W * 0.2, H, 0, W * 0.2, H, W * 0.6)
  warm.addColorStop(0, "rgba(251,191,36,0.12)")
  warm.addColorStop(1, "rgba(251,191,36,0)")
  ctx.fillStyle = warm
  ctx.fillRect(0, 0, W, H)

  // Motifs on the right, under the header: a soft gold warmth behind the pagoda roof and the
  // tiffin, then the pagoda, lotus at its feet, the tiffin carrier and ansom.
  const base = 520
  for (const [x, yy, r] of [[812, base - 190, 190], [615, base - 60, 90]] as const) {
    const warmth = ctx.createRadialGradient(x, yy, 0, x, yy, r)
    warmth.addColorStop(0, "rgba(251,191,36,0.20)")
    warmth.addColorStop(1, "rgba(251,191,36,0)")
    ctx.fillStyle = warmth
    ctx.fillRect(x - r, yy - r, r * 2, r * 2)
  }
  pagoda(ctx, 812, base, 1)
  lotus(ctx, 690, base + 20, 0.95)
  lotus(ctx, 940, base + 20, 0.8)
  tiffin(ctx, 615, base + 24, 0.95)
  ansom(ctx, 990, base + 24, 0.75)

  // The standard header: logo left, the pill right (with a lotus).
  drawHeader(ctx, { text: c.pill, icon: (cx, cy) => lotus(ctx, cx, cy + 10, 0.34) })

  // Title: the reverent lead, then "ភ្ជុំបិណ្ឌ" large in gold — kept apart so the lead never meets its upper vowels.
  ctx.textAlign = "left"
  ctx.textBaseline = "alphabetic"
  ctx.font = `600 44px ${FAMILIES}`
  ctx.fillStyle = CREAM
  ctx.fillText(c.lead, PAD, 262)
  ctx.font = `700 112px ${FAMILIES}`
  const gold = ctx.createLinearGradient(PAD, 300, PAD + 420, 400)
  gold.addColorStop(0, "#fde68a")
  gold.addColorStop(0.5, GOLD)
  gold.addColorStop(1, GOLD_DEEP)
  ctx.fillStyle = gold
  ctx.fillText(c.title, PAD, 408)

  // Date pill.
  ctx.font = `600 27px ${FAMILIES}`
  const dTop = 492
  const dW = ctx.measureText(c.date).width + 48
  roundRect(ctx, PAD, dTop, dW, 52, 26)
  ctx.fillStyle = "rgba(16,185,129,0.18)"
  ctx.fill()
  ctx.lineWidth = 1.6
  ctx.strokeStyle = "rgba(52,211,153,0.7)"
  ctx.stroke()
  ctx.fillStyle = "#d1fae5"
  ctx.fillText(c.date, PAD + 24, dTop + 35)

  // A gold rule, then the blessing.
  const rule = ctx.createLinearGradient(PAD, 0, W - PAD, 0)
  rule.addColorStop(0, "rgba(251,191,36,0)")
  rule.addColorStop(0.5, "rgba(251,191,36,0.75)")
  rule.addColorStop(1, "rgba(251,191,36,0)")
  ctx.fillStyle = rule
  ctx.fillRect(PAD, 592, W - 2 * PAD, 2)
  ctx.font = `400 34px ${FAMILIES}`
  ctx.fillStyle = CREAM
  const lines = wrap(ctx, c.blessing, W - 2 * PAD, 4)
  lines.forEach((line, i) => ctx.fillText(line, PAD, 666 + i * 66))

  drawFooter(ctx)
  return canvas.toBuffer("image/png")
}

/** Today in Cambodia (YYYY-MM-DD). */
const ppDay = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10)

/** The approved artwork for a poster: its saved file in public/posters, else a fresh render. */
function artwork(key: FestivalPosterKey): Buffer {
  const p = FESTIVAL_POSTERS[key]
  try {
    return readFileSync(path.join(process.cwd(), "public", "posters", p.file))
  } catch {
    return p.render()
  }
}

async function sendPhoto(chatId: number | string, png: Buffer, caption: string, replyMarkup?: unknown) {
  const token = botToken()
  if (!token) return { ok: false, description: "bot token missing" } as { ok: boolean; description?: string; result?: { message_id: number } }
  const form = new FormData()
  form.append("chat_id", String(chatId))
  form.append("photo", new Blob([new Uint8Array(png)], { type: "image/png" }), "poster.png")
  form.append("caption", caption)
  if (replyMarkup) form.append("reply_markup", JSON.stringify(replyMarkup))
  const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: "POST", body: form, cache: "no-store", signal: AbortSignal.timeout(30_000) }).catch(() => null)
  return ((await res?.json().catch(() => null)) ?? { ok: false, description: "no answer" }) as { ok: boolean; description?: string; result?: { message_id: number } }
}

const windowText = (w: readonly [string, string]) => {
  const d = (iso: string) => String(Number(iso.slice(8, 10))).replace(/\d/g, (x) => "០១២៣៤៥៦៧៨៩"[Number(x)])
  return `ថ្ងៃទី ${d(w[0])}–${d(w[1])}`
}

/**
 * "/poster <name>" from an admin's chat (checked in the webhook): the approved
 * artwork as a preview, with a one-tap button to broadcast it to the community
 * channel (only inside its window, once).
 */
export async function sendFestivalPoster(chatId: number, name: string | undefined): Promise<string | null> {
  const key = (name ?? "").toLowerCase().replace(/[^a-z]/g, "") as FestivalPosterKey
  const p = FESTIVAL_POSTERS[key]
  if (!p) return `🎨 /poster <name> — ${Object.keys(FESTIVAL_POSTERS).map((k) => `/poster ${k}`).join(", ")}`
  const auto = "autoAt" in p && p.autoAt ? `\n⏰ ផ្សាយដោយស្វ័យប្រវត្តិ ${windowText([p.window[0], p.window[0]]).replace(/–.*/, "")} ខែតុលា ម៉ោង ${p.autoAt}` : ""
  const caption = `🎨 ${key} · 1080×1080 · មើលជាមុន\n📢 អាចផ្សាយទៅ Community បាន ${windowText(p.window)} ខែតុលា (ម្ដងប៉ុណ្ណោះ)${auto}`
  const sent = await sendPhoto(chatId, artwork(key), caption, { inline_keyboard: [[{ text: "📢 ផ្សាយទៅ @LuyChlatCommunity", callback_data: `pf:${key}` }]] })
  return sent.ok ? null : `⚠️ ${sent.description ?? "send failed"}`
}

/** The single button under an automatically published poster. */
export const POSTER_APP_BUTTON = "📱 បើកកម្មវិធី លុយឆ្លាត"
const POSTER_APP_URL = "https://luy.ibmserp.com"

/** Until when (Cambodia time) a missed 07:00 slot is still made up — a holiday poster at night would be odd. */
const AUTO_LATEST_HOUR = 12

/** Is it time for this poster's automatic broadcast? (Cambodia day and "HH:MM"; pure.) */
export function posterDue(p: { window: readonly [string, string]; autoAt?: string }, day: string, hhmm: string): boolean {
  return Boolean(p.autoAt && day === p.window[0] && hhmm >= p.autoAt && hhmm < `${String(AUTO_LATEST_HOUR).padStart(2, "0")}:00`)
}

/**
 * Every minute (bot-dispatch): a poster whose time has come goes to the community channel
 * by itself — once, sharing the claim with the admins' 📢 button, so it is never posted
 * twice. A failed send gives the claim back (the next minute or /poster tries again) and
 * the super admins are told once.
 */
export async function posterTick() {
  const now = new Date(Date.now() + 7 * 3_600_000) // Asia/Phnom_Penh is UTC+7 all year
  const day = now.toISOString().slice(0, 10)
  const hhmm = now.toISOString().slice(11, 16)
  for (const [key, p] of Object.entries(FESTIVAL_POSTERS) as [FestivalPosterKey, (typeof FESTIVAL_POSTERS)[FestivalPosterKey]][]) {
    if (!posterDue(p, day, hhmm)) continue
    const channel = (process.env.TELEGRAM_COMMUNITY_CHAT_ID ?? process.env.TELEGRAM_COMMUNITY_CHANNEL_ID)?.trim()
    if (!channel) continue
    const db = botDb()
    const { data: claimed } = await db.rpc("bot_claim_daily", { p_key: botKey(), p_job: `poster-${key}`, p_day: p.window[0] })
    if (claimed !== true) continue // already broadcast (automatically or by an admin)
    const sent = await sendPhoto(channel, artwork(key), p.caption, { inline_keyboard: [[{ text: POSTER_APP_BUTTON, url: POSTER_APP_URL }]] })
    if (!sent.ok) {
      await db.rpc("bot_release_daily", { p_key: botKey(), p_job: `poster-${key}`, p_day: p.window[0] })
      logEvent("error", "poster", `Automatic broadcast of ${key} failed: ${sent.description ?? "unknown"}`, { fold: true })
      const { data: first } = await db.rpc("bot_claim_daily", { p_key: botKey(), p_job: `poster-fail-${key}`, p_day: day })
      if (first === true) await toSuperAdmins(`⚠️ [Poster] ផ្សាយ ${key} ដោយស្វ័យប្រវត្តិមិនបាន (${sent.description ?? "unknown"}) — Bot នឹងសាកម្ដងទៀតរៀងរាល់នាទី ឬផ្សាយដោយដៃ៖ /poster ${key}`)
      continue
    }
    await db.rpc("bot_system_audit", {
      p_key: botKey(),
      p_action: "AUTO_POSTER_BROADCAST",
      p_note: `${key} → ${channel} at ${hhmm}`,
      p_ref: sent.result?.message_id ? String(sent.result.message_id) : null,
      p_metadata: { key, file: p.file, channel, message_id: sent.result?.message_id ?? null },
    })
    logEvent("info", "poster", `${key} broadcast to ${channel} automatically at ${hhmm}`)
    await toSuperAdmins(`📢 [Poster] ${key} បានផ្សាយទៅ ${channel} ដោយស្វ័យប្រវត្តិ ម៉ោង ${hhmm}។`)
  }
}

async function toSuperAdmins(text: string) {
  const { data: chats } = await botDb().rpc("bot_super_admin_chats", { p_key: botKey() })
  for (const c of (chats as { chat_id: number }[] | null) ?? []) await tg("sendMessage", { chat_id: Number(c.chat_id), text }).catch(() => null)
}

export const isPosterCallback = (data: string | undefined) => Boolean(data?.startsWith("pf:"))

type Callback = { id: string; data?: string; message?: { message_id: number; chat: { id: number; type: string } } }

/** 📢 under a preview: an admin's chat, inside the window, once — then the saved artwork goes to the channel. */
export async function handlePosterCallback(cb: Callback) {
  const answer = (text: string, alert = true) => tg("answerCallbackQuery", { callback_query_id: cb.id, text: text.slice(0, 190), show_alert: alert })
  const chatId = cb.message?.chat.id
  const key = (cb.data ?? "").slice(3) as FestivalPosterKey
  const p = FESTIVAL_POSTERS[key]
  if (!chatId || cb.message?.chat.type !== "private" || !p) return answer("…", false)
  const db = botDb()
  const { data: admins } = await db.rpc("bot_admin_chats", { p_key: botKey() })
  if (!((admins as { chat_id: number }[] | null) ?? []).some((a) => Number(a.chat_id) === chatId)) return answer("សម្រាប់ Admin ប៉ុណ្ណោះ។")
  const today = ppDay()
  if (today < p.window[0] || today > p.window[1]) return answer(`អាចផ្សាយបានតែ ${windowText(p.window)} ខែតុលា ប៉ុណ្ណោះ។`)
  const channel = (process.env.TELEGRAM_COMMUNITY_CHAT_ID ?? process.env.TELEGRAM_COMMUNITY_CHANNEL_ID)?.trim()
  if (!channel) return answer("មិនទាន់កំណត់ Community channel ទេ។")
  // Once per poster, even if tapped twice or from two admins' previews.
  const { data: claimed } = await db.rpc("bot_claim_daily", { p_key: botKey(), p_job: `poster-${key}`, p_day: p.window[0] })
  if (claimed !== true) return answer("បានផ្សាយរួចហើយ។")
  const sent = await sendPhoto(channel, artwork(key), p.caption, (await getChannelPostButtons()).reply_markup)
  if (!sent.ok) {
    logEvent("error", "poster", `Broadcast of ${key} failed: ${sent.description ?? "unknown"}`)
    return answer(`មិនអាចផ្សាយបានទេ៖ ${sent.description ?? ""}`)
  }
  await db.rpc("bot_admin_audit", { p_key: botKey(), p_chat_id: chatId, p_action: "POSTER_BROADCAST", p_note: `${key} → ${channel}` })
  logEvent("info", "poster", `${key} broadcast to ${channel}`)
  await answer("📢 បានផ្សាយរួចរាល់!", false)
  await tg("editMessageCaption", { chat_id: chatId, message_id: cb.message!.message_id, caption: `📢 ${key} បានផ្សាយទៅ ${channel} រួចហើយ។` }).catch(() => null)
}
