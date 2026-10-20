// Server only: a national day or royal ceremony as a poster (founder, 20/10/2026) on the standard frame (poster-kit.ts):
// deep emerald and gold, the brand header and footer; centred — the title, the royal name or occasion, the dates as a
// gold chip, then the blessing. With the founder's official portrait: 1080 × 1350, the arched gold frame (no crest) and
// the founder's photographic royal backdrop when it is there (docs/BRAND_DESIGN_SYSTEM.md, chapter 2); without one, text only. A merit day
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
  backdrop: "bg_royal_coronation.jpg",
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
export function nationalAssetsFor(d: NationalDay): { portrait: Image | null; crest: Image | null; monument: Image | null; backdrop: Image | null } {
  return {
    portrait: d.assets?.portrait ? (assets[d.assets.portrait] ?? null) : null,
    crest: d.assets?.crest ? (assets.crest ?? null) : null,
    monument: d.assets?.monument ? (assets.monument ?? null) : null,
    backdrop: d.assets?.backdrop ? (assets.backdrop ?? null) : null,
  }
}

const { W, H, PAD } = FRAME

/** Every line the poster draws (tested: no parentheses, nothing cut). */
export function nationalPosterLines(d: NationalDay, day: string) {
  return { pill: d.pill, title: d.title, subtitle: d.subtitle ?? null, date: nationalDateLine(d, day), message: d.posterMessage ?? d.message }
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

// With the official portrait (founder, 20/10/2026): 1080 x 1350, the arched gold frame; nothing above His Majesty (no crest, no brand).

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

/** The bottom of the blessing band; with lines at most 800 px wide they stay clear of the kbach corner ornaments. */
const BLESSING_BAND_BOTTOM = 1090

/** The widest the top title may be: clear of the kbach corner ornaments at the top. */
const TITLE_TOP_WIDTH = 560
/** The occasion's title: under the portrait (founder, 20/10/2026, after trying it on top) or at the top centre. */
export const TITLE_POSITION: "top" | "below" = "below"

function portraitPoster(d: NationalDay, day: string, art: ReturnType<typeof nationalAssetsFor>): { png: Buffer; truncated: boolean } {
  const canvas = createCanvas(PW, PH)
  const ctx = canvas.getContext("2d")
  const text = nationalPosterLines(d, day)
  let truncated = false

  if (art.backdrop) {
    // The founder's photographic royal backdrop (founder, 20/10/2026 — «the flat vector silhouettes look like crude
    // clipart»): full bleed, then a deep emerald veil under the text so every line reads cleanly.
    const scale = Math.max(PW / art.backdrop.width, PH / art.backdrop.height)
    const bw = art.backdrop.width * scale
    const bh = art.backdrop.height * scale
    ctx.drawImage(art.backdrop, (PW - bw) / 2, (PH - bh) / 2, bw, bh)
    // A soft oval of deep emerald behind the text only — the gold corners of the kbach frame stay bright.
    ctx.save()
    ctx.translate(PW / 2, 1010)
    ctx.scale(1, 0.62)
    const veil = ctx.createRadialGradient(0, 0, 0, 0, 0, 470)
    veil.addColorStop(0, "rgba(2,44,34,0.72)")
    veil.addColorStop(0.7, "rgba(2,44,34,0.45)")
    veil.addColorStop(1, "rgba(2,44,34,0)")
    ctx.fillStyle = veil
    ctx.fillRect(-PW / 2, -470, PW, 940)
    ctx.restore()
  } else {
    // Without it: deep royal emerald with a gold glow behind the portrait — never drawn clipart.
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
  }

  // The brand, top left.
  // Royal protocol (founder, 20/10/2026): nothing above His Majesty — no brand («placing the commercial rabbit brand logo
  // directly above the King's head is completely unacceptable») and no crest («we cannot place any logo directly above
  // the King's head; the official ceremonial portrait … is already complete and majestic on its own»). The upper area is
  // the open kbach tapestry and its golden glow; the portrait in the arch is the one focal point; the brand signs off in
  // the footer only.
  ctx.textBaseline = "alphabetic"
  // The arch (founder, 20/10/2026 — «the photo feels too big; it spoils the poster's quality»): 390 × 470, so the
  // official portrait (277 × 396 at source) is magnified ~1.4× instead of ~1.7× — sharper, with more air around it.
  const fw = 390
  const fh = 470
  // Where the occasion's gold title goes (founder, 20/10/2026): at the top centre above the arch, or under the portrait
  // (TITLE_POSITION). On top it stays between the corner ornaments (at most TITLE_TOP_WIDTH wide).
  const width = PW - 2 * 80
  ctx.textAlign = "center"
  const titleOnTop = TITLE_POSITION === "top"
  if (titleOnTop) {
    let titleSize = 50
    ctx.font = `700 ${titleSize}px ${FAMILIES}`
    while (titleSize > 38 && ctx.measureText(text.title).width > TITLE_TOP_WIDTH) ctx.font = `700 ${--titleSize}px ${FAMILIES}`
    const top = wrap(ctx, text.title, TITLE_TOP_WIDTH, 1)
    if (top.at(-1)?.endsWith("…")) truncated = true
    ctx.fillStyle = "#fcd34d"
    ctx.fillText(top[0] ?? "", PW / 2, 122)
  }
  const fy = titleOnTop ? 200 : 140

  // The portrait in the arched gold frame.
  const fx = (PW - fw) / 2
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

  // Below the portrait, centred: the title (when it is not on top), the royal name, the date chip, the blessing.
  let y = fy + fh + (titleOnTop ? 82 : 80)
  if (!titleOnTop) {
    ctx.font = `700 52px ${FAMILIES}`
    ctx.fillStyle = "#fcd34d"
    const below = wrap(ctx, text.title, width, 2)
    if (below.at(-1)?.endsWith("…")) truncated = true
    for (const line of below) {
      ctx.fillText(line, PW / 2, y)
      y += 68
    }
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
  y += 52 + 54

  const footer = PH - 92
  if (d.posterMessage) {
    // The short blessing (founder, 20/10/2026): its own lines, larger (30 → 28 px, the largest that fits), centred in
    // the band between the date chip and the bottom corner ornaments (BLESSING_BAND_BOTTOM) so the poster breathes and
    // no line touches the kbach corners.
    const given = text.message.split("\n")
    const lineWidth = PW - 2 * 140
    let size = 30
    ctx.font = `500 ${size}px ${FAMILIES}`
    while (size > 26 && given.some((l) => ctx.measureText(l).width > lineWidth)) ctx.font = `500 ${--size}px ${FAMILIES}`
    const lead = Math.round(size * 1.7)
    const lines = given.flatMap((l) => wrap(ctx, l, lineWidth, 2))
    if (lines.some((l) => l.endsWith("…"))) truncated = true
    const space = Math.min(footer - 18, BLESSING_BAND_BOTTOM) - (y - 30)
    let by = y - 30 + (space - lines.length * lead) / 2 + size
    ctx.fillStyle = "#ecfdf5"
    for (const line of lines) {
      ctx.fillText(line, PW / 2, by)
      by += lead
    }
  } else {
    // The blessing, 27 px, centred, in whole lines (no royal phrase split — ROYAL_UNBREAKABLE).
    const bodyWidth = PW - 2 * 130
    const lead = 44
    ctx.font = `500 27px ${FAMILIES}`
    ctx.fillStyle = "#ecfdf5"
    let lines = wrap(ctx, text.message, bodyWidth, 5)
    while (y + lines.length * lead > footer - 20 && lines.length > 2) lines = wrap(ctx, text.message, bodyWidth, lines.length - 1)
    if (lines.at(-1)?.endsWith("…")) truncated = true
    for (const line of lines) {
      ctx.fillText(line, PW / 2, y)
      y += lead
    }
  }

  // The footer — the only place of the brand: a gold rule, then [mascot] «អេប លុយឆ្លាត · app.luychlat.com», centred.
  ctx.strokeStyle = "rgba(253,230,138,0.35)"
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(300, footer - 18)
  ctx.lineTo(PW - 300, footer - 18)
  ctx.stroke()
  const mascot = posterMascot()
  const brand = "អេប លុយឆ្លាត · app.luychlat.com"
  ctx.font = `600 26px ${FAMILIES}`
  const icon = mascot ? 38 : 0
  const gap = mascot ? 12 : 0
  const total = icon + gap + ctx.measureText(brand).width
  const bx = (PW - total) / 2
  if (mascot) ctx.drawImage(mascot, bx, footer + 3, icon, icon)
  ctx.textAlign = "left"
  ctx.fillStyle = "#fde68a"
  ctx.fillText(brand, bx + icon + gap, footer + 31)

  return { png: canvas.toBuffer("image/png"), truncated }
}
