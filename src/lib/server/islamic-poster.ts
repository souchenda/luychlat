// Server only: the @LuyChlatIslamic poster (1080 × 1350 PNG, founder 18/10/2026) — every post to the Islamic
// channel is this poster with its caption (lib/islamic-channel.ts islamicCaptionHtml: the same content):
//
//   HEADER   the kopiah logo (public/icon-islamic.png) + «អេប លុយឆ្លាត» over «សហគមន៍ឥស្លាម»
//   FIELD    deep emerald with a faint eight-point-star lattice, a gold mihrab arch and a double gold border
//   BODY     the gold pill, the Hijri date (large), the day, the title, the text, Imsak / Iftar (a fast day),
//            the source
//   FOOTER   app.luychlat.com  •  @LuyChlatIslamic
//
// Drawn with Skia (@napi-rs/canvas) and the shared Khmer kit (poster-kit.ts: fonts, wrap at Khmer word
// boundaries). The server has no emoji font: icons are drawn.
import { readFileSync } from "node:fs"
import path from "node:path"

import { createCanvas, type Image, loadImage, type SKRSContext2D } from "@napi-rs/canvas"

import type { IslamicPostContent } from "@/lib/islamic-channel"

import { drawIcon, FAMILIES, loadFonts, roundRect, wrap } from "./poster-kit"

export const ISLAMIC_POSTER = { W: 1080, H: 1350 } as const
const { W, H } = ISLAMIC_POSTER
const GOLD = "#e9c46a"
const GOLD_SOFT = "rgba(233,196,106,0.55)"
const SIDE = 120
const FOOTER_TOP = H - 150

let logoImage: Image | null = null
/** The kopiah logo, decoded once (@napi-rs/canvas decodes only through the async loadImage). */
export const islamicPosterReady: Promise<void> = loadImage(readFileSync(path.join(process.cwd(), "public", "icon-islamic.png")))
  .then((img) => {
    logoImage = img
  })
  .catch(() => {})

/** A faint lattice of eight-point stars (two squares, one turned 45°). */
function lattice(ctx: SKRSContext2D) {
  ctx.save()
  ctx.strokeStyle = "rgba(233,196,106,0.07)"
  ctx.lineWidth = 1.5
  const step = 135
  for (let y = -step / 2; y < H + step; y += step) {
    for (let x = (Math.round(y / step) % 2) * (step / 2) - step / 2; x < W + step; x += step) {
      const r = 34
      ctx.beginPath()
      ctx.rect(x - r, y - r, 2 * r, 2 * r)
      ctx.stroke()
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(Math.PI / 4)
      ctx.beginPath()
      ctx.rect(-r, -r, 2 * r, 2 * r)
      ctx.stroke()
      ctx.restore()
    }
  }
  ctx.restore()
}

/** The pointed mihrab arch framing the body. */
function arch(ctx: SKRSContext2D, top: number, bottom: number) {
  const left = 64
  const right = W - 64
  const spring = top + 150
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(left, bottom)
  ctx.lineTo(left, spring)
  ctx.quadraticCurveTo(left, top + 20, W / 2, top)
  ctx.quadraticCurveTo(right, top + 20, right, spring)
  ctx.lineTo(right, bottom)
  ctx.lineWidth = 2.5
  ctx.strokeStyle = GOLD_SOFT
  ctx.stroke()
  ctx.restore()
}

function border(ctx: SKRSContext2D) {
  roundRect(ctx, 22, 22, W - 44, H - 44, 40)
  ctx.lineWidth = 4
  ctx.strokeStyle = GOLD
  ctx.stroke()
  roundRect(ctx, 34, 34, W - 68, H - 68, 32)
  ctx.lineWidth = 1.2
  ctx.strokeStyle = GOLD_SOFT
  ctx.stroke()
}

