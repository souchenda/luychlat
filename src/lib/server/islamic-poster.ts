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

import { posterCta, posterDateline, type IslamicPostContent } from "@/lib/islamic-channel"
import * as G from "@/lib/islamic/glossary"

import { ARABIC_FAMILIES, drawIcon, FAMILIES, loadFonts, roundRect, wrap } from "./poster-kit"
import { latinCanvas } from "@/lib/numerals"

export const ISLAMIC_POSTER = { W: 1080, H: 1350 } as const
const { W, H } = ISLAMIC_POSTER
const GOLD = "#e9c46a"
const GOLD_SOFT = "rgba(233,196,106,0.55)"
const SIDE = 120

/**
 * The type scale, largest first: the hero title, then the Arabic du'a, the text, and the dateline last — quiet
 * metadata (~11 px on a phone; the poster is shown at about a third of its 1080 px). Each list: the sizes tried,
 * largest first, until the line fits.
 */
export const POSTER_TYPE = {
  title: [66, 60, 54, 48],
  titleTwoLines: 54,
  /** The Arabic under the title (Amiri): a companion, smaller than the du'a. */
  titleArabic: [44, 40, 36],
  /** A du'a (Amiri). */
  arabic: [54, 50, 46, 42],
  bodyMax: 40,
  /** Khmer body leading (founder, 18/10/2026: 1.65–1.75 — subscripts and vowels never touch). */
  leading: 1.7,
  /** The hook lines (one or two short lines instead of paragraphs). */
  quote: [44, 42, 40, 38, 36, 34],
  /** Only when a two-line hook does not fit at 34 px (a font with a wide «ﷺ»). */
  quoteFallback: [32, 30],
  dateline: [30, 28, 26],
  /** The call to action above the links (~11 px on a phone). */
  cta: [30, 28, 26],
} as const
/** The footer: the rule, the call to action, the links (founder, 18/10/2026 — the links alone gave no reason to open). */
const FOOTER_TOP = H - 204
/** The space between two hook lines. */
const HOOK_GAP = 18
/** The hooks are centred and may use a little more width than the paragraphs (still inside the arch). */
const HOOK_SIDE = 108

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

/**
 * A hook too long for one line, in two halves of about the same width: at «·» when there is one, else at the space
 * nearest the middle — never one word left alone on the second line. Falls back to the normal wrap.
 */
export function balancedSplit(ctx: SKRSContext2D, text: string, width: number): string[] {
  const dot = text.indexOf(" · ")
  const candidates = dot > 0 ? [dot] : [...text.matchAll(/ /g)].map((m) => m.index!)
  let best: string[] | null = null
  let bestDiff = Infinity
  for (const i of candidates) {
    const a = text.slice(0, i).trim()
    const b = text.slice(i).replace(/^ ·? ?/, "").trim()
    const wa = ctx.measureText(a).width
    const wb = ctx.measureText(b).width
    if (wa > width || wb > width) continue
    if (Math.abs(wa - wb) < bestDiff) {
      bestDiff = Math.abs(wa - wb)
      best = [a, b]
    }
  }
  return best ?? wrap(ctx, text, width, 99)
}

