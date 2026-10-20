// Server only: a national day or royal ceremony as a poster (founder, 20/10/2026) on the standard frame (poster-kit.ts):
// deep emerald and gold, the brand header and footer; centred — the title, the royal name or occasion, the dates as a
// gold chip, then the blessing. Text only: no royal portrait or emblem (the app holds no licensed copy). A merit day
// (Visak Bochea) carries the gold lotus; a memorial day is drawn quieter, in softer gold.
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

import { createCanvas, loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas"

import { nationalDateLine, type NationalDay } from "@/lib/calendar/cambodia-holidays"

import { lotus } from "./festival-poster"
import { FAMILIES, FRAME, drawFooter, drawHeader, loadFonts, posterMascot, roundRect, wrap } from "./poster-kit"

// The official images (public/images/holidays, README.txt): only the files really there; none is ever invented.
const ASSET_FILES = {
  crest: "royal_crest_gold.png",
  monument: "bg_independence_monument.png",
  king_sihamoni: "portrait_king_sihamoni.png",
  king_father_sihanouk: "portrait_king_father_sihanouk.png",
  queen_mother: "portrait_queen_mother.png",
} as const
type AssetName = keyof typeof ASSET_FILES
const assets: Partial<Record<AssetName, Image>> = {}
const ASSET_DIR = path.join(process.cwd(), "public", "images", "holidays")

/** Decoded once at start-up (canvas decodes only asynchronously); a missing or broken file is simply left out. */
export const nationalAssetsReady: Promise<void> = Promise.all(
  (Object.entries(ASSET_FILES) as [AssetName, string][]).map(async ([name, file]) => {
    const p = path.join(ASSET_DIR, file)
    if (!existsSync(p)) return
    try {
      assets[name] = await loadImage(readFileSync(p))
    } catch {
      // Left out: the poster keeps its text design.
    }
  }),
).then(() => undefined)

/**
 * A credit a portrait's licence asks for, added to the caption (README.txt). The official royal portraits the founder
 * provides need none (founder, 20/10/2026 — never a photo from the web for a royal poster).
 */
export const PORTRAIT_CREDITS: Partial<Record<string, string>> = {}

/** «📷 រូបថត៖ …» for a day whose portrait is shown, else null. */
export function portraitCredit(d: NationalDay): string | null {
  const key = d.assets?.portrait
  return key && assets[key] && PORTRAIT_CREDITS[key] ? `📷 រូបថត៖ ${PORTRAIT_CREDITS[key]}` : null
}

/** Which official images a day shows now. */
export function nationalAssetsFor(d: NationalDay): { portrait: Image | null; crest: Image | null; monument: Image | null } {
  return {
    portrait: d.assets?.portrait ? (assets[d.assets.portrait] ?? null) : null,
    crest: d.assets?.crest ? (assets.crest ?? null) : null,
    monument: d.assets?.monument ? (assets.monument ?? null) : null,
  }
}

const { W, H, PAD } = FRAME

/** Every line the poster draws (tested: no parentheses, nothing cut). */
export function nationalPosterLines(d: NationalDay, day: string) {
  return { pill: d.pill, title: d.title, subtitle: d.subtitle ?? null, date: nationalDateLine(d, day), message: d.message }
}

export function nationalDayPoster(d: NationalDay, day: string): { png: Buffer; truncated: boolean } {
  loadFonts()
  const art = nationalAssetsFor(d)
  if (art.portrait) return portraitPoster(d, day, art)
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

// With the official portrait (founder, 20/10/2026): 1080 x 1350, the arched gold frame, the crest top right.

const PW = 1080
const PH = 1350

/** The arch: a rectangle whose top is a half circle. */
function archPath(ctx: SKRSContext2D, x: number, y: number, w: number, h: number) {
  const r = w / 2
  ctx.beginPath()
  ctx.moveTo(x, y + r)
  ctx.arc(x + r, y + r, r, Math.PI, 0)
  ctx.lineTo(x + w, y + h)
  ctx.lineTo(x, y + h)
  ctx.closePath()
}

/** The picture filling the box from its top (the face is in the upper third, README.txt). */
function drawCover(ctx: SKRSContext2D, img: Image, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.width, h / img.height)
  const dw = img.width * scale
  ctx.drawImage(img, x + (w - dw) / 2, y, dw, img.height * scale)
}

// ─── The national background (founder, 20/10/2026 — «integrate the Royal Palace and Independence Monument») ─────
// Drawn by the app itself — no photo or web image: the Independence Monument (left) and the Throne Hall
// «ព្រះទីនាំងទេវាវិនិច្ឆ័យ» (right) as soft gold silhouettes, a soft blue-red-blue ribbon of the national flag
// behind the arch, and a vignette. Stylised outlines, never a likeness of a photograph.

/** The Independence Monument «វិមានឯករាជ្យ»: stepped base, five tiers with naga heads at the corners, lotus-bud spire. */
function independenceMonument(ctx: SKRSContext2D, cx: number, base: number, s: number) {
  ctx.beginPath()
  let y = base
  for (const w of [230, 196, 164]) {
    ctx.rect(cx - (w * s) / 2, y - 14 * s, w * s, 14 * s)
    y -= 14 * s
  }
  ctx.fill()
  ctx.beginPath()
  for (let i = 0; i < 5; i++) {
    const w = (124 - i * 19) * s
    const h = (56 - i * 4) * s
    const top = y - h
    const l = cx - w / 2
    const r = cx + w / 2
    const horn = (14 - i * 1.5) * s
    ctx.moveTo(l + 6 * s, y)
    ctx.lineTo(l + 6 * s, top + 12 * s)
    // A naga head rising out of each corner.
    ctx.quadraticCurveTo(l - horn * 0.4, top + 6 * s, l - horn * 0.6, top - horn)
    ctx.quadraticCurveTo(l + 4 * s, top - 2 * s, l + 10 * s, top)
    ctx.lineTo(r - 10 * s, top)
    ctx.quadraticCurveTo(r - 4 * s, top - 2 * s, r + horn * 0.6, top - horn)
    ctx.quadraticCurveTo(r + horn * 0.4, top + 6 * s, r - 6 * s, top + 12 * s)
    ctx.lineTo(r - 6 * s, y)
    ctx.closePath()
    y = top
  }
  ctx.fill()
  // The lotus-bud spire.
  const sw = 34 * s
  ctx.beginPath()
  ctx.moveTo(cx - sw / 2, y)
  ctx.bezierCurveTo(cx - sw * 0.75, y - 40 * s, cx - 6 * s, y - 70 * s, cx, y - 96 * s)
  ctx.bezierCurveTo(cx + 6 * s, y - 70 * s, cx + sw * 0.75, y - 40 * s, cx + sw / 2, y)
  ctx.closePath()
  ctx.fill()
}

/** The Throne Hall «ព្រះទីនាំងទេវាវិនិច្ឆ័យ»: platform, colonnade, three tiers of roofs with chofa finials, the spire. */
function throneHall(ctx: SKRSContext2D, cx: number, base: number, s: number) {
  ctx.beginPath()
  ctx.rect(cx - 160 * s, base - 18 * s, 320 * s, 18 * s)
  ctx.fill()
  // The colonnade: pillars, the openings left as the background.
  let y = base - 18 * s
  const bw = 270 * s
  ctx.beginPath()
  ctx.rect(cx - bw / 2, y - 12 * s, bw, 12 * s)
  for (let i = 0; i <= 9; i++) ctx.rect(cx - bw / 2 + (i * (bw - 12 * s)) / 9, y - 62 * s, 12 * s, 50 * s)
  ctx.rect(cx - bw / 2, y - 74 * s, bw, 12 * s)
  ctx.fill()
  y -= 74 * s
  // Three tiers of roofs, each narrower, a chofa curling up at both ends.
  for (let k = 0; k < 3; k++) {
    const wb = (300 - k * 78) * s
    const wt = (180 - k * 56) * s
    const h = (40 - k * 4) * s
    ctx.beginPath()
    ctx.moveTo(cx - wb / 2, y)
    ctx.quadraticCurveTo(cx - wb / 2 + 10 * s, y - h * 0.3, cx - wt / 2, y - h)
    ctx.lineTo(cx + wt / 2, y - h)
    ctx.quadraticCurveTo(cx + wb / 2 - 10 * s, y - h * 0.3, cx + wb / 2, y)
    ctx.closePath()
    ctx.fill()
    for (const dir of [-1, 1]) {
      const ex = cx + (dir * wb) / 2
      ctx.beginPath()
      ctx.moveTo(ex - dir * 8 * s, y)
      ctx.quadraticCurveTo(ex + dir * 10 * s, y - 4 * s, ex + dir * 6 * s, y - 22 * s)
      ctx.lineTo(ex + dir * 1 * s, y - 20 * s)
      ctx.quadraticCurveTo(ex + dir * 3 * s, y - 8 * s, ex - dir * 10 * s, y - 4 * s)
      ctx.closePath()
      ctx.fill()
    }
    y -= h
  }
  // The central spire: tapering stages, then the needle.
  ctx.beginPath()
  for (let i = 0; i < 5; i++) {
    const w = (64 - i * 9) * s
    const h = 24 * s
    ctx.rect(cx - w / 2, y - h, w, h)
    ctx.rect(cx - w / 2 - 4 * s, y - h, w + 8 * s, 4 * s)
    y -= h
  }
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(cx - 10 * s, y)
  ctx.lineTo(cx, y - 110 * s)
  ctx.lineTo(cx + 10 * s, y)
  ctx.closePath()
  ctx.fill()
}

/** The national flag as a soft ribbon (blue · red · blue, 1 : 2 : 1), a gentle wave rising behind the arch from left to
 *  right — above the title, never under the text — fading into the emerald at both ends. */
function flagRibbon(ctx: SKRSContext2D) {
  const layer = createCanvas(PW, PH)
  const g = layer.getContext("2d")
  const centre = (x: number) => 650 - 0.27 * x + 22 * Math.sin(x / 150)
  const bands: [number, number, string][] = [
    [-40, -20, "#032ea1"],
    [-20, 20, "#e00025"],
    [20, 40, "#032ea1"],
  ]
  for (const [band0, band1, colour] of bands) {
    const swell = (x: number) => 1 + 0.25 * Math.sin(x / 210)
    g.beginPath()
    for (let x = -20; x <= PW + 20; x += 10) g.lineTo(x, centre(x) + band0 * swell(x))
    for (let x = PW + 20; x >= -20; x -= 10) g.lineTo(x, centre(x) + band1 * swell(x))
    g.closePath()
    g.fillStyle = colour
    g.fill()
  }
  // Soft at both ends: only the ribbon's own pixels fade (no band over the background).
  const fade = g.createLinearGradient(0, 0, PW, 0)
  fade.addColorStop(0, "rgba(0,0,0,0)")
  fade.addColorStop(0.25, "rgba(0,0,0,1)")
  fade.addColorStop(0.75, "rgba(0,0,0,1)")
  fade.addColorStop(1, "rgba(0,0,0,0)")
  g.globalCompositeOperation = "destination-in"
  g.fillStyle = fade
  g.fillRect(0, 0, PW, PH)
  ctx.save()
  ctx.globalAlpha = 0.2
  ctx.drawImage(layer, 0, 0)
  ctx.restore()
}

/** The layers behind the arch: the ribbon, the two silhouettes at 18 %, the vignette. */
function nationalBackdrop(ctx: SKRSContext2D, base: number) {
  flagRibbon(ctx)
  ctx.save()
  ctx.fillStyle = "#fde68a"
  ctx.globalAlpha = 0.18
  independenceMonument(ctx, 150, base, 1.18)
  throneHall(ctx, PW - 150, base, 0.86)
  ctx.restore()
  // A soft horizon under the buildings.
  const ground = ctx.createLinearGradient(0, base - 2, 0, base + 60)
  ground.addColorStop(0, "rgba(253,230,138,0.14)")
  ground.addColorStop(1, "rgba(253,230,138,0)")
  ctx.fillStyle = ground
  ctx.fillRect(0, base - 2, PW, 62)
  const vignette = ctx.createRadialGradient(PW / 2, PH * 0.42, PH * 0.35, PW / 2, PH * 0.45, PH * 0.85)
  vignette.addColorStop(0, "rgba(0,0,0,0)")
  vignette.addColorStop(1, "rgba(0,0,0,0.45)")
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, PW, PH)
}