/** A small gold diamond ornament between two hairlines. */
function ornament(ctx: SKRSContext2D, y: number) {
  ctx.save()
  ctx.strokeStyle = GOLD_SOFT
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(W / 2 - 150, y)
  ctx.lineTo(W / 2 - 18, y)
  ctx.moveTo(W / 2 + 18, y)
  ctx.lineTo(W / 2 + 150, y)
  ctx.stroke()
  ctx.fillStyle = GOLD
  ctx.beginPath()
  ctx.moveTo(W / 2, y - 9)
  ctx.lineTo(W / 2 + 9, y)
  ctx.lineTo(W / 2, y + 9)
  ctx.lineTo(W / 2 - 9, y)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

/** The crescent drawn in gold (header, when the logo file is missing). */
function crescent(ctx: SKRSContext2D, cx: number, cy: number, r: number) {
  ctx.save()
  ctx.fillStyle = GOLD
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.arc(cx + r * 0.38, cy - r * 0.2, r * 0.82, 0, Math.PI * 2, true)
  ctx.fill("evenodd")
  ctx.restore()
}

function header(ctx: SKRSContext2D) {
  const top = 70
  const mark = 96
  const x = 76
  if (logoImage) {
    ctx.save()
    roundRect(ctx, x, top, mark, mark, 24)
    ctx.clip()
    ctx.drawImage(logoImage, x, top, mark, mark)
    ctx.restore()
  } else crescent(ctx, x + mark / 2, top + mark / 2, mark / 2.4)
  roundRect(ctx, x, top, mark, mark, 24)
  ctx.lineWidth = 2.5
  ctx.strokeStyle = GOLD
  ctx.stroke()
  ctx.textAlign = "left"
  ctx.textBaseline = "alphabetic"
  ctx.font = `700 40px ${FAMILIES}`
  ctx.fillStyle = "#ffffff"
  ctx.fillText("អេប លុយឆ្លាត", x + mark + 22, top + 44)
  ctx.font = `600 30px ${FAMILIES}`
  ctx.fillStyle = GOLD
  ctx.fillText("សហគមន៍ឥស្លាម", x + mark + 22, top + 86)
}

function footer(ctx: SKRSContext2D) {
  ctx.fillStyle = GOLD_SOFT
  ctx.fillRect(SIDE, FOOTER_TOP, W - 2 * SIDE, 1.5)
  const y = FOOTER_TOP + 72
  ctx.font = `600 30px ${FAMILIES}`
  ctx.textBaseline = "alphabetic"
  ctx.textAlign = "left"
  const a = "app.luychlat.com"
  const b = "@LuyChlatIslamic"
  const gap = 34
  const aw = ctx.measureText(a).width
  const bw = ctx.measureText(b).width
  const dot = ctx.measureText("•").width
  const total = 40 + aw + gap + dot + gap + 40 + bw
  let x = (W - total) / 2
  drawIcon(ctx, "globe", x + 14, y - 10)
  ctx.fillStyle = "#ffffff"
  ctx.fillText(a, x + 40, y)
  x += 40 + aw + gap
  ctx.fillStyle = GOLD_SOFT
  ctx.fillText("•", x, y)
  x += dot + gap
  drawIcon(ctx, "plane", x + 14, y - 10)
  ctx.fillStyle = "#ffffff"
  ctx.fillText(b, x + 40, y)
}

/**
 * «ﷺ» is a single ligature many fonts lack; on the poster it is written in Arabic letters «(صلى الله عليه وسلم)»,
 * which any Arabic font draws (Noto Arabic in the container — Dockerfile). The caption keeps «ﷺ» (phones show it).
 */
export const posterText = (s: string) => s.replace(/\s*ﷺ/g, " (صلى الله عليه وسلم)")

/** Draws the poster; `truncated` says whether any text had to be cut («…») to fit. */
export function renderIslamicPoster(c: IslamicPostContent): { png: Buffer; truncated: boolean } {
  loadFonts()
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext("2d")
  let truncated = false
  const lines = (text: string, width: number, max: number) => {
    const out = wrap(ctx, text, width, max)
    if (out.length && out[out.length - 1].endsWith("…") && !text.endsWith("…")) truncated = true
    return out
  }

  // The field.
  const bg = ctx.createLinearGradient(0, 0, W * 0.35, H)
  bg.addColorStop(0, "#022c22")
  bg.addColorStop(0.55, "#064e3b")
  bg.addColorStop(1, "#065f46")
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  lattice(ctx)
  const glow = ctx.createRadialGradient(W / 2, H * 0.32, 0, W / 2, H * 0.32, W * 0.7)
  glow.addColorStop(0, "rgba(16,185,129,0.22)")
  glow.addColorStop(1, "rgba(16,185,129,0)")
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)
  border(ctx)
  arch(ctx, 200, FOOTER_TOP - 24)
  header(ctx)

  ctx.textAlign = "center"
  ctx.textBaseline = "alphabetic"
  let y = 322

  // The gold pill.
  ctx.font = `700 30px ${FAMILIES}`
  const pillW = Math.min(W - 2 * SIDE, ctx.measureText(c.pill).width + 64)
  roundRect(ctx, (W - pillW) / 2, y - 40, pillW, 58, 29)
  ctx.fillStyle = "rgba(233,196,106,0.16)"
  ctx.fill()
  ctx.lineWidth = 2
  ctx.strokeStyle = GOLD
  ctx.stroke()
  ctx.fillStyle = GOLD
  ctx.fillText(c.pill, W / 2, y)
  y += 82

  // The Hijri date (large, one line) and the day.
  if (c.hijriShort) {
    ctx.font = `700 46px ${FAMILIES}`
    ctx.fillStyle = GOLD
    ctx.fillText(lines(c.hijriShort, W - 2 * SIDE, 1)[0] ?? "", W / 2, y)
    y += 58
  }
  ctx.font = `500 30px ${FAMILIES}`
  ctx.fillStyle = "rgba(209,250,229,0.85)"
  ctx.fillText(c.date, W / 2, y)
  y += 36
  ornament(ctx, y)
  y += 70

  // The title.
  ctx.font = `700 50px ${FAMILIES}`
  ctx.fillStyle = "#ffffff"
  for (const l of lines(c.title, W - 2 * SIDE, 2)) {
    ctx.fillText(l, W / 2, y)
    y += 68
  }
  y += 10

  // Reserve the fast times, the source and the footer; the text takes what is left.
  const fastH = c.fast ? 186 : 0
  const sourceH = 58
  const bodyBottom = FOOTER_TOP - 32 - sourceH - fastH
  // The text: the largest size that fits (40 → 31 px), centred in the space left; cut only as a last resort.
  ctx.textAlign = "left"
  const bodyW = W - 2 * SIDE
  const paragraphs = (c.posterParagraphs ?? c.paragraphs).map(posterText)
  const GAP = 12
  let size = 36
  let lineH = 58
  let laidOut: string[][] = []
  for (const [s, h] of [[40, 64], [36, 58], [33, 54], [31, 50]] as const) {
    ctx.font = `400 ${s}px ${FAMILIES}`
    laidOut = paragraphs.map((p) => wrap(ctx, p, bodyW, 99))
    size = s
    lineH = h
    const height = laidOut.reduce((t, l) => t + l.length * lineH, 0) + GAP * (laidOut.length - 1)
    if (y + height <= bodyBottom) break
  }
  const height = laidOut.reduce((t, l) => t + l.length * lineH, 0) + GAP * (laidOut.length - 1)
  if (y + height <= bodyBottom) y += Math.max(0, (bodyBottom - y - height) / 2) // centred
  ctx.font = `400 ${size}px ${FAMILIES}`
  for (const [i, p] of paragraphs.entries()) {
    const room = Math.floor((bodyBottom - y) / lineH)
    if (room <= 0) {
      truncated = true
      break
    }
    ctx.fillStyle = i === 0 ? "#ecfdf5" : "rgba(209,250,229,0.8)"
    for (const l of lines(p, bodyW, room)) {
      ctx.fillText(l, SIDE, y)
      y += lineH
    }
    y += GAP
  }

  // Imsak / Iftar for a fast day.
  if (c.fast) {
    const top = FOOTER_TOP - 32 - sourceH - fastH + 14
    const boxW = (W - 2 * SIDE - 28) / 2
    const boxes: [string, string][] = [
      ["អ៊ឹមសាក់ (Imsak)", c.fast.imsak],
      ["ស្រាយបួស (Iftar)", c.fast.iftar],
    ]
    boxes.forEach(([label, time], i) => {
      const x = SIDE + i * (boxW + 28)
      roundRect(ctx, x, top, boxW, 140, 28)
      ctx.fillStyle = "rgba(255,255,255,0.07)"
      ctx.fill()
      ctx.lineWidth = 1.5
      ctx.strokeStyle = GOLD_SOFT
      ctx.stroke()
      ctx.textAlign = "center"
      ctx.font = `500 28px ${FAMILIES}`
      ctx.fillStyle = "rgba(209,250,229,0.85)"
      ctx.fillText(label, x + boxW / 2, top + 48)
      ctx.font = `700 56px ${FAMILIES}`
      ctx.fillStyle = GOLD
      ctx.fillText(time, x + boxW / 2, top + 114)
    })
    ctx.font = `400 24px ${FAMILIES}`
    ctx.fillStyle = "rgba(209,250,229,0.7)"
    ctx.textAlign = "center"
    ctx.fillText(`ម៉ោងនៅ${c.fast.place} · ស្អែក`, W / 2, top + 176)
  }

  // The source.
  ctx.textAlign = "center"
  ctx.font = `600 28px ${FAMILIES}`
  ctx.fillStyle = GOLD
  ctx.fillText(lines(`ប្រភព៖ ${c.source.label}`, W - 2 * SIDE, 1)[0] ?? "", W / 2, FOOTER_TOP - 34)

  footer(ctx)
  return { png: canvas.toBuffer("image/png"), truncated }
}

export const islamicPoster = (c: IslamicPostContent): Buffer => renderIslamicPoster(c).png
