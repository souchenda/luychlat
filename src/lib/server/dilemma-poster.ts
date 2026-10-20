// EXPERIMENTAL — OFF (DILEMMA_POSTERS_ENABLED): rejected by the founder (20/10/2026) as a low-fidelity wireframe; kept
// only until a high-fidelity, asset-based template designed to docs/BRAND_DESIGN_SYSTEM.md replaces it.
// Server only: the money dilemma as a poster (founder, 20/10/2026 — «text-only will have low engagement»): 1080 × 1080,
// a premium dark emerald, «សំណួរហិរញ្ញវត្ថុ · បើជាបងវិញ?», the headline, two choices side by side (A warm, B emerald), the
// question «តើគួររើសមួយណា? A ឬ B?» and the brand at the base. The server has no emoji font: the bubble, the card and the
// shield are drawn. No parentheses on the graphic (the caption explains).
import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas"

import type { DilemmaPoster } from "@/lib/money-dilemmas"

import { FAMILIES, loadFonts, posterMascot, roundRect, wrap } from "./poster-kit"

const W = 1080
const H = 1080

const TONES = {
  warm: { edge: "#fb923c", tint: "rgba(249,115,22,0.16)", ink: "#fed7aa", badge: "#f97316" },
  calm: { edge: "#34d399", tint: "rgba(16,185,129,0.16)", ink: "#a7f3d0", badge: "#10b981" },
} as const

/** A speech bubble with three dots (the header's «thinking» mark). */
function bubble(ctx: SKRSContext2D, cx: number, cy: number) {
  ctx.save()
  ctx.fillStyle = "#fcd34d"
  roundRect(ctx, cx - 22, cy - 16, 44, 30, 12)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(cx - 8, cy + 12)
  ctx.lineTo(cx - 14, cy + 22)
  ctx.lineTo(cx + 2, cy + 13)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = "#052e26"
  for (const dx of [-10, 0, 10]) {
    ctx.beginPath()
    ctx.arc(cx + dx, cy - 1, 3.2, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

/** A bank card (choice A). */
function cardIcon(ctx: SKRSContext2D, cx: number, cy: number, color: string) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 5
  roundRect(ctx, cx - 38, cy - 25, 76, 50, 9)
  ctx.stroke()
  ctx.fillStyle = color
  ctx.fillRect(cx - 38, cy - 13, 76, 9)
  ctx.fillRect(cx - 26, cy + 9, 22, 6)
  ctx.restore()
}

/** A shield with a check (choice B). */
function shieldIcon(ctx: SKRSContext2D, cx: number, cy: number, color: string) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 5
  ctx.lineJoin = "round"
  ctx.beginPath()
  ctx.moveTo(cx, cy - 32)
  ctx.lineTo(cx + 28, cy - 20)
  ctx.quadraticCurveTo(cx + 28, cy + 18, cx, cy + 34)
  ctx.quadraticCurveTo(cx - 28, cy + 18, cx - 28, cy - 20)
  ctx.closePath()
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx - 12, cy + 1)
  ctx.lineTo(cx - 3, cy + 11)
  ctx.lineTo(cx + 13, cy - 8)
  ctx.stroke()
  ctx.restore()
}

