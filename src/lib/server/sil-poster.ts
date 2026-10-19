// Server only: the Buddhist Sil day poster (founder, 19/10/2026 — lib/sil-poster.ts has the words). 1080 × 1350:
// the founder's licensed photograph (public/images/buddhist_sil_day_bg.jpg) whole in a gold frame between the title and
// the blessing — no word is ever drawn over the Buddha image (over the head is disrespectful) — on the same photograph
// blurred behind; without the file, a gold halo and a lotus. The standard rabbit logo; the day's lunar and calendar
// dates; «សូមអនុមោទនា» and «ថ្ងៃនេះជាថ្ងៃសីល» in gold; the blessing; the call to the app. No emoji drawn (the server
// has no colour emoji font).
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

import { createCanvas, loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas"

import type { SilPosterContent } from "@/lib/sil-poster"

import { drawIcon, FAMILIES, loadFonts, roundRect } from "./poster-kit"

export const SIL_POSTER = { W: 1080, H: 1350, background: "public/images/buddhist_sil_day_bg.jpg" } as const
const { W, H } = SIL_POSTER
const GOLD = "#fcd34d"

let art: { bg: Image | null; logo: Image | null } = { bg: null, logo: null }
const load = async (file: string) => {
  const p = path.join(process.cwd(), file)
  return existsSync(p) ? loadImage(readFileSync(p)).catch(() => null) : null
}
/** The background (when the founder's file is in place) and the logo, decoded once. */
export const silPosterReady: Promise<void> = Promise.all([load(SIL_POSTER.background), load("public/logo.png")]).then(([bg, logo]) => {
  art = { bg, logo }
})

/** Is the founder's background photograph in place (else the drawn field). */
export const silBackgroundInPlace = () => art.bg !== null

/** The photograph's frame: between the title and the blessing — no word ever over the Buddha image. */
export const SIL_FRAME = { top: 425, bottom: 1035, maxWidth: 860 } as const
/** The words' places (baselines and sizes) — the frame sits between the title and the blessing (sil-poster.test.ts). */
export const SIL_LAYOUT = { headline: 248, headlineSize: 62, title: 365, titleSize: 100, blessing: 1098, blessingSize: 36, divider: 1188, cta: 1242, links: 1304 } as const

function background(ctx: SKRSContext2D) {
  if (art.bg) {
    // The photograph, blurred and darkened, fills the poster behind everything.
    const s = Math.max(W / art.bg.width, H / art.bg.height) * 1.08
    ctx.save()
    ctx.filter = "blur(28px)"
    ctx.drawImage(art.bg, (W - art.bg.width * s) / 2, (H - art.bg.height * s) / 2, art.bg.width * s, art.bg.height * s)
    ctx.restore()
    ctx.fillStyle = "rgba(2,20,14,0.55)"
    ctx.fillRect(0, 0, W, H)
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, H)
    g.addColorStop(0, "#022c22")
    g.addColorStop(0.55, "#064e3b")
    g.addColorStop(1, "#1c1206")
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
  }
}

/**
 * The centrepiece in its frame: the photograph whole (contained, never cropped through the Buddha image), gold-ringed —
 * or, without the founder's file, a gold halo and a lotus.
 */
