// Server only: festival posters (1080 × 1080). The first is Pchum Ben 2026 —
// deep midnight blue with royal gold, MiSans Khmer, three money tips for the
// festival, a quote and the LuyChlat footer. Admins preview it with
// "/poster pchumben" in the bot. Icons are drawn (the server has no emoji font).
// Dates follow the official calendar (lib/holidays.ts): Kan Ben 12 = Thu
// 8 Oct, Pchum Thom = Sun 11 Oct 2026 (public holiday 10–12 Oct).
import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas"

import { botToken } from "./telegram-bot"
import { FAMILIES, drawSpread, loadFonts, roundRect, wrap } from "./tip-poster"

const W = 1080
const H = 1080
const PAD = 72
const NAVY = "#0a1128"
const GOLD = "#D4AF37"
const AMBER = "#F59E0B"
const CREAM = "#fdf6e3"

type Icon = "lantern" | "lotus" | "car" | "shield"

/** Small gold line icons centred on (cx, cy). */
function icon(ctx: SKRSContext2D, kind: Icon, cx: number, cy: number, s = 1) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(s, s)
  ctx.strokeStyle = GOLD
  ctx.fillStyle = GOLD
  ctx.lineWidth = 2.6
  ctx.lineJoin = "round"
  ctx.lineCap = "round"
  if (kind === "lantern") {
    ctx.beginPath()
    ctx.ellipse(0, 2, 10, 12, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillRect(-5, -13, 10, 3)
    ctx.fillRect(-5, 13, 10, 3)
    ctx.beginPath()
    ctx.moveTo(0, -13)
    ctx.lineTo(0, -18)
    ctx.moveTo(0, 16)
    ctx.lineTo(0, 21)
    ctx.stroke()
  } else if (kind === "lotus") {
    for (const [dx, h, w] of [[0, 18, 7], [-9, 13, 6], [9, 13, 6]] as const) {
      ctx.beginPath()
      ctx.moveTo(dx, 9)
      ctx.quadraticCurveTo(dx - w, 9 - h / 2, dx, 9 - h)
      ctx.quadraticCurveTo(dx + w, 9 - h / 2, dx, 9)
      ctx.fill()
    }
    ctx.beginPath()
    ctx.moveTo(-15, 12)
    ctx.quadraticCurveTo(0, 18, 15, 12)
    ctx.stroke()
  } else if (kind === "car") {
    roundRect(ctx, -16, -2, 32, 12, 4)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(-10, -2)
    ctx.lineTo(-6, -10)
    ctx.lineTo(6, -10)
    ctx.lineTo(10, -2)
    ctx.stroke()
    for (const x of [-9, 9]) {
      ctx.beginPath()
      ctx.arc(x, 12, 3.5, 0, Math.PI * 2)
      ctx.fill()
    }
  } else {
    ctx.beginPath()
    ctx.moveTo(0, -16)
    ctx.lineTo(13, -10)
    ctx.quadraticCurveTo(13, 8, 0, 17)
    ctx.quadraticCurveTo(-13, 8, -13, -10)
    ctx.closePath()
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(-5, 0)
    ctx.lineTo(-1, 5)
    ctx.lineTo(6, -5)
    ctx.stroke()
  }
  ctx.restore()
}

const PCHUM_BEN_2026 = {
  pill: "រដូវកាលបុណ្យភ្ជុំបិណ្ឌ · បិណ្ឌ ១២ - ភ្ជុំធំ",
  // Kan Ben 12 (Thu 8 Oct) through Pchum Thom (Sun 11 Oct).
  date: "ថ្ងៃព្រហស្បតិ៍ ទី០៨ ដល់ ថ្ងៃអាទិត្យ ទី១១ ខែតុលា ឆ្នាំ២០២៦",
  title: "រីករាយពិធីបុណ្យភ្ជុំបិណ្ឌ",
  subtitle: "ធ្វើបុណ្យដោយសេចក្តីជ្រះថ្លា គ្រប់គ្រងថវិកាដោយភាពឆ្លាតវៃ",
  tips: [
    ["lotus", "បែងចែកកញ្ចប់បច្ច័យ និងទេយ្យទាន", "កត់ត្រាក្នុងសៀវភៅបច្ច័យបុណ្យ"],
    ["car", "បង្កើត «បេឡារួម ភ្ជុំបិណ្ឌ» សម្រាប់គ្រួសារ", "ថ្លៃសាំង ម្ហូបអាហារ ចង្ហាន់វត្ត"],
    ["shield", "ត្រៀមកញ្ចប់ប្រាក់បម្រុងបន្ទាន់", "ពេលធ្វើដំណើរទៅស្រុក"],
  ] as [Icon, string, string][],
  quote: "បុណ្យកុសលកើតពីទឹកចិត្តជ្រះថ្លា ភាពសុខសាន្តកើតពីការចាត់ចែងលុយត្រឹមត្រូវ!",
}

