// Server only: the holiday note as a poster (1080 × 1080) on the standard frame (poster-kit.ts) —
// the eve of days off and the day back (lib/holiday-lifecycle.ts), never text-only (founder,
// 13/10/2026). Deep emerald, Khmer gold, the brand header and footer; the motif is a gold lotus for
// Pchum Ben (merit wording stays reverent) and a gold ៛ coin for the other holidays. The poster's
// fonts have no emoji, so the note's emoji are left out of the artwork (the caption keeps them).
import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas"

import { holidayMessage, kmRange, type HolidayMoment } from "@/lib/holiday-lifecycle"
import { khmerDigits } from "@/lib/dates"

import { lotus } from "./festival-poster"
import { FAMILIES, FRAME, drawFooter, drawHeader, drawRich, loadFonts, roundRect, wrap } from "./poster-kit"

const { W, H, PAD } = FRAME

const PILL: Record<HolidayMoment["block"]["kind"], string> = {
  PCHUM_BEN: "ពិធីបុណ្យភ្ជុំបិណ្ឌ",
  KHMER_NEW_YEAR: "ពិធីបុណ្យចូលឆ្នាំខ្មែរ",
  WATER_FESTIVAL: "ព្រះរាជពិធីបុណ្យអុំទូក",
  GENERAL: "ថ្ងៃឈប់សម្រាក",
}

/** Text without emoji (and their joiners / variation selectors), spaces tidied. */
export const noEmoji = (s: string) =>
  s
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}]/gu, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim()

/** A gold ៛ coin: the brand's money mark, for the non-religious holidays. */
function rielCoin(ctx: SKRSContext2D, cx: number, cy: number, r: number) {
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r)
  g.addColorStop(0, "#fef3c7")
  g.addColorStop(0.55, "#fbbf24")
  g.addColorStop(1, "#b45309")
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = g
  ctx.fill()
  ctx.lineWidth = 4
  ctx.strokeStyle = "rgba(254,243,199,0.85)"
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2)
  ctx.lineWidth = 2
  ctx.strokeStyle = "rgba(120,53,15,0.45)"
  ctx.stroke()
  ctx.fillStyle = "#78350f"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.font = `700 ${Math.round(r * 1.15)}px ${FAMILIES}`
  ctx.fillText("៛", cx, cy + r * 0.08)
}

/** The body split into its lead (white) and its «💡» tip (gold); the date line is drawn as a chip instead. */
export function holidayPosterText(m: HolidayMoment): { title: string; date: string; lead: string; tip: string | null } {
  const { title, body } = holidayMessage(m)
  const lines = body.split("\n").filter((l) => !l.startsWith("📅"))
  const tipAt = lines.findIndex((l) => l.startsWith("💡"))
  const lead = noEmoji((tipAt >= 0 ? lines.slice(0, tipAt) : lines).join(" "))
  const tip = tipAt >= 0 ? noEmoji(lines.slice(tipAt).join(" ")) : null
  return { title: noEmoji(title), date: `${kmRange(m.block)} · ឈប់សម្រាក ${khmerDigits(String(m.block.days))} ថ្ងៃ`, lead, tip }
}

export function holidayPoster(m: HolidayMoment): Buffer {
  loadFonts()
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext("2d")
  const religious = m.block.kind === "PCHUM_BEN"

  // Background: the daily-tip emerald with a soft light top-right and a warm gold bottom-left.
  const bg = ctx.createLinearGradient(0, 0, W * 0.4, H)
  bg.addColorStop(0, "#064e3b")
  bg.addColorStop(0.6, "#047857")
  bg.addColorStop(1, "#059669")
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W * 0.84, H * 0.24, 0, W * 0.84, H * 0.24, W * 0.5)
  glow.addColorStop(0, "rgba(253,230,138,0.22)")
  glow.addColorStop(1, "rgba(253,230,138,0)")
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

  drawHeader(ctx, { text: PILL[m.block.kind], icon: religious ? (cx, cy) => lotus(ctx, cx, cy + 10, 0.34) : "calendar" })

  // The motif, top right: a gold lotus (Pchum Ben) or a gold ៛ coin.
  const motifX = W - PAD - 110
  const motifY = FRAME.contentTop + 120
  if (religious) {
    lotus(ctx, motifX - 60, motifY + 70, 1.5)
    lotus(ctx, motifX + 60, motifY + 70, 1.5)
    lotus(ctx, motifX, motifY + 80, 2.4)
  } else rielCoin(ctx, motifX, motifY, 95)

  const text = holidayPosterText(m)
  ctx.textAlign = "left"
  ctx.textBaseline = "alphabetic"
  // The headline beside the motif.
  ctx.font = `700 66px ${FAMILIES}`
  ctx.fillStyle = "#ffffff"
  let y = FRAME.contentTop + 96
  for (const line of wrap(ctx, text.title, W - 2 * PAD - 260, 3)) {
    ctx.fillText(line, PAD, y)
    y += 86
  }

  // The dates as a gold chip.
  ctx.font = `600 30px ${FAMILIES}`
  const chipW = ctx.measureText(text.date).width + 48
  const chipTop = Math.max(y - 30, FRAME.contentTop + 250)
  roundRect(ctx, PAD, chipTop, chipW, 54, 27)
  ctx.fillStyle = "rgba(251,191,36,0.14)"
  ctx.fill()
  ctx.lineWidth = 2
  ctx.strokeStyle = "rgba(251,191,36,0.6)"
  ctx.stroke()
  ctx.fillStyle = "#fde68a"
  ctx.fillText(text.date, PAD + 24, chipTop + 37)

  // The message (white) and its tip (gold), centred between the chip and the footer.
  const width = W - 2 * PAD
  const regionTop = chipTop + 54 + 40
  const bottom = FRAME.footerTop - 30
  ctx.font = `500 40px ${FAMILIES}`
  let leadLines = wrap(ctx, text.lead, width, 5)
  ctx.font = `400 34px ${FAMILIES}`
  let tipLines = text.tip ? wrap(ctx, text.tip, width, 3) : []
  const blockH = () => leadLines.length * 64 + (tipLines.length ? 28 + tipLines.length * 56 : 0)
  while (blockH() > bottom - regionTop && leadLines.length > 2) {
    ctx.font = `500 40px ${FAMILIES}`
    leadLines = wrap(ctx, text.lead, width, leadLines.length - 1)
  }
  while (blockH() > bottom - regionTop && tipLines.length > 1) {
    ctx.font = `400 34px ${FAMILIES}`
    tipLines = wrap(ctx, text.tip!, width, tipLines.length - 1)
  }
  let by = regionTop + Math.max(0, (bottom - regionTop - blockH()) / 2) + 40
  for (const line of leadLines) {
    drawRich(ctx, line, PAD, by, 40, { weight: 500, color: "#ffffff" })
    by += 64
  }
  by += 28 - (64 - 56)
  for (const line of tipLines) {
    drawRich(ctx, line, PAD, by, 34, { weight: 400, color: "#fde68a" })
    by += 56
  }

  drawFooter(ctx)
  return canvas.toBuffer("image/png")
}
