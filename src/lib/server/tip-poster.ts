// Server only: the daily tip poster (1080 × 1350 PNG, 4:5 for Telegram) — open
// typography on an emerald gradient (no boxed card): the LuyChlat mark, the
// tip's title large, a gold accent, the explanation in light text, and every
// number ("$730/ឆ្នាំ", "៥០%", "២០,០០០៛") picked out in bold gold. Drawn with
// Skia (@napi-rs/canvas), whose HarfBuzz shaping gets Khmer right; lines break
// at Khmer word boundaries (Intl.Segmenter), never inside a cluster.
import { createCanvas, GlobalFonts, type SKRSContext2D } from "@napi-rs/canvas"

import { longDate } from "@/lib/dates"

const W = 1080
const H = 1350
const PAD = 90
const GOLD = "#fcd34d"
const FAMILIES = `"Noto Sans Khmer", "Khmer UI", "Noto Sans", sans-serif`

let fontsLoaded = false
function loadFonts() {
  if (fontsLoaded) return
  fontsLoaded = true
  for (const dir of ["/usr/share/fonts", "C:/Windows/Fonts"]) GlobalFonts.loadFontsFromDir(dir)
}

const words = new Intl.Segmenter("km", { granularity: "word" })

/** Money, percentages and counts — with a "/ឆ្នាំ"-style unit — in Latin or Khmer digits. */
const NUMBER = /[$៛]?\s?[0-9០-៩](?:[0-9០-៩,.]*[0-9០-៩])?(?:\s?[%៛$]|\s?ដុល្លារ|\s?រៀល)?(?:\s?\/\s?(?:ឆ្នាំ|ខែ|ថ្ងៃ|សប្តាហ៍|year|month|day))?/g

/** Word pieces of a paragraph; opening brackets and quotes stay with the word after them. */
function pieces(paragraph: string): string[] {
  const out: string[] = []
  let open = ""
  for (const { segment } of words.segment(paragraph.trim())) {
    if (/^[(\[«“‘]+$/.test(segment)) open += segment
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
    if (prev !== undefined && (/^[/%៛]/.test(p) || /[/$៛]$/.test(prev))) joined[joined.length - 1] = prev + p
    else joined.push(p)
  }
  return joined
}

/** Lines of `text` that fit `maxWidth`, at most `maxLines` (the last cut with "…"). */
function wrap(ctx: SKRSContext2D, text: string, maxWidth: number, maxLines: number): string[] {
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
function drawRich(ctx: SKRSContext2D, line: string, x: number, y: number, size: number, base: { weight: number; color: string }) {
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

  // Deep emerald gradient, a soft light glow top-right and a warm one bottom-left.
  const bg = ctx.createLinearGradient(0, 0, W * 0.4, H)
  bg.addColorStop(0, "#064e3b")
  bg.addColorStop(0.6, "#047857")
  bg.addColorStop(1, "#059669")
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W * 0.9, H * 0.05, 0, W * 0.9, H * 0.05, W * 0.8)
  glow.addColorStop(0, "rgba(167,243,208,0.30)")
  glow.addColorStop(1, "rgba(167,243,208,0)")
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)
  const warm = ctx.createRadialGradient(0, H, 0, 0, H, W * 0.7)
  warm.addColorStop(0, "rgba(252,211,77,0.16)")
  warm.addColorStop(1, "rgba(252,211,77,0)")
  ctx.fillStyle = warm
  ctx.fillRect(0, 0, W, H)
  // A large faint ៛ as a watermark.
  ctx.font = `700 900px ${FAMILIES}`
  ctx.fillStyle = "rgba(255,255,255,0.045)"
  ctx.textAlign = "right"
  ctx.textBaseline = "alphabetic"
  ctx.fillText("៛", W + 60, H - 120)

  // Mark: the rounded ៛ tile, then the name.
  const mark = 92
  roundRect(ctx, PAD, PAD, mark, mark, 26)
  ctx.fillStyle = "rgba(255,255,255,0.14)"
  ctx.fill()
  ctx.lineWidth = 3
  ctx.strokeStyle = "rgba(255,255,255,0.4)"
  ctx.stroke()
  ctx.fillStyle = "#ffffff"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.font = `700 58px ${FAMILIES}`
  ctx.fillText("៛", PAD + mark / 2, PAD + mark / 2 + 4)
  ctx.textAlign = "left"
  ctx.font = `700 42px ${FAMILIES}`
  ctx.fillText("លុយឆ្លាត · LuyChlat", PAD + mark + 26, PAD + mark / 2 - 4)
  ctx.textBaseline = "alphabetic"

  // Label in gold, then the title.
  ctx.font = `600 34px ${FAMILIES}`
  ctx.fillStyle = GOLD
  ctx.fillText("គន្លឹះហិរញ្ញវត្ថុប្រចាំថ្ងៃ", PAD, 330)
  ctx.font = `700 82px ${FAMILIES}`
  const titleLines = wrap(ctx, tip.title, W - 2 * PAD, 3)
  let y = 450
  for (const line of titleLines) {
    drawRich(ctx, line, PAD, y, 82, { weight: 700, color: "#ffffff" })
    y += 118
  }
  // Gold accent bar.
  roundRect(ctx, PAD, y - 40, 120, 10, 5)
  ctx.fillStyle = GOLD
  ctx.fill()

  // The explanation, open on the background.
  ctx.font = `400 42px ${FAMILIES}`
  const lineH = 74
  const top = y + 60
  const maxBody = Math.max(1, Math.floor((H - 250 - top) / lineH))
  let by = top
  for (const line of wrap(ctx, tip.body, W - 2 * PAD, maxBody)) {
    drawRich(ctx, line, PAD, by, 42, { weight: 400, color: "#ecfdf5" })
    by += lineH
  }

  // Footer: a thin rule, the call to action, the date and the channel.
  ctx.fillStyle = "rgba(255,255,255,0.25)"
  ctx.fillRect(PAD, H - 190, W - 2 * PAD, 2)
  ctx.font = `600 32px ${FAMILIES}`
  ctx.fillStyle = "#ffffff"
  ctx.fillText("កត់ត្រាចំណូល-ចំណាយ ជាមួយ @luychlat_bot", PAD, H - 128)
  const [yy, mm, dd] = day.split("-").map(Number)
  ctx.font = `400 28px ${FAMILIES}`
  ctx.fillStyle = "#a7f3d0"
  ctx.fillText(longDate(new Date(yy, mm - 1, dd, 12), "km"), PAD, H - 78)
  ctx.textAlign = "right"
  ctx.fillText("@LuyChlatCommunity", W - PAD, H - 78)

  return canvas.toBuffer("image/png")
}
