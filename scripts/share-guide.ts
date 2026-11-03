/**
 * The bot's «where to tap» picture for someone who barely uses Telegram (founder, 3/11/2026): two crops of the
 * founder's own phone — the «ចុះឈ្មោះ ឬចូល» button under the chat and Telegram's «Share your phone number?» prompt —
 * each tap ringed in gold and numbered. Only the crops are drawn (never the welcome above them: no name, no number).
 *
 *   npx tsx scripts/share-guide.ts <screen-with-button.jpg> <screen-with-prompt.jpg>
 *
 * Writes public/images/bot/share-guide.png, which the bot sends with its welcome (lib/bot/gate.ts — SHARE_GUIDE).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

import { createCanvas, loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas"

import { FAMILIES, GOLD, loadFonts } from "../src/lib/server/poster-kit"

const [buttonShot, promptShot] = process.argv.slice(2)
if (!buttonShot || !promptShot) throw new Error("usage: share-guide.ts <screen-with-button> <screen-with-prompt>")

const W = 1080
const PAD = 60
const INNER = W - PAD * 2

type Crop = { sx: number; sy: number; sw: number; sh: number; ring: { x: number; y: number; w: number; h: number } }
// In the 1080 × 2340 screenshots: the input bar and the button under it; the prompt with its two buttons.
const BUTTON: Crop = { sx: 0, sy: 1960, sw: 1080, sh: 350, ring: { x: 24, y: 2148, w: 1032, h: 130 } }
const PROMPT: Crop = { sx: 48, sy: 860, sw: 984, sh: 676, ring: { x: 680, y: 1428, w: 318, h: 86 } }

function rounded(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

/** A crop scaled to the inner width, framed, with its tap ringed in gold; returns the height drawn. */
function shot(ctx: SKRSContext2D, img: Image, c: Crop, top: number) {
  const k = INNER / c.sw
  const h = c.sh * k
  ctx.save()
  rounded(ctx, PAD, top, INNER, h, 28)
  ctx.clip()
  ctx.drawImage(img, c.sx, c.sy, c.sw, c.sh, PAD, top, INNER, h)
  ctx.restore()
  ctx.lineWidth = 3
  ctx.strokeStyle = "rgba(255,255,255,0.18)"
  rounded(ctx, PAD, top, INNER, h, 28)
  ctx.stroke()
  const r = { x: PAD + (c.ring.x - c.sx) * k, y: top + (c.ring.y - c.sy) * k, w: c.ring.w * k, h: c.ring.h * k }
  ctx.save()
  ctx.shadowColor = GOLD
  ctx.shadowBlur = 28
  ctx.lineWidth = 7
  ctx.strokeStyle = GOLD
  rounded(ctx, r.x - 8, r.y - 8, r.w + 16, r.h + 16, 26)
  ctx.stroke()
  ctx.restore()
  return h
}

/** The numbered step line: a gold disc with 1 / 2, then the words. */
function step(ctx: SKRSContext2D, n: number, text: string, top: number) {
  ctx.fillStyle = GOLD
  ctx.beginPath()
  ctx.arc(PAD + 34, top + 34, 34, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = "#064e3b"
  ctx.font = `700 40px ${FAMILIES}`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(String(n), PAD + 34, top + 36)
  ctx.fillStyle = "#ffffff"
  ctx.font = `600 40px ${FAMILIES}`
  ctx.textAlign = "left"
  ctx.fillText(text, PAD + 92, top + 36)
}

async function main() {
  loadFonts()
  const [a, b, logo] = await Promise.all([buttonShot, promptShot, path.join("public", "logo.png")].map((f) => loadImage(readFileSync(f))))
  const H = 1580
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext("2d")
  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, "#065f46")
  bg.addColorStop(1, "#022c22")
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  ctx.drawImage(logo, PAD, 44, 96, 96)
  ctx.fillStyle = "#ffffff"
  ctx.font = `700 50px ${FAMILIES}`
  ctx.textBaseline = "middle"
  ctx.fillText("ចុះឈ្មោះ 2 ចុច ប៉ុណ្ណោះ", PAD + 120, 76)
  ctx.fillStyle = "rgba(255,255,255,0.75)"
  ctx.font = `400 32px ${FAMILIES}`
  ctx.fillText("មិនបាច់វាយលេខទូរសព្ទ ឬពាក្យសម្ងាត់ទេ", PAD + 120, 124)

  let y = 196
  step(ctx, 1, "ចុចប៊ូតុង «ចុះឈ្មោះ ឬចូល» នៅខាងក្រោម", y)
  y += 96
  y += shot(ctx, a, BUTTON, y) + 56
  step(ctx, 2, "Telegram សួរ — ចុច «Share contact»", y)
  y += 96
  y += shot(ctx, b, PROMPT, y) + 44

  ctx.fillStyle = GOLD
  ctx.font = `600 36px ${FAMILIES}`
  ctx.textAlign = "center"
  ctx.fillText("រួចចុច «បើកអេប លុយឆ្លាត» — ចូលរួចភ្លាម", W / 2, y + 10)
  ctx.fillStyle = "rgba(255,255,255,0.6)"
  ctx.font = `400 28px ${FAMILIES}`
  ctx.fillText("អេប លុយឆ្លាត · app.luychlat.com", W / 2, y + 66)
  if (y + 100 > H) throw new Error(`content runs to ${y + 100}, canvas is ${H}`)

  const out = path.join("public", "images", "bot", "share-guide.png")
  mkdirSync(path.dirname(out), { recursive: true })
  writeFileSync(out, canvas.toBuffer("image/png"))
  console.log(`${out} — ends at ${y + 100} of ${H}`)
}

main()
