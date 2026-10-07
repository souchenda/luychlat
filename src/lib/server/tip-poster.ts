// Server only: the daily tip poster (1080 × 1350 PNG, 4:5 for Telegram) — an
// emerald gradient with a soft glow, the LuyChlat mark, the tip's title large
// and its explanation on a white card. Drawn with Skia (@napi-rs/canvas), whose
// HarfBuzz shaping gets Khmer right; lines break at Khmer word boundaries
// (Intl.Segmenter), never inside a cluster.
import { createCanvas, GlobalFonts, type SKRSContext2D } from "@napi-rs/canvas"

import { longDate } from "@/lib/dates"

const W = 1080
const H = 1350
const PAD = 84
const FAMILIES = `"Noto Sans Khmer", "Khmer UI", "Noto Sans", sans-serif`

let fontsLoaded = false
function loadFonts() {
  if (fontsLoaded) return
  fontsLoaded = true
  for (const dir of ["/usr/share/fonts", "C:/Windows/Fonts"]) GlobalFonts.loadFontsFromDir(dir)
}

const words = new Intl.Segmenter("km", { granularity: "word" })

/** Lines of `text` that fit `maxWidth`, at most `maxLines` (the last cut with "…"). */
function wrap(ctx: SKRSContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.replace(/[\u0000-\u0009\u000b-\u001f]/g, " ").split(/\n+/)) {
    let line = ""
    // Opening brackets and quotes stay with the word after them.
    const pieces: string[] = []
    let open = ""
    for (const { segment } of words.segment(paragraph.trim())) {
      if (/^[(\[«“‘]+$/.test(segment)) open += segment
      else {
        pieces.push(open + segment)
        open = ""
      }
    }
    if (open) pieces.push(open)
    for (const segment of pieces) {
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

function roundRect(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export function tipPoster(tip: { title: string; body: string }, day: string): Buffer {
  loadFonts()
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext("2d")

  // Emerald gradient with a soft light glow (the app's brand look).
  const bg = ctx.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, "#065f46")
  bg.addColorStop(0.55, "#0f9f6e")
  bg.addColorStop(1, "#10b981")
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W * 0.85, H * 0.08, 0, W * 0.85, H * 0.08, W * 0.75)
  glow.addColorStop(0, "rgba(255,255,255,0.22)")
  glow.addColorStop(1, "rgba(255,255,255,0)")
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  // Mark: the rounded ៛ tile, then the name.
  const mark = 96
  roundRect(ctx, PAD, PAD, mark, mark, 26)
  ctx.fillStyle = "rgba(255,255,255,0.16)"
  ctx.fill()
  ctx.lineWidth = 3
  ctx.strokeStyle = "rgba(255,255,255,0.45)"
  ctx.stroke()
  ctx.fillStyle = "#ffffff"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.font = `700 60px ${FAMILIES}`
  ctx.fillText("៛", PAD + mark / 2, PAD + mark / 2 + 4)
  ctx.textAlign = "left"
  ctx.font = `700 44px ${FAMILIES}`
  ctx.fillText("លុយឆ្លាត · LuyChlat", PAD + mark + 28, PAD + mark / 2 - 4)

  // Label.
  ctx.textBaseline = "alphabetic"
  ctx.font = `600 34px ${FAMILIES}`
  const label = "គន្លឹះហិរញ្ញវត្ថុប្រចាំថ្ងៃ"
  const lw = ctx.measureText(label).width + 56
  roundRect(ctx, PAD, 270, lw, 70, 35)
  ctx.fillStyle = "rgba(255,255,255,0.18)"
  ctx.fill()
  ctx.fillStyle = "#d1fae5"
  ctx.fillText(label, PAD + 28, 318)

  // Title: large, up to 3 lines.
  ctx.font = `700 76px ${FAMILIES}`
  ctx.fillStyle = "#ffffff"
  const titleLines = wrap(ctx, tip.title, W - 2 * PAD, 3)
  let y = 450
  for (const line of titleLines) {
    ctx.fillText(line, PAD, y)
    y += 112
  }

  // Explanation on a white card, as tall as its text (room left for the call to action).
  ctx.font = `400 40px ${FAMILIES}`
  const lineH = 70
  const cardTop = y + 10
  // The card ends above the call to action (~100 px) and the footer (~170 px).
  const maxBody = Math.max(1, Math.floor((H - 270 - cardTop - 90) / lineH))
  const bodyLines = wrap(ctx, tip.body, W - 2 * PAD - 100, maxBody)
  const cardH = 110 + bodyLines.length * lineH - 20
  roundRect(ctx, PAD, cardTop, W - 2 * PAD, cardH, 40)
  ctx.fillStyle = "rgba(255,255,255,0.96)"
  ctx.shadowColor = "rgba(2,44,34,0.25)"
  ctx.shadowBlur = 40
  ctx.shadowOffsetY = 12
  ctx.fill()
  ctx.shadowColor = "transparent"
  ctx.fillStyle = "#0f172a"
  let by = cardTop + 92
  for (const line of bodyLines) {
    ctx.fillText(line, PAD + 50, by)
    by += lineH
  }

  // Call to action under the card.
  ctx.font = `600 36px ${FAMILIES}`
  ctx.fillStyle = "#ffffff"
  ctx.fillText("កត់ត្រាចំណូល-ចំណាយ ជាមួយ @luychlat_bot", PAD, cardTop + cardH + 100)

  // Footer: the date (Khmer) and where to find more.
  const [yy, mm, dd] = day.split("-").map(Number)
  ctx.font = `600 32px ${FAMILIES}`
  ctx.fillStyle = "#ecfdf5"
  ctx.fillText(longDate(new Date(yy, mm - 1, dd, 12), "km"), PAD, H - 92)
  ctx.textAlign = "right"
  ctx.fillText("@LuyChlatCommunity", W - PAD, H - 92)

  return canvas.toBuffer("image/png")
}