function footer(ctx: SKRSContext2D, cta: string) {
  ctx.fillStyle = GOLD_SOFT
  ctx.fillRect(SIDE, FOOTER_TOP, W - 2 * SIDE, 1.5)
  // The call to action: medium weight, soft amber, centred — an invitation, quieter than the content.
  ctx.textAlign = "center"
  ctx.textBaseline = "alphabetic"
  ctx.fillStyle = "rgba(253,230,138,0.9)"
  for (const size of POSTER_TYPE.cta) {
    ctx.font = `500 ${size}px ${FAMILIES}`
    if (ctx.measureText(cta).width <= W - 2 * SIDE) break
  }
  ctx.fillText(cta, W / 2, FOOTER_TOP + 58)
  const y = FOOTER_TOP + 128
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

/** The poster text as written: «ﷺ» stays the ligature (Noto Sans Arabic in the container draws it — Dockerfile). */
export const posterText = (s: string) => s

/** The px sizes a render used (the hierarchy test reads them); `arabic` is null without a du'a. */
export type PosterTypeUsed = {
  dateline: number
  title: number
  titleLines: 1 | 2
  titleArabic: number | null
  arabic: number | null
  /** The paragraph size (0 when the poster has none). */
  body: number
  /** The line height used for the paragraphs or the quote. */
  bodyLineHeight: number
  quote: number | null
  /** The hook lines as drawn (each hook one line, or two balanced halves). */
  hookLines: string[][]
  cta: string
}

/** Draws the poster; `truncated` says whether any text had to be cut («…») to fit; `type` the sizes it used. */
export function renderIslamicPoster(c: IslamicPostContent): { png: Buffer; truncated: boolean; type: PosterTypeUsed } {
  loadFonts()
  const canvas = createCanvas(W, H)
  const ctx = latinCanvas(canvas.getContext("2d")) // 0-9 on the poster (Task #440)
  let truncated = false
  const type: PosterTypeUsed = { dateline: 0, title: 0, titleLines: 1, titleArabic: null, arabic: null, body: 0, bodyLineHeight: 0, quote: null, hookLines: [], cta: posterCta(c.kind) }
  let fitted = 0
  /** Sets the largest of `sizes` at which `text` fits one line; false (smallest set) when none does. */
  const fitLine = (text: string, weight: number, sizes: number[], families = FAMILIES) => {
    for (const size of sizes) {
      ctx.font = `${weight} ${size}px ${families}`
      fitted = size
      if (ctx.measureText(text).width <= W - 2 * SIDE) return true
    }
    return false
  }
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
  arch(ctx, 186, FOOTER_TOP - 24)
  header(ctx)

  ctx.textAlign = "center"
  ctx.textBaseline = "alphabetic"
  let y = 302

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
  y += 76

  // The dateline: quiet metadata, one line, never competing with the title (founder, 18/10/2026 — the Hijri date
  // was drawn larger than the title). «Gregorian (ត្រូវនឹង Hijri)».
  const dateline = posterDateline(c)
  ctx.fillStyle = "rgba(167,243,208,0.8)"
  fitLine(dateline, 400, [...POSTER_TYPE.dateline])
  type.dateline = fitted
  ctx.fillText(dateline, W / 2, y - 6)
  y += 30
  ornament(ctx, y)
  y += 80

  // The hero title — the post's real subject, the largest text on the poster; one line when it fits, else two.
  ctx.fillStyle = "#ffffff"
  if (fitLine(c.title, 700, [...POSTER_TYPE.title])) {
    type.title = fitted
    ctx.fillText(c.title, W / 2, y)
    y += 84
  } else {
    ctx.font = `700 ${POSTER_TYPE.titleTwoLines}px ${FAMILIES}`
    type.title = POSTER_TYPE.titleTwoLines
    type.titleLines = 2
    for (const l of lines(c.title, W - 2 * SIDE, 2)) {
      ctx.fillText(l, W / 2, y)
      y += 70
    }
    y += 6
  }

  // The title's Arabic companion (Amiri): soft gold, one line, under the hero.
  if (c.titleArabic) {
    ctx.textAlign = "center"
    ctx.fillStyle = "rgba(253,230,138,0.92)"
    fitLine(c.titleArabic, 400, [...POSTER_TYPE.titleArabic], ARABIC_FAMILIES)
    type.titleArabic = fitted
    ctx.fillText(c.titleArabic, W / 2, y - 8)
    y += c.arabic ? 78 : 58
  }

  // A du'a in Arabic (Amiri): gold, centred, crisp — the largest size that fits on one line (else two).
  if (c.arabic) {
    if (!c.titleArabic) y += 14 // room for Amiri's tall marks under the title
    ctx.textAlign = "center"
    ctx.fillStyle = GOLD
    const oneLine = fitLine(c.arabic, 700, [...POSTER_TYPE.arabic], ARABIC_FAMILIES)
    type.arabic = fitted
    if (oneLine) {
      ctx.fillText(c.arabic, W / 2, y + 6)
      y += 78
    } else {
      ctx.font = `700 ${POSTER_TYPE.arabic[POSTER_TYPE.arabic.length - 1]}px ${ARABIC_FAMILIES}`
      for (const l of lines(c.arabic, W - 2 * SIDE, 2)) {
        ctx.fillText(l, W / 2, y + 6)
        y += 60
      }
      y += 14
    }
  }

  // Reserve the fast times / prayer times, the source and the footer; the text takes what is left.
  const fastH = c.fast ? 168 : c.prayers ? 138 : 0
  const sourceH = 58
  const bodyW = W - 2 * SIDE
  const bodyBottom = FOOTER_TOP - 32 - sourceH - fastH
  const leading = (s: number) => Math.round(s * POSTER_TYPE.leading)
  /** Centres a block of `height` in the space left. */
  const centreBlock = (height: number) => {
    if (y + height <= bodyBottom) y += Math.max(0, (bodyBottom - y - height) / 2)
  }
  // Breathing room between the heading and the text (founder, 18/10/2026).
  y += 18

  // The hook: one to three short lines, centred and large; the first white, the next soft gold. Never cut; a hook too
  // long for one line splits in two balanced halves, a longer one (a du'a's meaning, founder 19/10/2026) in three.
  if (c.posterLines?.length) {
    ctx.textAlign = "center"
    // Each hook keeps the fewest lines it can (one, else two balanced halves at the smallest size); then the largest
    // size at which every hook still fits in that many lines.
    const hookW = W - 2 * HOOK_SIDE
    const sizes = [...POSTER_TYPE.quote, ...POSTER_TYPE.quoteFallback]
    const layout = (text: string, s: number, maxLines: number): string[] | null => {
      ctx.font = `500 ${s}px ${FAMILIES}`
      if (ctx.measureText(text).width <= hookW) return [text]
      if (maxLines < 2) return null
      const halves = balancedSplit(ctx, text, hookW)
      if (halves.length === 2) return halves
      if (maxLines < 3) return null
      const thirds = wrap(ctx, text, hookW, 99)
      return thirds.length <= 3 ? thirds : null
    }
    const hooks = c.posterLines.map(posterText)
    const smallest = POSTER_TYPE.quote[POSTER_TYPE.quote.length - 1]
    const most = c.posterHookLines ?? 2
    const need = hooks.map((h) => (layout(h, smallest, 1) ? 1 : most < 3 || layout(h, smallest, 2) ? 2 : 3))
    let qs: number = sizes[sizes.length - 1]
    // The fallback (no size fits the space): the smallest size, wrapped — never cut.
    let laid: string[][] = hooks.map((h, i) => layout(h, qs, need[i]) ?? wrap(ctx, h, hookW, 99))
    for (const s of sizes) {
      const tryLaid = hooks.map((h, i) => layout(h, s, need[i]))
      const h = tryLaid.reduce((t, l) => t + (l?.length ?? 99) * leading(s), 0) + HOOK_GAP * (hooks.length - 1)
      if (tryLaid.every(Boolean) && y + h <= bodyBottom) {
        qs = s
        laid = tryLaid as string[][]
        break
      }
    }
    type.quote = qs
    type.hookLines = laid
    type.bodyLineHeight = leading(qs)
    centreBlock(laid.reduce((t, l) => t + l.length * leading(qs), 0) + HOOK_GAP * (laid.length - 1))
    y += Math.round(qs * 0.8) // the first baseline
    ctx.font = `500 ${qs}px ${FAMILIES}`
    laid.forEach((block, i) => {
      ctx.fillStyle = i === 0 ? "#ecfdf5" : "rgba(253,230,138,0.95)"
      for (const l of block) {
        if (y > bodyBottom + qs) truncated = true
        else ctx.fillText(l, W / 2, y)
        y += leading(qs)
      }
      y += HOOK_GAP
    })
  }

  // The text: the largest size that fits (40 → 29 px), centred in the space left; cut only as a last resort.
  ctx.textAlign = "left"
  const paragraphs = c.posterLines ? [] : (c.posterParagraphs ?? c.paragraphs).map(posterText)
  const GAP = 26
  let size = 36
  let lineH = leading(size)
  let laidOut: string[][] = []
  for (const s of [40, 38, 36, 34, 32, 30, 29]) {
    ctx.font = `400 ${s}px ${FAMILIES}`
    laidOut = paragraphs.map((p) => wrap(ctx, p, bodyW, 99))
    size = s
    lineH = leading(s)
    const height = laidOut.reduce((t, l) => t + l.length * lineH, 0) + GAP * (laidOut.length - 1)
    if (y + height <= bodyBottom) break
  }
  const height = laidOut.reduce((t, l) => t + l.length * lineH, 0) + GAP * (laidOut.length - 1)
  if (paragraphs.length) {
    centreBlock(height)
    type.body = size
    type.bodyLineHeight = lineH
  }
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
      [G.IMSAK_CARD, c.fast.imsak],
      [G.IFTAR_CARD, c.fast.iftar],
    ]
    boxes.forEach(([label, time], i) => {
      const x = SIDE + i * (boxW + 28)
      roundRect(ctx, x, top, boxW, 124, 28)
      ctx.fillStyle = "rgba(255,255,255,0.07)"
      ctx.fill()
      ctx.lineWidth = 1.5
      ctx.strokeStyle = GOLD_SOFT
      ctx.stroke()
      ctx.textAlign = "center"
      ctx.font = `500 28px ${FAMILIES}`
      ctx.fillStyle = "rgba(209,250,229,0.85)"
      ctx.fillText(label, x + boxW / 2, top + 44)
      ctx.font = `700 56px ${FAMILIES}`
      ctx.fillStyle = GOLD
      ctx.fillText(time, x + boxW / 2, top + 104)
    })
    ctx.font = `400 24px ${FAMILIES}`
    ctx.fillStyle = "rgba(209,250,229,0.7)"
    ctx.textAlign = "center"
    ctx.fillText(c.fast.day ? `ម៉ោងបួស${c.fast.day} · ${c.fast.place}` : `ម៉ោងនៅ${c.fast.place}`, W / 2, top + 158)
  }

  // The day's five prayer times (Phnom Penh).
  if (c.prayers) {
    const top = FOOTER_TOP - 32 - sourceH - fastH + 10
    const gap = 12
    const boxW = (W - 2 * SIDE - gap * (c.prayers.length - 1)) / c.prayers.length
    c.prayers.forEach((p, i) => {
      const x = SIDE + i * (boxW + gap)
      roundRect(ctx, x, top, boxW, 96, 22)
      ctx.fillStyle = "rgba(255,255,255,0.07)"
      ctx.fill()
      ctx.lineWidth = 1.5
      ctx.strokeStyle = GOLD_SOFT
      ctx.stroke()
      ctx.textAlign = "center"
      ctx.font = `500 24px ${FAMILIES}`
      ctx.fillStyle = "rgba(209,250,229,0.85)"
      ctx.fillText(p.label, x + boxW / 2, top + 38)
      ctx.font = `700 34px ${FAMILIES}`
      ctx.fillStyle = GOLD
      ctx.fillText(p.time, x + boxW / 2, top + 78)
    })
    ctx.font = `400 24px ${FAMILIES}`
    ctx.fillStyle = "rgba(209,250,229,0.7)"
    ctx.textAlign = "center"
    ctx.fillText("ម៉ោងថ្វាយបង្គំថ្ងៃនេះ · ភ្នំពេញ", W / 2, top + 126)
  }

  // The source.
  ctx.textAlign = "center"
  ctx.font = `600 28px ${FAMILIES}`
  ctx.fillStyle = GOLD
  ctx.fillText(lines(`ប្រភព៖ ${c.posterSource ?? c.source.label}`, W - 2 * SIDE, 1)[0] ?? "", W / 2, FOOTER_TOP - 34)

  footer(ctx, type.cta)
  return { png: canvas.toBuffer("image/png"), truncated, type }
}

export const islamicPoster = (c: IslamicPostContent): Buffer => renderIslamicPoster(c).png
