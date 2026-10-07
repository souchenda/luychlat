// Server only: festival posters (1080 × 1080, MiSans Khmer). Pchum Ben 2026
// follows the brand (deep emerald slate, emerald and Khmer gold — no blue) and
// the founder's religious-wording rules: "សូមអនុមោទនា…", never "រីករាយ"; a
// blessing, not a money lecture. The motifs (pagoda spire, lotus, tiffin
// carrier and ansom) are drawn in gold line art — the server has no emoji font.
// Dates as set by the founder: 10–13 Oct 2026 (Pchum Thom Sun 11 Oct; the
// official schedule lists the public holiday as 10–12 Oct). Footer: two
// left-aligned lines, no badge. Admins preview with "/poster pchumben".
import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas"

import { botToken } from "./telegram-bot"
import { FAMILIES, drawSpread, loadFonts, roundRect, wrap } from "./tip-poster"

const W = 1080
const H = 1080
const PAD = 72
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
  pill: "ពិធីបុណ្យប្រពៃណីជាតិ",
  lead: "សូមអនុមោទនាពិធីបុណ្យ",
  title: "ភ្ជុំបិណ្ឌ",
  // As set by the founder (the official schedule lists the public holiday as 10–12 Oct).
  date: "ថ្ងៃទី ១០ ដល់ ១៣ ខែតុលា ឆ្នាំ២០២៦",
  blessing:
    "សូមឧទ្ទិសកុសលផលបុណ្យជូនដល់បុព្វការីជនដែលបានចែកឋាន និងសូមជូនពរលោកអ្នកព្រមទាំងក្រុមគ្រួសារ ជួបតែសេចក្តីសុខ សុភមង្គល និងសុវត្ថិភាពក្នុងការធ្វើដំណើរទៅស្រុកកំណើតជួបជុំបងប្អូន។",
}

export const FESTIVAL_POSTERS = { pchumben: () => pchumBenPoster() } as const
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
  const glow = ctx.createRadialGradient(W * 0.78, H * 0.3, 0, W * 0.78, H * 0.3, W * 0.55)
  glow.addColorStop(0, "rgba(16,185,129,0.26)")
  glow.addColorStop(1, "rgba(16,185,129,0)")
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)
  const warm = ctx.createRadialGradient(W * 0.2, H, 0, W * 0.2, H, W * 0.6)
  warm.addColorStop(0, "rgba(251,191,36,0.12)")
  warm.addColorStop(1, "rgba(251,191,36,0)")
  ctx.fillStyle = warm
  ctx.fillRect(0, 0, W, H)

  // Motifs on the right: a soft gold warmth behind the pagoda roof and the tiffin, then the
  // pagoda, lotus at its feet, the tiffin carrier and ansom.
  for (const [x, y, r] of [[812, 300, 190], [615, 450, 90]] as const) {
    const warmth = ctx.createRadialGradient(x, y, 0, x, y, r)
    warmth.addColorStop(0, "rgba(251,191,36,0.20)")
    warmth.addColorStop(1, "rgba(251,191,36,0)")
    ctx.fillStyle = warmth
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
  pagoda(ctx, 812, 488, 1)
  lotus(ctx, 690, 508, 0.95)
  lotus(ctx, 940, 508, 0.8)
  tiffin(ctx, 615, 512, 0.95)
  ansom(ctx, 990, 512, 0.75)

  // Mark: the ៛ tile with "លុយឆ្លាត" over "LuyChlat".
  const mark = 64
  const top = 64
  roundRect(ctx, PAD, top, mark, mark, 18)
  ctx.fillStyle = "rgba(16,185,129,0.16)"
  ctx.fill()
  ctx.lineWidth = 2
  ctx.strokeStyle = "rgba(52,211,153,0.6)"
  ctx.stroke()
  ctx.fillStyle = "#ffffff"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.font = `700 40px ${FAMILIES}`
  ctx.fillText("៛", PAD + mark / 2, top + mark / 2 + 2)
  ctx.textAlign = "left"
  ctx.textBaseline = "alphabetic"
  ctx.font = `700 34px ${FAMILIES}`
  const nameX = PAD + mark + 18
  ctx.fillText("លុយឆ្លាត", nameX, top + 32)
  const nameW = ctx.measureText("លុយឆ្លាត").width
  ctx.font = `500 20px ${FAMILIES}`
  ctx.fillStyle = "rgba(209,250,229,0.75)"
  drawSpread(ctx, "LuyChlat", nameX, top + 58, nameW)

  // Pill with a small lotus.
  ctx.font = `600 28px ${FAMILIES}`
  const pillTop = 176
  const pillW = ctx.measureText(c.pill).width + 82
  roundRect(ctx, PAD, pillTop, pillW, 56, 28)
  ctx.fillStyle = "rgba(251,191,36,0.12)"
  ctx.fill()
  ctx.strokeStyle = "rgba(251,191,36,0.6)"
  ctx.stroke()
  lotus(ctx, PAD + 32, pillTop + 40, 0.36)
  ctx.fillStyle = "#fde68a"
  ctx.fillText(c.pill, PAD + 58, pillTop + 38)

  // Title: the reverent lead, then "ភ្ជុំបិណ្ឌ" large in gold.
  ctx.font = `600 44px ${FAMILIES}`
  ctx.fillStyle = CREAM
  ctx.fillText(c.lead, PAD, 318)
  ctx.font = `700 112px ${FAMILIES}`
  const gold = ctx.createLinearGradient(PAD, 340, PAD + 420, 440)
  gold.addColorStop(0, "#fde68a")
  gold.addColorStop(0.5, GOLD)
  gold.addColorStop(1, GOLD_DEEP)
  ctx.fillStyle = gold
  ctx.fillText(c.title, PAD, 438)

  // Date pill.
  ctx.font = `600 27px ${FAMILIES}`
  const dTop = 520
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
  ctx.fillRect(PAD, 614, W - 2 * PAD, 2)
  ctx.font = `400 34px ${FAMILIES}`
  ctx.fillStyle = CREAM
  const lines = wrap(ctx, c.blessing, W - 2 * PAD, 5)
  lines.forEach((line, i) => ctx.fillText(line, PAD, 688 + i * 66))

  // Footer: two clean lines, left-aligned (no second brand mark).
  const fTop = H - 132
  ctx.fillStyle = "rgba(52,211,153,0.28)"
  ctx.fillRect(PAD, fTop, W - 2 * PAD, 1.5)
  ctx.font = `600 26px ${FAMILIES}`
  ctx.fillStyle = "#ffffff"
  ctx.fillText("កត់ត្រាចំណូល-ចំណាយ ជាមួយ @luychlat_bot", PAD, fTop + 48)
  ctx.font = `500 25px ${FAMILIES}`
  ctx.fillStyle = "#a7f3d0"
  ctx.fillText("ចូលរួមសហគមន៍ លុយឆ្លាត @LuyChlatCommunity", PAD, fTop + 90)

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