export const FESTIVAL_POSTERS = { pchumben: () => pchumBenPoster() } as const
export type FestivalPosterKey = keyof typeof FESTIVAL_POSTERS

export function pchumBenPoster(): Buffer {
  loadFonts()
  const c = PCHUM_BEN_2026
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext("2d")

  // Midnight blue with a warm gold glow and a few soft "lantern" lights.
  const bg = ctx.createLinearGradient(0, 0, W * 0.3, H)
  bg.addColorStop(0, NAVY)
  bg.addColorStop(0.65, "#111b3d")
  bg.addColorStop(1, "#1a2552")
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W * 0.85, H * 0.1, 0, W * 0.85, H * 0.1, W * 0.7)
  glow.addColorStop(0, "rgba(245,158,11,0.22)")
  glow.addColorStop(1, "rgba(245,158,11,0)")
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)
  for (const [x, y, r, a] of [[930, 330, 5, 0.5], [990, 520, 3, 0.4], [880, 610, 4, 0.35], [1010, 180, 3, 0.45], [820, 120, 2.5, 0.4]]) {
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(253,230,138,${a})`
    ctx.fill()
  }

  // Mark: a gold ៛ tile, "លុយឆ្លាត" over "LuyChlat".
  const mark = 64
  const top = 64
  roundRect(ctx, PAD, top, mark, mark, 18)
  ctx.fillStyle = "rgba(212,175,55,0.16)"
  ctx.fill()
  ctx.lineWidth = 2
  ctx.strokeStyle = "rgba(212,175,55,0.6)"
  ctx.stroke()
  ctx.fillStyle = GOLD
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.font = `700 40px ${FAMILIES}`
  ctx.fillText("៛", PAD + mark / 2, top + mark / 2 + 2)
  ctx.textAlign = "left"
  ctx.textBaseline = "alphabetic"
  ctx.font = `700 34px ${FAMILIES}`
  ctx.fillStyle = "#ffffff"
  const nameX = PAD + mark + 18
  ctx.fillText("លុយឆ្លាត", nameX, top + 32)
  const nameW = ctx.measureText("លុយឆ្លាត").width
  ctx.font = `500 20px ${FAMILIES}`
  ctx.fillStyle = "rgba(253,246,227,0.75)"
  drawSpread(ctx, "LuyChlat", nameX, top + 58, nameW)

  // Pill with a lantern, then the dates.
  ctx.font = `600 27px ${FAMILIES}`
  const pillTop = 162
  const pillW = ctx.measureText(c.pill).width + 78
  roundRect(ctx, PAD, pillTop, pillW, 54, 27)
  ctx.fillStyle = "rgba(212,175,55,0.14)"
  ctx.fill()
  ctx.strokeStyle = "rgba(212,175,55,0.6)"
  ctx.stroke()
  icon(ctx, "lantern", PAD + 30, pillTop + 27, 0.95)
  ctx.fillStyle = "#fde68a"
  ctx.fillText(c.pill, PAD + 54, pillTop + 37)
  ctx.font = `400 25px ${FAMILIES}`
  ctx.fillStyle = "rgba(253,246,227,0.7)"
  ctx.fillText(c.date, PAD, pillTop + 96)

  // Headline in gold, the subtitle under it.
  ctx.font = `700 72px ${FAMILIES}`
  const gold = ctx.createLinearGradient(PAD, 300, PAD + 700, 380)
  gold.addColorStop(0, "#f8e08e")
  gold.addColorStop(0.5, GOLD)
  gold.addColorStop(1, AMBER)
  ctx.fillStyle = gold
  ctx.fillText(c.title, PAD, 352)
  ctx.font = `500 29px ${FAMILIES}`
  ctx.fillStyle = CREAM
  for (const [i, line] of wrap(ctx, c.subtitle, W - 2 * PAD, 2).entries()) ctx.fillText(line, PAD, 418 + i * 44)

  // Three cards.
  let y = 462
  const cardH = 94
  for (const [kind, head, sub] of c.tips) {
    roundRect(ctx, PAD, y, W - 2 * PAD, cardH, 22)
    ctx.fillStyle = "rgba(255,255,255,0.055)"
    ctx.fill()
    ctx.lineWidth = 1.5
    ctx.strokeStyle = "rgba(212,175,55,0.28)"
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(PAD + 50, y + cardH / 2, 27, 0, Math.PI * 2)
    ctx.fillStyle = "rgba(212,175,55,0.14)"
    ctx.fill()
    icon(ctx, kind, PAD + 50, y + cardH / 2, 1.05)
    ctx.textAlign = "left"
    ctx.font = `700 29px ${FAMILIES}`
    ctx.fillStyle = "#ffffff"
    ctx.fillText(wrap(ctx, head, W - 2 * PAD - 120, 1)[0], PAD + 98, y + 41)
    ctx.font = `400 24px ${FAMILIES}`
    ctx.fillStyle = "rgba(253,230,138,0.85)"
    ctx.fillText(wrap(ctx, sub, W - 2 * PAD - 120, 1)[0], PAD + 98, y + 76)
    y += cardH + 14
  }

  // Quote in a gold-edged accent.
  ctx.font = `600 27px ${FAMILIES}`
  const quoteLines = wrap(ctx, c.quote, W - 2 * PAD - 70, 2)
  const qTop = y + 8
  const qH = quoteLines.length * 42 + 32
  roundRect(ctx, PAD, qTop, W - 2 * PAD, qH, 18)
  ctx.fillStyle = "rgba(212,175,55,0.1)"
  ctx.fill()
  roundRect(ctx, PAD, qTop, 8, qH, 4)
  ctx.fillStyle = GOLD
  ctx.fill()
  ctx.fillStyle = "#fde68a"
  quoteLines.forEach((line, i) => ctx.fillText(line, PAD + 36, qTop + 46 + i * 42))

  // Footer: two lines left, the LUYCHLAT mark right.
  const fTop = H - 132
  ctx.fillStyle = "rgba(212,175,55,0.3)"
  ctx.fillRect(PAD, fTop, W - 2 * PAD, 1.5)
  ctx.font = `600 26px ${FAMILIES}`
  ctx.fillStyle = "#ffffff"
  ctx.fillText("កត់ត្រាចំណូល-ចំណាយ ជាមួយ @luychlat_bot", PAD, fTop + 48)
  ctx.font = `400 24px ${FAMILIES}`
  ctx.fillStyle = "rgba(253,246,227,0.72)"
  ctx.fillText("ចូលរួមសហគមន៍ លុយឆ្លាត @LuyChlatCommunity", PAD, fTop + 88)
  ctx.font = `700 22px ${FAMILIES}`
  const badge = "LUYCHLAT"
  const bw = ctx.measureText(badge).width + 40
  roundRect(ctx, W - PAD - bw, fTop + 38, bw, 44, 22)
  ctx.lineWidth = 2
  ctx.strokeStyle = GOLD
  ctx.stroke()
  ctx.fillStyle = GOLD
  ctx.textAlign = "center"
  ctx.fillText(badge, W - PAD - bw / 2, fTop + 68)

  return canvas.toBuffer("image/png")
}

/**
 * "/poster <name>" from an admin's chat (checked in the webhook): render the
 * festival poster and send it there as a preview. Nothing is posted publicly.
 */
export async function sendFestivalPoster(chatId: number, name: string | undefined): Promise<string | null> {
  const key = (name ?? "").toLowerCase().replace(/[^a-z]/g, "") as FestivalPosterKey
  const render = FESTIVAL_POSTERS[key]
  if (!render) return `🎨 /poster <name> — ${Object.keys(FESTIVAL_POSTERS).map((k) => `/poster ${k}`).join(", ")}`
  const token = botToken()
  if (!token) return "bot token missing"
  const form = new FormData()
  form.append("chat_id", String(chatId))
  form.append("photo", new Blob([new Uint8Array(render())], { type: "image/png" }), `${key}.png`)
  form.append("caption", `🎨 ${key} · 1080×1080 · preview (មិនទាន់ផ្សាយទេ)`)
  const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: "POST", body: form, cache: "no-store", signal: AbortSignal.timeout(30_000) }).catch(() => null)
  const json = (await res?.json().catch(() => null)) as { ok?: boolean; description?: string } | null
  return json?.ok ? null : `⚠️ ${json?.description ?? "send failed"}`
}
