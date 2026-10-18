// Server only: the shared kit for every LuyChlat poster (1080 × 1080 PNG) —
// fonts, Khmer text layout and THE STANDARD FRAME (founder, 2026-10-07):
//
//   HEADER  left:  the mascot logo tile + "អេប លុយឆ្លាត" over "App Luy Chlat" (spread to the same width)
//           right: the poster's category pill ("គន្លឹះហិរញ្ញវត្ថុប្រចាំថ្ងៃ", "ពិធីបុណ្យប្រពៃណីជាតិខ្មែរ"…)
//   FOOTER  📱 គ្រប់គ្រងបំណុល ចំណូល-ចំណាយ ជាមួយអេប លុយឆ្លាត
//           ✈️ សហគមន៍ អេប លុយឆ្លាត (t.me/LuyChlatCommunity)   •   🌐 luychlat.com (founder, 15/10/2026)
//           app-first (no bot username), left-aligned, never a button or pill on the right
//
// Every poster generator (daily tip, festivals, future market posters) draws
// its header and footer with drawHeader / drawFooter and lays its own content
// between FRAME.contentTop and FRAME.footerTop. Drawn with Skia
// (@napi-rs/canvas), whose HarfBuzz shaping gets Khmer right; lines break at
// Khmer word boundaries (Intl.Segmenter). Icons are drawn — the server has no
// emoji font. Type: MiSans Khmer, Kantumruy Pro behind it for Latin.
import { readFileSync } from "node:fs"
import path from "node:path"

import { GlobalFonts, type Image, loadImage, type SKRSContext2D } from "@napi-rs/canvas"

export const FRAME = {
  W: 1080,
  H: 1080,
  PAD: 72,
  /** Below the header row. */
  contentTop: 160,
  /** The footer rule; content stays above it. */
  footerTop: 1080 - 150,
} as const

export const GOLD = "#fcd34d"
export const FAMILIES =
  process.env.POSTER_FONT === "kantumruy"
    ? `"Kantumruy Pro", "Noto Sans Khmer", "Khmer UI", "Noto Sans", "Noto Naskh Arabic", "Noto Sans Arabic", "Arial", sans-serif`
    : `"MiSans Khmer", "Kantumruy Pro", "Noto Sans Khmer", "Khmer UI", "Noto Sans", "Noto Naskh Arabic", "Noto Sans Arabic", "Arial", sans-serif`

let fontsLoaded = false
export function loadFonts() {
  if (fontsLoaded) return
  fontsLoaded = true
  // The brand fonts first (shipped in public/), system fonts only as a fallback.
  const dir = path.join(process.cwd(), "public", "fonts")
  for (const weight of [400, 600, 700]) GlobalFonts.registerFromPath(path.join(dir, `KantumruyPro-${weight}.ttf`), "Kantumruy Pro")
  for (const w of ["Regular", "Medium", "Semibold", "Bold"]) GlobalFonts.registerFromPath(path.join(dir, `MiSansKhmer-${w}.woff2`), "MiSans Khmer")
  for (const sys of ["/usr/share/fonts", "C:/Windows/Fonts"]) GlobalFonts.loadFontsFromDir(sys)
}

/**
 * The mascot logo (public/logo.png), decoded once at start-up — @napi-rs/canvas only decodes through
 * loadImage (async); posters are drawn long after, and a missing file keeps the old ៛ tile.
 */
let mascotImage: Image | null = null
export const posterAssetsReady: Promise<void> = loadImage(readFileSync(path.join(process.cwd(), "public", "logo.png")))
  .then((img) => {
    mascotImage = img
  })
  .catch(() => {})
const mascot = () => mascotImage
/** The decoded mascot for posters that show it large (null until posterAssetsReady settles, or if missing). */
export const posterMascot = () => mascotImage

const words = new Intl.Segmenter("km", { granularity: "word" })

