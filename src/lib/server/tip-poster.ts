// ─── BRAND STANDARD · approved by the founder on 2026-10-07 (poster v3) ───
// LuyChlat's permanent design for every daily tip poster. Change it only on the
// founder's explicit request:
//   · 1080 × 1080, deep emerald gradient, soft glow, faint ៛ watermark
//   · the standard frame (poster-kit.ts): logo top-left, the DATE pill top-right
//     ("ថ្ងៃព្រហស្បតិ៍ ទី០៨ តុលា ២០២៦", calendar icon), the app-first two-line footer
//   · the tip tag "គន្លឹះហិរញ្ញវត្ថុប្រចាំថ្ងៃ" (bulb) right above the headline (bold,
//     white, numbers in gold), no underline
//   · middle, no box: the explanation (primary, white) and its last sentence as
//     the takeaway (secondary, soft gold), centred between headline and footer
//   · type: MiSans Khmer, Kantumruy Pro behind it for Latin
// ──────────────────────────────────────────────────────────────────────────
//
// Server only: the daily tip poster (1080 × 1080 PNG).
import { createCanvas } from "@napi-rs/canvas"

import { longDate } from "@/lib/dates"

import { FAMILIES, FRAME, drawFooter, drawHeader, drawIcon, drawRich, loadFonts, wrap } from "./poster-kit"

const { W, H, PAD } = FRAME

/** The body's lead (all but the last sentence) and its takeaway (the last sentence). */
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
 * Layout, top to bottom: the standard header · the date · the headline · the
 * explanation (primary) and its takeaway (secondary, soft gold) as one clean
 * hierarchy, centred between headline and footer · the standard footer.
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

  // Header pill: the date, "ថ្ងៃព្រហស្បតិ៍ ទី០៨ តុលា ២០២៦".
  const [yy, mm, dd] = day.split("-").map(Number)
  const date = longDate(new Date(yy, mm - 1, dd, 12), "km").replace("ខែ", "").replace("ឆ្នាំ", "").replace(/\s+/g, " ").trim()
  drawHeader(ctx, { text: date, icon: "calendar" })

  // The tip tag right above the headline.
  ctx.textAlign = "left"
  ctx.textBaseline = "alphabetic"
  const tagY = FRAME.contentTop + 82
  drawIcon(ctx, "bulb", PAD + 12, tagY - 11)
  ctx.font = `600 30px ${FAMILIES}`
  ctx.fillStyle = "#fde68a"
  ctx.fillText("គន្លឹះហិរញ្ញវត្ថុប្រចាំថ្ងៃ", PAD + 36, tagY)
  ctx.font = `700 86px ${FAMILIES}`
  const titleLines = wrap(ctx, tip.title, W - 2 * PAD, 2)
  let y = tagY + 104
  for (const line of titleLines) {
    drawRich(ctx, line, PAD, y, 86, { weight: 700, color: "#ffffff" })
    y += 112
  }

  // Middle: one clean hierarchy, no box — the lead (primary), then the takeaway (secondary, soft gold),
  // centred between the headline and the footer.
  const { lead, takeaway } = splitTakeaway(tip.body)
  const bottom = FRAME.footerTop - 20
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
  const room = bottom - regionTop - 30
  while (blockH() > room && leadLines.length > 1) {
    ctx.font = `${lead_.weight} ${lead_.size}px ${FAMILIES}`
    leadLines = wrap(ctx, lead, width, leadLines.length - 1)
  }
  while (blockH() > room && subLines.length > 1) {
    ctx.font = `${sub.weight} ${sub.size}px ${FAMILIES}`
    subLines = wrap(ctx, takeaway!, width, subLines.length - 1)
  }
  let by = regionTop + Math.max(20, (bottom - regionTop - blockH()) / 2) + lead_.size
  for (const line of leadLines) {
    drawRich(ctx, line, PAD, by, lead_.size, { weight: lead_.weight, color: lead_.color })
    by += lead_.lineH
  }
  by += gap - (lead_.lineH - sub.lineH)
  for (const line of subLines) {
    drawRich(ctx, line, PAD, by, sub.size, { weight: sub.weight, color: sub.color })
    by += sub.lineH
  }

  drawFooter(ctx)
  return canvas.toBuffer("image/png")
}
