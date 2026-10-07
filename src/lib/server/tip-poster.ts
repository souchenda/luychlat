// ─── BRAND STANDARD · approved by the founder on 2026-10-07 (poster v3) ───
// This layout, typography and footer are LuyChlat's permanent design for every
// daily tip poster. Change them only on the founder's explicit request:
//   · 1080 × 1080, deep emerald gradient, soft glow, faint ៛ watermark
//   · top-left: ៛ tile + "លុយឆ្លាត" (bold) over "LuyChlat" spread to the same width
//   · gold tag pill "គន្លឹះហិរញ្ញវត្ថុប្រចាំថ្ងៃ", the Khmer date under it
//   · headline (bold, white, numbers in gold), no underline
//   · middle, no box: the explanation (primary, white) and its last sentence as
//     the takeaway (secondary, soft gold), centred between headline and footer
//   · footer near the bottom: 📱 app · ✈️ @LuyChlatCommunity · 🌐 luy.ibmserp.com,
//     each with a drawn gold icon
//   · type: MiSans Khmer, Kantumruy Pro behind it for Latin
// ──────────────────────────────────────────────────────────────────────────

// Server only: the daily tip poster (1080 × 1080 PNG, square) — open
// typography on an emerald gradient (no boxed card): the LuyChlat mark, the
// tip's title large, a gold accent, the explanation in light text, and every
// number ("$730/ឆ្នាំ", "៥០%", "២០,០០០៛") picked out in bold gold. Drawn with
// Skia (@napi-rs/canvas), whose HarfBuzz shaping gets Khmer right; lines break
// at Khmer word boundaries (Intl.Segmenter), never inside a cluster.
// Typeface: MiSans Khmer on trial (POSTER_FONT=kantumruy switches back), with
// Kantumruy Pro — the app's brand font — behind it for Latin (public/fonts).
import path from "node:path"

import { createCanvas, GlobalFonts, type SKRSContext2D } from "@napi-rs/canvas"

import { longDate } from "@/lib/dates"

const W = 1080
const H = 1080
const PAD = 84
const GOLD = "#fcd34d"
const FAMILIES =
  process.env.POSTER_FONT === "kantumruy"
    ? `"Kantumruy Pro", "Noto Sans Khmer", "Khmer UI", "Noto Sans", sans-serif`
    : `"MiSans Khmer", "Kantumruy Pro", "Noto Sans Khmer", "Khmer UI", "Noto Sans", sans-serif`

let fontsLoaded = false
function loadFonts() {
  if (fontsLoaded) return
  fontsLoaded = true
  // The brand font first (shipped in public/), system fonts only as a fallback.
  const dir = path.join(process.cwd(), "public", "fonts")
  for (const weight of [400, 600, 700]) GlobalFonts.registerFromPath(path.join(dir, `KantumruyPro-${weight}.ttf`), "Kantumruy Pro")
  for (const w of ["Regular", "Medium", "Semibold", "Bold"]) GlobalFonts.registerFromPath(path.join(dir, `MiSansKhmer-${w}.woff2`), "MiSans Khmer")
  for (const dir of ["/usr/share/fonts", "C:/Windows/Fonts"]) GlobalFonts.loadFontsFromDir(dir)
}

const words = new Intl.Segmenter("km", { granularity: "word" })

/** Money, percentages and counts — with a "/ឆ្នាំ"-style unit — in Latin or Khmer digits. */
const NUMBER = /[$៛]?\s?[0-9០-៩](?:[0-9០-៩,.]*[0-9០-៩])?(?:\s?[%៛$]|\s?ដុល្លារ|\s?រៀល)?(?:\s?\/\s?(?:ឆ្នាំ|ខែ|ថ្ងៃ|សប្តាហ៍|year|month|day))?/g