/** Money, percentages and counts — with a "/ឆ្នាំ"-style unit — in Latin or Khmer digits. */
const NUMBER = /[$៛]?\s?[0-9០-៩](?:[0-9០-៩,.]*[0-9០-៩])?(?:\s?[%៛$]|\s?ដុល្លារ|\s?រៀល)?(?:\s?\/\s?(?:ឆ្នាំ|ខែ|ថ្ងៃ|សប្តាហ៍|year|month|day))?/g

/** Word pieces of a paragraph; opening brackets and quotes stay with the word after them. */
function pieces(paragraph: string): string[] {
  const out: string[] = []
  let open = ""
  for (const { segment } of words.segment(paragraph.trim())) {
    if (/^[(\[«“‘]+$/.test(segment)) open += segment
    // Closing punctuation («។», «៕», «»», «)», «,»…) stays with the word before it — a line never starts with it.
    else if (/^\s*[។៕)\]»”’,.:;!?]+$/.test(segment) && out.length && !open) out[out.length - 1] += segment
    else {
      out.push(open + segment)
      open = ""
    }
  }
  if (open) out.push(open)
  // Keep a number and its unit ("$730", "/", "ឆ្នាំ") together so it is never split across lines.
  const joined: string[] = []
  for (const p of out) {
    const prev = joined[joined.length - 1]
    // …and a time or a decimal («០៤:២៣», «4.5») — never broken at its colon or point.
    const timeOrDecimal = prev !== undefined && ((/[0-9០-៩]$/.test(prev) && /^[:.][0-9០-៩]/.test(p)) || (/[0-9០-៩][:.]$/.test(prev) && /^[0-9០-៩]/.test(p)) || (/[0-9០-៩]$/.test(prev) && /^[:.]$/.test(p)))
    if (prev !== undefined && (timeOrDecimal || /^[/%៛]/.test(p) || /[/$៛]$/.test(prev))) joined[joined.length - 1] = prev + p
    else joined.push(p)
  }
  return keepTerms(joined)
}

/**
 * Loanwords the Khmer word breaker splits («អ៊ឹម|សាក់»): kept whole on a line. Add a term here when a poster
 * breaks one.
 */
const KEEP_TOGETHER = ["អ៊ឹមសាក់", "ស្រាយបួស", "ហូបបាយបួស", "នីយ៉ាត់", "ស៊ុណ្ណា", "សាហួរ", "ជូម៉ាអះ", "បារ៉ាកាត់", "មូហាំម៉ាត់", "ហ៊ីចរ៉ោះ"]

function keepTerms(pieces: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < pieces.length; i++) {
    let merged = pieces[i]
    for (const term of KEEP_TOGETHER) {
      if (!term.startsWith(merged.trim()) || merged.trim() === term) continue
      // Join the following pieces while they still spell the term.
      let j = i + 1
      let acc = merged
      while (j < pieces.length && term.startsWith((acc + pieces[j]).trim()) && (acc + pieces[j]).trim() !== term) acc += pieces[j++]
      if (j < pieces.length && (acc + pieces[j]).trim() === term) {
        merged = acc + pieces[j]
        i = j
        break
      }
    }
    out.push(merged)
  }
  return out
}

/** Lines of `text` that fit `maxWidth`, at most `maxLines` (the last cut with "…"). */
export function wrap(ctx: SKRSContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.replace(/[\u0000-\u0009\u000b-\u001f]/g, " ").split(/\n+/)) {
    let line = ""
    for (const segment of pieces(paragraph)) {
      const next = line + segment
      if (ctx.measureText(next).width <= maxWidth || !line) line = next
      else {
        lines.push(line.trimEnd())
        line = segment.trimStart()
      }
    }
    if (line.trim()) lines.push(line.trimEnd())
  }
  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  let last = kept[maxLines - 1]
  while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = [...last].slice(0, -1).join("")
  kept[maxLines - 1] = `${last}…`
  return kept
}