function portraitPoster(d: NationalDay, day: string, art: ReturnType<typeof nationalAssetsFor>): { png: Buffer; truncated: boolean } {
  const canvas = createCanvas(PW, PH)
  const ctx = canvas.getContext("2d")
  const text = nationalPosterLines(d, day)
  let truncated = false

  // Deep royal emerald with a gold glow behind the portrait.
  const bg = ctx.createLinearGradient(0, 0, PW * 0.3, PH)
  bg.addColorStop(0, "#052e26")
  bg.addColorStop(0.55, "#064e3b")
  bg.addColorStop(1, "#047857")
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, PW, PH)
  const glow = ctx.createRadialGradient(PW / 2, 430, 0, PW / 2, 430, 560)
  glow.addColorStop(0, "rgba(253,230,138,0.28)")
  glow.addColorStop(1, "rgba(253,230,138,0)")
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, PW, PH)
  // The national depth behind the arch: the flag ribbon, the Monument and the Throne Hall, the vignette.
  nationalBackdrop(ctx, 150 + 560)

  // The brand, top left.
  const mascot = posterMascot()
  if (mascot) ctx.drawImage(mascot, 56, 48, 64, 64)
  ctx.textAlign = "left"
  ctx.textBaseline = "alphabetic"
  ctx.font = `700 30px ${FAMILIES}`
  ctx.fillStyle = "#ffffff"
  ctx.fillText("អេប លុយឆ្លាត", 134, 92)

  // The Royal Coat of Arms, top right, with a soft shadow.
  if (art.crest) {
    const ch = 150
    const cw = (art.crest.width / art.crest.height) * ch
    ctx.save()
    ctx.shadowColor = "rgba(0,0,0,0.45)"
    ctx.shadowBlur = 18
    ctx.shadowOffsetY = 6
    ctx.drawImage(art.crest, PW - 56 - cw, 36, cw, ch)
    ctx.restore()
  }

  // The portrait in the arched gold frame.
  const fw = 470
  const fh = 560
  const fx = (PW - fw) / 2
  const fy = 150
  ctx.save()
  archPath(ctx, fx, fy, fw, fh)
  ctx.clip()
  ctx.fillStyle = "#022c22"
  ctx.fillRect(fx, fy, fw, fh)
  drawCover(ctx, art.portrait!, fx, fy, fw, fh)
  ctx.restore()
  const rim = ctx.createLinearGradient(fx, fy, fx + fw, fy + fh)
  rim.addColorStop(0, "#fde68a")
  rim.addColorStop(0.5, "#d97706")
  rim.addColorStop(1, "#fcd34d")
  archPath(ctx, fx, fy, fw, fh)
  ctx.lineWidth = 10
  ctx.strokeStyle = rim
  ctx.stroke()
  archPath(ctx, fx - 16, fy - 16, fw + 32, fh + 32)
  ctx.lineWidth = 2
  ctx.strokeStyle = "rgba(253,230,138,0.7)"
  ctx.stroke()

  // The text below the portrait, centred.
  const width = PW - 2 * 80
  ctx.textAlign = "center"
  let y = fy + fh + 82
  ctx.font = `700 52px ${FAMILIES}`
  ctx.fillStyle = "#fcd34d"
  const titleLines = wrap(ctx, text.title, width, 2)
  if (titleLines.at(-1)?.endsWith("…")) truncated = true
  for (const line of titleLines) {
    ctx.fillText(line, PW / 2, y)
    y += 68
  }
  if (text.subtitle) {
    ctx.font = `600 30px ${FAMILIES}`
    ctx.fillStyle = "#ffffff"
    const sub = wrap(ctx, text.subtitle, width, 3)
    if (sub.at(-1)?.endsWith("…")) truncated = true
    for (const line of sub) {
      ctx.fillText(line, PW / 2, y)
      y += 44
    }
  }
  y += 4
  ctx.font = `600 28px ${FAMILIES}`
  const chipW = Math.min(width, ctx.measureText(text.date).width + 52)
  roundRect(ctx, (PW - chipW) / 2, y - 4, chipW, 52, 26)
  ctx.fillStyle = "rgba(251,191,36,0.16)"
  ctx.fill()
  ctx.lineWidth = 2
  ctx.strokeStyle = "rgba(251,191,36,0.65)"
  ctx.stroke()
  ctx.fillStyle = "#fde68a"
  ctx.fillText(text.date, PW / 2, y + 31)
  y += 52 + 44

  const footer = PH - 92
  ctx.font = `500 28px ${FAMILIES}`
  ctx.fillStyle = "#ecfdf5"
  let lines = wrap(ctx, text.message, width, 5)
  while (y + lines.length * 42 > footer - 20 && lines.length > 2) lines = wrap(ctx, text.message, width, lines.length - 1)
  if (lines.at(-1)?.endsWith("…")) truncated = true
  for (const line of lines) {
    ctx.fillText(line, PW / 2, y)
    y += 42
  }

  // The footer: a gold rule and the app's address.
  ctx.strokeStyle = "rgba(253,230,138,0.35)"
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(80, footer - 18)
  ctx.lineTo(PW - 80, footer - 18)
  ctx.stroke()
  ctx.font = `600 28px ${FAMILIES}`
  ctx.fillStyle = "#fde68a"
  ctx.fillText("អេប លុយឆ្លាត · app.luychlat.com", PW / 2, footer + 30)

  return { png: canvas.toBuffer("image/png"), truncated }
}