/** Word pieces of a paragraph; opening brackets and quotes stay with the word after them. */
function pieces(paragraph: string): string[] {
  const out: string[] = []
  let open = ""
  for (const { segment } of words.segment(paragraph.trim())) {
    if (/^[(\[«“‘]+$/.test(segment)) open += segment
    else {
      out.push(open + segment)
      open = ""
    }
  }
  if (open) out.push(open)
  // Keep a number and its unit ("$730", "/", "ឆ្នាំ") together so it is never split across lines.
  const joined: string[] = []
  for (const p of out) {
    const prev = joined[joined.length - 1]
    if (prev !== undefined && (/^[/%៛]/.test(p) || /[/$៛]$/.test(prev))) joined[joined.length - 1] = prev + p
    else joined.push(p)
  }
  return joined
}

/** Lines of `text` that fit `maxWidth`, at most `maxLines` (the last cut with "…"). */
function wrap(ctx: SKRSContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.replace(/[\u0000-\u0009\u000b-\u001f]/g, " ").split(/\n+/)) {
    let line = ""
    for (const segment of pieces(paragraph)) {
      const next = line + segment
      if (ctx.measureText(next).width <= maxWidth || !line) line = next
      else {
        lines.push(line.trimEnd())
        line = segment.trimStart()
      }
    }
    if (line.trim()) lines.push(line.trimEnd())
  }
  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  let last = kept[maxLines - 1]
  while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = [...last].slice(0, -1).join("")
  kept[maxLines - 1] = `${last}…`
  return kept
}

/** Draws one line, numbers in bold gold and the rest in the `base` style. */
function drawRich(ctx: SKRSContext2D, line: string, x: number, y: number, size: number, base: { weight: number; color: string }) {
  let at = x
  let last = 0
  const run = (text: string, number: boolean) => {
    if (!text) return
    ctx.font = `${number ? 700 : base.weight} ${size}px ${FAMILIES}`
    ctx.fillStyle = number ? GOLD : base.color
    ctx.fillText(text, at, y)
    at += ctx.measureText(text).width
  }
  for (const m of line.matchAll(NUMBER)) {
    run(line.slice(last, m.index), false)
    run(m[0], true)
    last = (m.index ?? 0) + m[0].length
  }
  run(line.slice(last), false)
}

/** Text drawn letter by letter so it spans exactly `width` (to match a line above it). */
function drawSpread(ctx: SKRSContext2D, text: string, x: number, y: number, width: number) {
  const chars = [...text]
  const natural = chars.reduce((w, c) => w + ctx.measureText(c).width, 0)
  const extra = chars.length > 1 ? Math.max(0, (width - natural) / (chars.length - 1)) : 0
  let at = x
  for (const c of chars) {
    ctx.fillText(c, at, y)
    at += ctx.measureText(c).width + extra
  }
}

type Icon = "phone" | "plane" | "globe"
/** Small gold line icons centred on (cx, cy): a phone, Telegram's paper plane, a globe. */
function drawIcon(ctx: SKRSContext2D, icon: Icon, cx: number, cy: number) {
  ctx.save()
  ctx.strokeStyle = GOLD
  ctx.fillStyle = GOLD
  ctx.lineWidth = 2.6
  ctx.lineJoin = "round"
  if (icon === "phone") {
    roundRect(ctx, cx - 9, cy - 14, 18, 28, 4)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(cx, cy + 9, 1.8, 0, Math.PI * 2)
    ctx.fill()
  } else if (icon === "plane") {
    ctx.beginPath()
    ctx.moveTo(cx - 13, cy - 1)
    ctx.lineTo(cx + 13, cy - 11)
    ctx.lineTo(cx + 7, cy + 12)
    ctx.lineTo(cx - 1, cy + 4)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = "#064e3b"
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(cx - 1, cy + 4)
    ctx.lineTo(cx + 13, cy - 11)
    ctx.stroke()
  } else {
    ctx.beginPath()
    ctx.arc(cx, cy, 13, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.ellipse(cx, cy, 5.5, 13, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(cx - 13, cy)
    ctx.lineTo(cx + 13, cy)
    ctx.stroke()
  }
  ctx.restore()
}

function roundRect(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** The body's lead (all but the last sentence) and its takeaway (the last sentence), for the accent box. */
export function splitTakeaway(body: string): { lead: string; takeaway: string | null } {
  const sentences =
    body
      .trim()
      .match(/[^។!?.]+[។!?.]+|[^។!?.]+$/g)
      ?.map((x) => x.trim())
      .filter(Boolean) ?? []
  if (sentences.length < 2) return { lead: body.trim(), takeaway: null }
  return { lead: sentences.slice(0, -1).join(" "), takeaway: sentences[sentences.length - 1] }
}

/**
 * Layout, top to bottom: mark with "លុយឆ្លាត" over a smaller, width-matched
 * "LuyChlat" · tag pill · date · headline · the explanation (primary) and its
 * takeaway (secondary, soft gold) as one clean hierarchy, centred · footer near
 * the bottom: app, community, website, each with a small drawn icon. The middle block is centred between the
 * headline and the footer, so a short tip never leaves the bottom empty.
 */
export function tipPoster(tip: { title: string; body: string }, day: string): Buffer {
  loadFonts()
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext("2d")

  // Deep emerald gradient, a soft light glow top-right and a warm one bottom-left.
  const bg = ctx.createLinearGradient(0, 0, W * 0.4, H)
  bg.addColorStop(0, "#064e3b")
  bg.addColorStop(0.6, "#047857")
  bg.addColorStop(1, "#059669")
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W * 0.9, H * 0.05, 0, W * 0.9, H * 0.05, W * 0.8)
  glow.addColorStop(0, "rgba(167,243,208,0.30)")
  glow.addColorStop(1, "rgba(167,243,208,0)")
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)
  const warm = ctx.createRadialGradient(0, H, 0, 0, H, W * 0.7)
  warm.addColorStop(0, "rgba(252,211,77,0.16)")
  warm.addColorStop(1, "rgba(252,211,77,0)")
  ctx.fillStyle = warm
  ctx.fillRect(0, 0, W, H)
  ctx.font = `700 760px ${FAMILIES}`
  ctx.fillStyle = "rgba(255,255,255,0.04)"
  ctx.textAlign = "right"
  ctx.textBaseline = "alphabetic"
  ctx.fillText("៛", W + 50, H - 150)

  // Mark: the rounded ៛ tile, then the name.
  const mark = 80
  const markTop = PAD - 10
  roundRect(ctx, PAD, markTop, mark, mark, 22)
  ctx.fillStyle = "rgba(255,255,255,0.14)"
  ctx.fill()
  ctx.lineWidth = 3
  ctx.strokeStyle = "rgba(255,255,255,0.4)"
  ctx.stroke()
  ctx.fillStyle = "#ffffff"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.font = `700 50px ${FAMILIES}`
  ctx.fillText("៛", PAD + mark / 2, markTop + mark / 2 + 3)
  ctx.textAlign = "left"
  ctx.textBaseline = "alphabetic"
  const nameX = PAD + mark + 22
  ctx.font = `700 42px ${FAMILIES}`
  ctx.fillText("លុយឆ្លាត", nameX, markTop + 42)
  const nameW = ctx.measureText("លុយឆ្លាត").width
  ctx.font = `500 24px ${FAMILIES}`
  ctx.fillStyle = "rgba(236,253,245,0.8)"
  drawSpread(ctx, "LuyChlat", nameX, markTop + 74, nameW)

  // Tag pill (a gold bulb dot in place of 💡 — the server has no emoji font), then the date.
  const label = "គន្លឹះហិរញ្ញវត្ថុប្រចាំថ្ងៃ"
  ctx.font = `600 30px ${FAMILIES}`
  const pillTop = 196
  const pillW = ctx.measureText(label).width + 84
  roundRect(ctx, PAD, pillTop, pillW, 58, 29)
  ctx.fillStyle = "rgba(252,211,77,0.16)"
  ctx.fill()
  ctx.lineWidth = 2
  ctx.strokeStyle = "rgba(252,211,77,0.55)"
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(PAD + 30, pillTop + 29, 9, 0, Math.PI * 2)
  ctx.fillStyle = GOLD
  ctx.fill()
  ctx.fillText(label, PAD + 52, pillTop + 40)
  const [yy, mm, dd] = day.split("-").map(Number)
  ctx.font = `400 28px ${FAMILIES}`
  ctx.fillStyle = "rgba(254,243,199,0.78)"
  ctx.fillText(longDate(new Date(yy, mm - 1, dd, 12), "km"), PAD, pillTop + 108)

  // Headline (larger), then the gold accent.
  ctx.font = `700 86px ${FAMILIES}`
  const titleLines = wrap(ctx, tip.title, W - 2 * PAD, 2)
  let y = pillTop + 230
  for (const line of titleLines) {
    drawRich(ctx, line, PAD, y, 86, { weight: 700, color: "#ffffff" })
    y += 112
  }

  // Middle: one clean hierarchy, no box — the lead (primary), then the takeaway (secondary, soft gold),
  // centred between the headline and the footer.
  const { lead, takeaway } = splitTakeaway(tip.body)
  const footerTop = H - 250
  const regionTop = y - 60
  const lead_ = { size: 44, lineH: 72, weight: 500, color: "#ffffff" }
  const sub = { size: 36, lineH: 60, weight: 400, color: "#fde68a" }
  const gap = 34
  const width = W - 2 * PAD
  ctx.font = `${lead_.weight} ${lead_.size}px ${FAMILIES}`
  let leadLines = wrap(ctx, lead, width, 5)
  ctx.font = `${sub.weight} ${sub.size}px ${FAMILIES}`
  let subLines = takeaway ? wrap(ctx, takeaway, width, 3) : []
  const blockH = () => leadLines.length * lead_.lineH + (subLines.length ? gap + subLines.length * sub.lineH : 0)
  const room = footerTop - regionTop - 40
  while (blockH() > room && leadLines.length > 1) {
    ctx.font = `${lead_.weight} ${lead_.size}px ${FAMILIES}`
    leadLines = wrap(ctx, lead, width, leadLines.length - 1)
  }
  while (blockH() > room && subLines.length > 1) {
    ctx.font = `${sub.weight} ${sub.size}px ${FAMILIES}`
    subLines = wrap(ctx, takeaway!, width, subLines.length - 1)
  }
  let by = regionTop + Math.max(20, (footerTop - regionTop - blockH()) / 2) + lead_.size
  for (const line of leadLines) {
    drawRich(ctx, line, PAD, by, lead_.size, { weight: lead_.weight, color: lead_.color })
    by += lead_.lineH
  }
  by += gap - (lead_.lineH - sub.lineH)
  for (const line of subLines) {
    drawRich(ctx, line, PAD, by, sub.size, { weight: sub.weight, color: sub.color })
    by += sub.lineH
  }

  // Footer, near the bottom: app · community · website, each with a small gold icon.
  ctx.fillStyle = "rgba(255,255,255,0.22)"
  ctx.fillRect(PAD, footerTop + 40, W - 2 * PAD, 2)
  ctx.textAlign = "left"
  const rows: [Icon, string, number, string][] = [
    ["phone", "កត់ចំណូល-ចំណាយជាមួយ លុយឆ្លាត អេប", 600, "#ffffff"],
    ["plane", "@LuyChlatCommunity", 500, "#d1fae5"],
    ["globe", "luy.ibmserp.com", 500, "#d1fae5"],
  ]
  rows.forEach(([icon, text, weight, color], i) => {
    const baseline = footerTop + 98 + i * 48
    drawIcon(ctx, icon, PAD + 14, baseline - 11)
    ctx.font = `${weight} 29px ${FAMILIES}`
    ctx.fillStyle = color
    ctx.fillText(text, PAD + 46, baseline)
  })

  return canvas.toBuffer("image/png")
}
