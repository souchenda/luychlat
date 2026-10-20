// Server only: a national day or royal ceremony as a poster (founder, 20/10/2026) on the standard frame (poster-kit.ts):
// deep emerald and gold, the brand header and footer; centred — the title, the royal name or occasion, the dates as a
// gold chip, then the blessing. Text only: no royal portrait or emblem (the app holds no licensed copy). A merit day
// (Visak Bochea) carries the gold lotus; a memorial day is drawn quieter, in softer gold.
import { createCanvas } from "@napi-rs/canvas"

import { nationalDateLine, type NationalDay } from "@/lib/calendar/cambodia-holidays"

import { lotus } from "./festival-poster"
import { FAMILIES, FRAME, drawFooter, drawHeader, loadFonts, roundRect, wrap } from "./poster-kit"

const { W, H, PAD } = FRAME

/** Every line the poster draws (tested: no parentheses, nothing cut). */
export function nationalPosterLines(d: NationalDay, day: string) {
  return { pill: d.pill, title: d.title, subtitle: d.subtitle ?? null, date: nationalDateLine(d, day), message: d.message }
}

export function nationalDayPoster(d: NationalDay, day: string): { png: Buffer; truncated: boolean } {
  loadFonts()
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext("2d")
  const memorial = d.kind === "memorial"
  const text = nationalPosterLines(d, day)
  let truncated = false

  const bg = ctx.createLinearGradient(0, 0, W * 0.4, H)
  bg.addColorStop(0, memorial ? "#052e26" : "#064e3b")
  bg.addColorStop(0.6, memorial ? "#064e3b" : "#047857")
  bg.addColorStop(1, memorial ? "#065f46" : "#059669")
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W / 2, FRAME.contentTop + 80, 0, W / 2, FRAME.contentTop + 80, W * 0.55)
  glow.addColorStop(0, memorial ? "rgba(253,230,138,0.12)" : "rgba(253,230,138,0.24)")
  glow.addColorStop(1, "rgba(253,230,138,0)")
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  drawHeader(ctx, { text: text.pill, icon: d.kind === "merit" ? (cx, cy) => lotus(ctx, cx, cy + 10, 0.34) : "calendar" })

  const width = W - 2 * PAD
  const gold = memorial ? "#fde68a" : "#fcd34d"
  ctx.textAlign = "center"
  ctx.textBaseline = "alphabetic"
  let y = FRAME.contentTop + 70
  if (d.kind === "merit") {
    lotus(ctx, W / 2, y + 20, 1.8)
    y += 90
  }

  // The title (gold, large), up to three lines.
  ctx.font = `700 60px ${FAMILIES}`
  const titleLines = wrap(ctx, text.title, width, 3)
  if (titleLines.at(-1)?.endsWith("…")) truncated = true
  ctx.fillStyle = gold
  for (const line of titleLines) {
    ctx.fillText(line, W / 2, y)
    y += 80
  }

  // The royal name or the occasion (white), up to four lines.
  if (text.subtitle) {
    ctx.font = `600 36px ${FAMILIES}`
    ctx.fillStyle = "#ffffff"
    const subLines = wrap(ctx, text.subtitle, width - 40, 4)
    if (subLines.at(-1)?.endsWith("…")) truncated = true
    for (const line of subLines) {
      ctx.fillText(line, W / 2, y)
      y += 52
    }
    y += 8
  }

  // The dates as a gold chip.
  ctx.font = `600 30px ${FAMILIES}`
  const chipW = Math.min(width, ctx.measureText(text.date).width + 56)
  roundRect(ctx, (W - chipW) / 2, y - 6, chipW, 56, 28)
  ctx.fillStyle = "rgba(251,191,36,0.14)"
  ctx.fill()
  ctx.lineWidth = 2
  ctx.strokeStyle = "rgba(251,191,36,0.6)"
  ctx.stroke()
  ctx.fillStyle = "#fde68a"
  ctx.fillText(text.date, W / 2, y + 32)
  y += 56 + 50

  // The blessing (white), centred in the room left above the footer.
  const bottom = FRAME.footerTop - 30
  ctx.font = `500 36px ${FAMILIES}`
  let lines = wrap(ctx, text.message, width - 20, 6)
  while (lines.length * 56 > bottom - y && lines.length > 2) lines = wrap(ctx, text.message, width - 20, lines.length - 1)
  if (lines.at(-1)?.endsWith("…")) truncated = true
  let by = y + Math.max(0, (bottom - y - lines.length * 56) / 2) + 36
  ctx.fillStyle = "#ecfdf5"
  for (const line of lines) {
    ctx.fillText(line, W / 2, by)
    by += 56
  }
  if (by - 56 > bottom + 10) truncated = true

  drawFooter(ctx)
  return { png: canvas.toBuffer("image/png"), truncated }
}
