// Server only: the fuel price poster (1080 × 1080 PNG) — docs/BRAND_DESIGN_SYSTEM.md: the shared frame (poster-kit.ts),
// a deep navy-to-emerald background with soft light and faint geometric lines at low opacity, the title in white, the
// cycle and the source under it, one glass card per fuel with its big price and its change badge.
import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas"

import type { FuelPoster } from "@/lib/fuel-poster"

import { FAMILIES, FRAME, GOLD, drawFooter, drawHeader, loadFonts, roundRect } from "./poster-kit"
import { latinCanvas } from "@/lib/numerals"

const { W, H, PAD } = FRAME

const BADGE = {
  down: { fill: "rgba(16,185,129,0.92)", text: "#ffffff" },
  up: { fill: "rgba(244,63,94,0.9)", text: "#ffffff" },
  same: { fill: "rgba(255,255,255,0.14)", text: "#e2e8f0" },
} as const

/** The text at the largest size (≤ max) that fits the width. */
function fit(ctx: SKRSContext2D, text: string, weight: number, max: number, width: number): number {
  let size = max
  for (; size > 20; size -= 2) {
    ctx.font = `${weight} ${size}px ${FAMILIES}`
    if (ctx.measureText(text).width <= width) break
  }
  return size
}

export function fuelPoster(p: FuelPoster): Buffer {
  loadFonts()
  const canvas = createCanvas(W, H)
  const ctx = latinCanvas(canvas.getContext("2d")) // 0-9 on the poster (Task #440)

  // Deep navy into the brand emerald, a soft light top-right and a warm one bottom-left.
  const bg = ctx.createLinearGradient(0, 0, W * 0.55, H)
  bg.addColorStop(0, "#0b1f3a")
  bg.addColorStop(0.55, "#063b33")
  bg.addColorStop(1, "#065f46")
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W * 0.88, H * 0.08, 0, W * 0.88, H * 0.08, W * 0.75)
  glow.addColorStop(0, "rgba(52,211,153,0.22)")
  glow.addColorStop(1, "rgba(52,211,153,0)")
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)
  const warm = ctx.createRadialGradient(0, H, 0, 0, H, W * 0.7)
  warm.addColorStop(0, "rgba(251,191,36,0.10)")
  warm.addColorStop(1, "rgba(251,191,36,0)")
  ctx.fillStyle = warm
  ctx.fillRect(0, 0, W, H)
  // Faint geometric lines (≈ 6 % — a texture, never competing with the prices).
  ctx.save()
  ctx.strokeStyle = "rgba(167,243,208,0.06)"
  ctx.lineWidth = 1.5
  for (let i = -H; i < W; i += 46) {
    ctx.beginPath()
    ctx.moveTo(i, H)
    ctx.lineTo(i + H, 0)
    ctx.stroke()
  }
  ctx.restore()

  // The pill is its words alone: the small drawn pump read as a «▯» box (founder, 21/10/2026 — Task #432).
  drawHeader(ctx, { text: p.pill, icon: null })

  // Title, cycle and source, centred.
  ctx.textAlign = "center"
  ctx.textBaseline = "alphabetic"
  const titleSize = fit(ctx, p.title, 700, 62, W - 2 * PAD)
  ctx.font = `700 ${titleSize}px ${FAMILIES}`
  ctx.fillStyle = "#ffffff"
  ctx.fillText(p.title, W / 2, 262)
  ctx.font = `600 ${fit(ctx, p.cycle, 600, 36, W - 2 * PAD)}px ${FAMILIES}`
  ctx.fillStyle = GOLD
  ctx.fillText(p.cycle, W / 2, 322)
  ctx.font = `500 26px ${FAMILIES}`
  ctx.fillStyle = "rgba(209,250,229,0.78)"
  ctx.fillText(p.source, W / 2, 366)

  // The cards: two (or three with EA95) side by side.
  const n = p.cards.length
  const gap = 28
  const top = 412
  const cardH = 470
  const cardW = (W - 2 * PAD - gap * (n - 1)) / n
  p.cards.forEach((c, i) => {
    const x = PAD + i * (cardW + gap)
    const cx = x + cardW / 2
    // Glass: a soft fill, a hairline and a light top edge.
    roundRect(ctx, x, top, cardW, cardH, 36)
    const fill = ctx.createLinearGradient(0, top, 0, top + cardH)
    fill.addColorStop(0, "rgba(255,255,255,0.13)")
    fill.addColorStop(1, "rgba(255,255,255,0.05)")
    ctx.fillStyle = fill
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = "rgba(110,231,183,0.35)"
    ctx.stroke()

    ctx.textAlign = "center"
    // The fuel, and its grade in a small gold pill.
    ctx.font = `700 ${fit(ctx, c.label, 700, 40, cardW - 48)}px ${FAMILIES}`
    ctx.fillStyle = "#ffffff"
    ctx.fillText(c.label, cx, top + 78)
    ctx.font = `700 22px ${FAMILIES}`
    const codeW = ctx.measureText(c.code).width + 36
    roundRect(ctx, cx - codeW / 2, top + 100, codeW, 38, 19)
    ctx.fillStyle = "rgba(251,191,36,0.16)"
    ctx.fill()
    ctx.lineWidth = 1.5
    ctx.strokeStyle = "rgba(251,191,36,0.6)"
    ctx.stroke()
    ctx.fillStyle = "#fde68a"
    ctx.fillText(c.code, cx, top + 127)

    // The price, big, and its unit.
    ctx.font = `700 ${fit(ctx, c.price, 700, n === 2 ? 132 : 96, cardW - 40)}px ${FAMILIES}`
    ctx.fillStyle = "#ffffff"
    ctx.fillText(c.price, cx, top + 286)
    ctx.font = `500 30px ${FAMILIES}`
    ctx.fillStyle = "rgba(209,250,229,0.85)"
    ctx.fillText(c.unit, cx, top + 336)

    // The change badge: a drawn ▼ / ▲ (never a glyph — it is not in the brand fonts) and the words.
    if (c.change) {
      const tone = BADGE[c.change.tone]
      const arrow = c.change.tone === "same" ? 0 : 22
      const space = arrow ? 14 : 0
      ctx.font = `700 ${fit(ctx, c.change.text, 700, 32, cardW - 80 - arrow - space)}px ${FAMILIES}`
      const tw = ctx.measureText(c.change.text).width
      const bw = tw + arrow + space + 56
      const bh = 60
      const by = top + cardH - 104
      roundRect(ctx, cx - bw / 2, by, bw, bh, bh / 2)
      ctx.fillStyle = tone.fill
      ctx.fill()
      ctx.fillStyle = tone.text
      const x0 = cx - (tw + arrow + space) / 2
      if (arrow) {
        const ay = by + bh / 2
        ctx.beginPath()
        if (c.change.tone === "down") {
          ctx.moveTo(x0, ay - 8)
          ctx.lineTo(x0 + arrow, ay - 8)
          ctx.lineTo(x0 + arrow / 2, ay + 10)
        } else {
          ctx.moveTo(x0, ay + 9)
          ctx.lineTo(x0 + arrow, ay + 9)
          ctx.lineTo(x0 + arrow / 2, ay - 9)
        }
        ctx.closePath()
        ctx.fill()
      }
      ctx.textAlign = "left"
      ctx.fillText(c.change.text, x0 + arrow + space, by + 41)
      ctx.textAlign = "center"
    }
  })

  drawFooter(ctx)
  return canvas.toBuffer("image/png")
}