function centrepiece(ctx: SKRSContext2D) {
  const boxH = SIL_FRAME.bottom - SIL_FRAME.top
  if (art.bg) {
    const s = Math.min(SIL_FRAME.maxWidth / art.bg.width, boxH / art.bg.height)
    const w = art.bg.width * s
    const h = art.bg.height * s
    const x = (W - w) / 2
    const y = SIL_FRAME.top + (boxH - h) / 2
    ctx.save()
    ctx.shadowColor = "rgba(0,0,0,0.6)"
    ctx.shadowBlur = 40
    roundRect(ctx, x, y, w, h, 28)
    ctx.fillStyle = "#000"
    ctx.fill()
    ctx.restore()
    ctx.save()
    roundRect(ctx, x, y, w, h, 28)
    ctx.clip()
    ctx.drawImage(art.bg, x, y, w, h)
    ctx.restore()
    roundRect(ctx, x, y, w, h, 28)
    ctx.lineWidth = 4
    ctx.strokeStyle = "rgba(252,211,77,0.85)"
    ctx.stroke()
    return
  }
  const cy = (SIL_FRAME.top + SIL_FRAME.bottom) / 2
  const halo = ctx.createRadialGradient(W / 2, cy, 0, W / 2, cy, 380)
  halo.addColorStop(0, "rgba(253,230,138,0.5)")
  halo.addColorStop(0.5, "rgba(245,158,11,0.15)")
  halo.addColorStop(1, "rgba(245,158,11,0)")
  ctx.fillStyle = halo
  ctx.fillRect(0, SIL_FRAME.top - 60, W, boxH + 120)
  lotus(ctx, W / 2, cy + 150, 250)
}

/** A gold lotus outline (the drawn field's centrepiece). */
function lotus(ctx: SKRSContext2D, cx: number, cy: number, r: number, icon = false) {
  ctx.save()
  ctx.strokeStyle = icon ? "#fcd34d" : "rgba(252,211,77,0.7)"
  ctx.fillStyle = icon ? "rgba(252,211,77,0.45)" : "rgba(252,211,77,0.08)"
  ctx.lineWidth = icon ? 1.6 : 3
  for (const [angle, scale] of [[0, 1], [-0.55, 0.85], [0.55, 0.85], [-1.05, 0.65], [1.05, 0.65]] as const) {
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(angle)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.quadraticCurveTo(r * 0.42 * scale, -r * 0.55 * scale, 0, -r * scale)
    ctx.quadraticCurveTo(-r * 0.42 * scale, -r * 0.55 * scale, 0, 0)
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  }
  ctx.restore()
}

function shadowed(ctx: SKRSContext2D, draw: () => void, blur = 14) {
  ctx.save()
  ctx.shadowColor = "rgba(0,0,0,0.7)"
  ctx.shadowBlur = blur
  ctx.shadowOffsetY = 2
  draw()
  ctx.restore()
}