/** Draws one line, numbers in bold gold and the rest in the `base` style. */
export function drawRich(ctx: SKRSContext2D, line: string, x: number, y: number, size: number, base: { weight: number; color: string }) {
  let at = x
  let last = 0
  const run = (text: string, number: boolean) => {
    if (!text) return
    ctx.font = `${number ? 700 : base.weight} ${size}px ${FAMILIES}`
    ctx.fillStyle = number ? GOLD : base.color
    ctx.fillText(text, at, y)
    at += ctx.measureText(text).width
  }
  for (const m of line.matchAll(NUMBER)) {
    run(line.slice(last, m.index), false)
    run(m[0], true)
    last = (m.index ?? 0) + m[0].length
  }
  run(line.slice(last), false)
}

/** Text drawn letter by letter so it spans exactly `width` (to match a line above it). */
export function drawSpread(ctx: SKRSContext2D, text: string, x: number, y: number, width: number) {
  const chars = [...text]
  const natural = chars.reduce((w, c) => w + ctx.measureText(c).width, 0)
  const extra = chars.length > 1 ? Math.max(0, (width - natural) / (chars.length - 1)) : 0
  let at = x
  for (const c of chars) {
    ctx.fillText(c, at, y)
    at += ctx.measureText(c).width + extra
  }
}