export function renderDilemmaPoster(p: DilemmaPoster): { png: Buffer; truncated: boolean } {
  loadFonts()
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext("2d")
  let truncated = false

  // A premium dark emerald with a soft gold glow behind the headline.
  const bg = ctx.createLinearGradient(0, 0, W * 0.4, H)
  bg.addColorStop(0, "#03140f")
  bg.addColorStop(0.55, "#052e26")
  bg.addColorStop(1, "#064e3b")
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W / 2, 250, 0, W / 2, 250, 560)
  glow.addColorStop(0, "rgba(253,230,138,0.16)")
  glow.addColorStop(1, "rgba(253,230,138,0)")
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  ctx.textBaseline = "alphabetic"
  ctx.textAlign = "center"

  // The header pill: the bubble and «សំណួរហិរញ្ញវត្ថុ · បើជាបងវិញ?».
  ctx.font = `600 32px ${FAMILIES}`
  const header = "សំណួរហិរញ្ញវត្ថុ · បើជាបងវិញ?"
  const pillW = ctx.measureText(header).width + 110
  roundRect(ctx, (W - pillW) / 2, 70, pillW, 64, 32)
  ctx.fillStyle = "rgba(252,211,77,0.12)"
  ctx.fill()
  ctx.strokeStyle = "rgba(252,211,77,0.55)"
  ctx.lineWidth = 2
  ctx.stroke()
  bubble(ctx, (W - pillW) / 2 + 46, 101)
  ctx.fillStyle = "#fde68a"
  ctx.textAlign = "left"
  ctx.fillText(header, (W - pillW) / 2 + 82, 113)
  ctx.textAlign = "center"

  // The headline.
  ctx.font = `700 62px ${FAMILIES}`
  ctx.fillStyle = "#ffffff"
  const headline = wrap(ctx, p.headline, W - 140, 2)
  if (headline.at(-1)?.endsWith("…")) truncated = true
  let y = 262
  for (const line of headline) {
    ctx.fillText(line, W / 2, y)
    y += 80
  }

  // The two choices.
  const top = Math.max(y + 40, 380)
  const cardH = 330
  const gap = 40
  const cardW = (W - 140 - gap) / 2
  for (const [i, c] of [p.a, p.b].entries()) {
    const x = 70 + i * (cardW + gap)
    const tone = TONES[c.tone]
    roundRect(ctx, x, top, cardW, cardH, 32)
    ctx.fillStyle = tone.tint
    ctx.fill()
    ctx.strokeStyle = tone.edge
    ctx.lineWidth = 3
    ctx.stroke()
    // The letter badge.
    ctx.fillStyle = tone.badge
    ctx.beginPath()
    ctx.arc(x + cardW / 2, top, 40, 0, Math.PI * 2)
    ctx.fill()
    ctx.font = `800 44px ${FAMILIES}`
    ctx.fillStyle = "#ffffff"
    ctx.fillText(i === 0 ? "A" : "B", x + cardW / 2, top + 15)
    // The icon.
    if (c.icon === "card") cardIcon(ctx, x + cardW / 2, top + 105, tone.edge)
    else shieldIcon(ctx, x + cardW / 2, top + 105, tone.edge)
    // The choice and its reason.
    ctx.font = `700 40px ${FAMILIES}`
    ctx.fillStyle = "#ffffff"
    const title = wrap(ctx, c.title, cardW - 48, 2)
    if (title.at(-1)?.endsWith("…")) truncated = true
    let ty = top + 205
    for (const line of title) {
      ctx.fillText(line, x + cardW / 2, ty)
      ty += 54
    }
    ctx.font = `500 30px ${FAMILIES}`
    ctx.fillStyle = tone.ink
    const sub = wrap(ctx, c.sub, cardW - 48, 2)
    if (sub.at(-1)?.endsWith("…")) truncated = true
    ty += 8
    for (const line of sub) {
      ctx.fillText(line, x + cardW / 2, ty)
      ty += 42
    }
  }

  // The question.
  ctx.font = `700 48px ${FAMILIES}`
  ctx.fillStyle = "#fcd34d"
  const prompt = wrap(ctx, p.prompt, W - 140, 1)
  if (prompt.at(-1)?.endsWith("…")) truncated = true
  ctx.fillText(prompt[0] ?? "", W / 2, top + cardH + 120)

  // The brand, modest, at the base.
  const brand = "អេប លុយឆ្លាត · app.luychlat.com"
  ctx.font = `600 28px ${FAMILIES}`
  const mascot = posterMascot()
  const icon = mascot ? 44 : 0
  const total = icon + (mascot ? 14 : 0) + ctx.measureText(brand).width
  const bx = (W - total) / 2
  if (mascot) ctx.drawImage(mascot, bx, H - 92, icon, icon)
  ctx.textAlign = "left"
  ctx.fillStyle = "#d1fae5"
  ctx.fillText(brand, bx + icon + (mascot ? 14 : 0), H - 60)

  return { png: canvas.toBuffer("image/png"), truncated }
}