/** The Sil day poster as a PNG. */
export function renderSilPoster(c: SilPosterContent): Buffer {
  loadFonts()
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext("2d")
  background(ctx)
  centrepiece(ctx)
  ctx.textBaseline = "alphabetic"

  // The brand: the standard rabbit logo, «អេប លុយឆ្លាត · សហគមន៍».
  const x = 70
  const top = 44
  const mark = 84
  if (art.logo) {
    ctx.save()
    roundRect(ctx, x, top, mark, mark, 22)
    ctx.clip()
    ctx.drawImage(art.logo, x, top, mark, mark)
    ctx.restore()
  }
  roundRect(ctx, x, top, mark, mark, 22)
  ctx.lineWidth = 2.5
  ctx.strokeStyle = GOLD
  ctx.stroke()
  shadowed(ctx, () => {
    ctx.textAlign = "left"
    ctx.font = `700 40px ${FAMILIES}`
    ctx.fillStyle = "#ffffff"
    ctx.fillText("អេប លុយឆ្លាត", x + mark + 22, top + 44)
    ctx.font = `600 30px ${FAMILIES}`
    ctx.fillStyle = GOLD
    ctx.fillText("សហគមន៍", x + mark + 22, top + 84)
  })

  // The day, top right, two lines (founder, 19/10/2026): «🪷 ថ្ងៃសីល (…)» / «ត្រូវនឹង ថ្ងៃ…» — the lotus drawn, not an emoji.
  const right = W - 70
  const room = right - (x + mark + 22 + 250) // clear of the brand
  let dateSize = 28
  for (const s of [28, 26, 24, 22]) {
    ctx.font = `600 ${s}px ${FAMILIES}`
    dateSize = s
    if (Math.max(...c.dateLines.map((l) => ctx.measureText(l).width)) + 36 <= room) break
  }
  shadowed(ctx, () => {
    ctx.textAlign = "right"
    ctx.font = `600 ${dateSize}px ${FAMILIES}`
    ctx.fillStyle = "rgba(209,250,229,0.95)"
    ctx.fillText(c.dateLines[0], right, top + 38)
    const w0 = ctx.measureText(c.dateLines[0]).width
    lotus(ctx, right - w0 - 22, top + 34, 18, true)
    ctx.font = `500 ${dateSize - 2}px ${FAMILIES}`
    ctx.fillStyle = "rgba(209,250,229,0.85)"
    ctx.fillText(c.dateLines[1], right, top + 38 + Math.round(dateSize * 1.5))
  }, 8)
  ctx.textAlign = "center"

  // «សូមអនុមោទនា» / «ថ្ងៃនេះជាថ្ងៃសីល» — large, centred, gold with a warm glow; room to breathe.
  ctx.save()
  ctx.shadowColor = "rgba(251,191,36,0.55)"
  ctx.shadowBlur = 30
  ctx.font = `700 ${SIL_LAYOUT.headlineSize}px ${FAMILIES}`
  ctx.fillStyle = "#fef3c7"
  ctx.fillText(c.headline, W / 2, SIL_LAYOUT.headline)
  ctx.font = `800 ${SIL_LAYOUT.titleSize}px ${FAMILIES}`
  const gold = ctx.createLinearGradient(0, SIL_LAYOUT.title - SIL_LAYOUT.titleSize, 0, SIL_LAYOUT.title)
  gold.addColorStop(0, "#fef3c7")
  gold.addColorStop(0.5, "#fcd34d")
  gold.addColorStop(1, "#d97706")
  ctx.fillStyle = gold
  ctx.fillText(c.title, W / 2, SIL_LAYOUT.title)
  ctx.restore()

  // The blessing: two balanced lines, line height 1.65, centred.
  ctx.font = `500 ${SIL_LAYOUT.blessingSize}px ${FAMILIES}`
  shadowed(ctx, () => {
    ctx.fillStyle = "#ffffff"
    c.blessingLines.forEach((l, i) => ctx.fillText(l, W / 2, SIL_LAYOUT.blessing + i * Math.round(SIL_LAYOUT.blessingSize * 1.65)))
  })

  // The call to the app, then the links.
  ctx.fillStyle = "rgba(252,211,77,0.55)"
  ctx.fillRect(120, SIL_LAYOUT.divider, W - 240, 1.5)
  for (const s of [30, 28, 26, 24]) {
    ctx.font = `500 ${s}px ${FAMILIES}`
    if (ctx.measureText(c.cta).width <= W - 160) break
  }
  ctx.fillStyle = "rgba(253,230,138,0.95)"
  ctx.fillText(c.cta, W / 2, SIL_LAYOUT.cta)
  ctx.font = `600 30px ${FAMILIES}`
  const [a, b] = c.links
  const gap = 34
  const aw = ctx.measureText(a).width
  const bw = ctx.measureText(b).width
  const dot = ctx.measureText("•").width
  let lx = (W - (40 + aw + gap + dot + gap + 40 + bw)) / 2
  const ly = SIL_LAYOUT.links
  ctx.textAlign = "left"
  drawIcon(ctx, "globe", lx + 14, ly - 10)
  ctx.fillStyle = "#ffffff"
  ctx.fillText(a, lx + 40, ly)
  lx += 40 + aw + gap
  ctx.fillStyle = "rgba(252,211,77,0.55)"
  ctx.fillText("•", lx, ly)
  lx += dot + gap
  drawIcon(ctx, "plane", lx + 14, ly - 10)
  ctx.fillStyle = "#ffffff"
  ctx.fillText(b, lx + 40, ly)

  return canvas.toBuffer("image/png")
}