export function roundRect(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export type Icon = "phone" | "plane" | "globe" | "bulb" | "calendar"
/** Small gold line icons centred on (cx, cy): a phone, Telegram's paper plane, a globe, a light bulb, a calendar. */
export function drawIcon(ctx: SKRSContext2D, icon: Icon, cx: number, cy: number) {
  ctx.save()
  ctx.strokeStyle = GOLD
  ctx.fillStyle = GOLD
  ctx.lineWidth = 2.6
  ctx.lineJoin = "round"
  ctx.lineCap = "round"
  if (icon === "phone") {
    roundRect(ctx, cx - 9, cy - 14, 18, 28, 4)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(cx, cy + 9, 1.8, 0, Math.PI * 2)
    ctx.fill()
  } else if (icon === "plane") {
    ctx.beginPath()
    ctx.moveTo(cx - 13, cy - 1)
    ctx.lineTo(cx + 13, cy - 11)
    ctx.lineTo(cx + 7, cy + 12)
    ctx.lineTo(cx - 1, cy + 4)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = "#064e3b"
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(cx - 1, cy + 4)
    ctx.lineTo(cx + 13, cy - 11)
    ctx.stroke()
  } else if (icon === "globe") {
    ctx.beginPath()
    ctx.arc(cx, cy, 13, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.ellipse(cx, cy, 5.5, 13, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(cx - 13, cy)
    ctx.lineTo(cx + 13, cy)
    ctx.stroke()
  } else if (icon === "calendar") {
    roundRect(ctx, cx - 12, cy - 10, 24, 22, 4)
    ctx.stroke()
    ctx.fillRect(cx - 12, cy - 10, 24, 6)
    ctx.beginPath()
    ctx.moveTo(cx - 6, cy - 14)
    ctx.lineTo(cx - 6, cy - 8)
    ctx.moveTo(cx + 6, cy - 14)
    ctx.lineTo(cx + 6, cy - 8)
    ctx.stroke()
    for (const [dx, dy] of [[-5, 2], [1, 2], [7, 2], [-5, 7], [1, 7]]) ctx.fillRect(cx + dx - 1.5, cy + dy - 1.5, 3, 3)
  } else {
    ctx.beginPath()
    ctx.arc(cx, cy - 3, 9, Math.PI * 0.8, Math.PI * 2.2)
    ctx.lineTo(cx + 4, cy + 9)
    ctx.lineTo(cx - 4, cy + 9)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(cx - 4, cy + 13)
    ctx.lineTo(cx + 4, cy + 13)
    ctx.stroke()
  }
  ctx.restore()
}

/**
 * HEADER — left: the mascot logo tile with "អេប លុយឆ្លាត" over "App Luy Chlat"; right: the
 * category pill (gold), with a drawn icon (a light bulb by default, or the
 * poster's own, e.g. a lotus).
 */
export function drawHeader(ctx: SKRSContext2D, pill: { text: string; icon?: Icon | ((cx: number, cy: number) => void) }) {
  const { W, PAD } = FRAME
  const mark = 64
  const top = 60
  // The official mascot (public/logo.png) in the rounded tile; the old ៛ glyph only if the file is missing.
  const logo = mascot()
  if (logo) {
    ctx.save()
    roundRect(ctx, PAD, top, mark, mark, 18)
    ctx.clip()
    ctx.drawImage(logo, PAD, top, mark, mark)
    ctx.restore()
    roundRect(ctx, PAD, top, mark, mark, 18)
    ctx.lineWidth = 2
    ctx.strokeStyle = "rgba(52,211,153,0.65)"
    ctx.stroke()
  } else {
    roundRect(ctx, PAD, top, mark, mark, 18)
    ctx.fillStyle = "rgba(16,185,129,0.22)"
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = "rgba(52,211,153,0.65)"
    ctx.stroke()
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.font = `700 40px ${FAMILIES}`
    ctx.fillText("៛", PAD + mark / 2, top + mark / 2 + 2)
  }
  ctx.fillStyle = "#ffffff"
  ctx.textAlign = "left"
  ctx.textBaseline = "alphabetic"
  const nameX = PAD + mark + 18
  ctx.font = `700 34px ${FAMILIES}`
  ctx.fillText("អេប លុយឆ្លាត", nameX, top + 32)
  const nameW = ctx.measureText("អេប លុយឆ្លាត").width
  ctx.font = `500 20px ${FAMILIES}`
  ctx.fillStyle = "rgba(209,250,229,0.78)"
  drawSpread(ctx, "App Luy Chlat", nameX, top + 58, nameW)

  // The pill, right-aligned on the logo's row.
  ctx.font = `600 26px ${FAMILIES}`
  const pillH = 52
  const pillW = ctx.measureText(pill.text).width + 76
  const px = W - PAD - pillW
  const py = top + (mark - pillH) / 2
  roundRect(ctx, px, py, pillW, pillH, pillH / 2)
  ctx.fillStyle = "rgba(251,191,36,0.13)"
  ctx.fill()
  ctx.lineWidth = 2
  ctx.strokeStyle = "rgba(251,191,36,0.6)"
  ctx.stroke()
  const iconX = px + 28
  const iconY = py + pillH / 2
  if (typeof pill.icon === "function") pill.icon(iconX, iconY)
  else drawIcon(ctx, pill.icon ?? "bulb", iconX, iconY)
  ctx.fillStyle = "#fde68a"
  ctx.fillText(pill.text, px + 52, py + 35)
}

/** FOOTER — the app-first two lines with drawn gold icons; nothing on the right. */
export function drawFooter(ctx: SKRSContext2D) {
  const { W, PAD, footerTop } = FRAME
  ctx.fillStyle = "rgba(52,211,153,0.28)"
  ctx.fillRect(PAD, footerTop, W - 2 * PAD, 1.5)
  ctx.textAlign = "left"
  ctx.textBaseline = "alphabetic"
  const line1 = footerTop + 58
  drawIcon(ctx, "phone", PAD + 14, line1 - 10)
  ctx.font = `600 27px ${FAMILIES}`
  ctx.fillStyle = "#ffffff"
  ctx.fillText("គ្រប់គ្រងបំណុល ចំណូល-ចំណាយ ជាមួយអេប លុយឆ្លាត", PAD + 44, line1)
  const line2 = footerTop + 106
  ctx.font = `500 26px ${FAMILIES}`
  drawIcon(ctx, "plane", PAD + 14, line2 - 10)
  ctx.fillStyle = "#d1fae5"
  const community = "សហគមន៍ អេប លុយឆ្លាត (t.me/LuyChlatCommunity)"
  ctx.fillText(community, PAD + 44, line2)
  let x = PAD + 44 + ctx.measureText(community).width + 26
  ctx.fillStyle = "rgba(209,250,229,0.55)"
  ctx.fillText("•", x, line2)
  x += ctx.measureText("•").width + 26
  drawIcon(ctx, "globe", x + 14, line2 - 10)
  ctx.fillStyle = "#d1fae5"
  ctx.fillText("luychlat.com", x + 44, line2)
}
