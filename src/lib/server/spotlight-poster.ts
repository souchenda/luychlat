// Server only: the weekly «Core value & feature spotlight» poster (1080 × 1080 PNG), in the standard
// frame (poster-kit.ts): the same deep emerald as the daily tip, the mascot large beside the hook, the
// three pillars as numbered rows, and the founder's call as a gold banner.
import { createCanvas } from "@napi-rs/canvas"

import { SPOTLIGHT_PILLARS } from "@/lib/spotlight"

import { FAMILIES, FRAME, GOLD, drawFooter, drawHeader, loadFonts, posterMascot, roundRect, wrap } from "./poster-kit"
import { latinCanvas } from "@/lib/numerals"

const { W, H, PAD } = FRAME
const KM_NUM = ["១", "២", "៣"]

export function spotlightPoster(): Buffer {
  loadFonts()
  const canvas = createCanvas(W, H)
  const ctx = latinCanvas(canvas.getContext("2d")) // 0-9 on the poster (Task #440)

  // Background: as the daily tip (deep emerald, a light glow top-right, a warm one bottom-left).
  const bg = ctx.createLinearGradient(0, 0, W * 0.4, H)
  bg.addColorStop(0, "#064e3b")
  bg.addColorStop(0.6, "#047857")
  bg.addColorStop(1, "#059669")
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W * 0.85, H * 0.22, 0, W * 0.85, H * 0.22, W * 0.55)
  glow.addColorStop(0, "rgba(167,243,208,0.30)")
  glow.addColorStop(1, "rgba(167,243,208,0)")
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)
  const warm = ctx.createRadialGradient(0, H, 0, 0, H, W * 0.7)
  warm.addColorStop(0, "rgba(252,211,77,0.16)")
  warm.addColorStop(1, "rgba(252,211,77,0)")
  ctx.fillStyle = warm
  ctx.fillRect(0, 0, W, H)

  drawHeader(ctx, { text: "ហេតុអ្វីអេប លុយឆ្លាត?", icon: "bulb" })

  // The hook beside the mascot.
  const mascotSize = 200
  const mx = W - PAD - mascotSize
  const my = FRAME.contentTop + 10
  const logo = posterMascot()
  if (logo) {
    ctx.save()
    roundRect(ctx, mx, my, mascotSize, mascotSize, 52)
    ctx.clip()
    ctx.drawImage(logo, mx, my, mascotSize, mascotSize)
    ctx.restore()
    roundRect(ctx, mx, my, mascotSize, mascotSize, 52)
    ctx.lineWidth = 3
    ctx.strokeStyle = "rgba(252,211,77,0.55)"
    ctx.stroke()
  }
  ctx.textAlign = "left"
  ctx.textBaseline = "alphabetic"
  ctx.font = `700 60px ${FAMILIES}`
  ctx.fillStyle = "#ffffff"
  const hookW = (logo ? mx - 36 : W - PAD) - PAD
  let y = my + 66
  // Two fixed lines, so the phrase never breaks inside «គ្មានសល់».
  for (const line of ["ខំរកលុយរាល់ថ្ងៃ", "តែចុងខែគ្មានសល់?"].map((l) => wrap(ctx, l, hookW, 1)[0] ?? l)) {
    ctx.fillText(line, PAD, y)
    y += 82
  }
  ctx.font = `500 30px ${FAMILIES}`
  ctx.fillStyle = "#fde68a"
  for (const line of wrap(ctx, "អេប លុយឆ្លាត ជួយអ្នកឃើញលុយពិតរបស់អ្នក", hookW, 2)) {
    ctx.fillText(line, PAD, y - 10)
    y += 44
  }

  // The three pillars.
  const rowTop = Math.max(my + mascotSize, y - 30) + 28
  const rowH = 110
  const rowGap = 14
  SPOTLIGHT_PILLARS.forEach((p, i) => {
    const top = rowTop + i * (rowH + rowGap)
    roundRect(ctx, PAD, top, W - 2 * PAD, rowH, 26)
    ctx.fillStyle = "rgba(255,255,255,0.08)"
    ctx.fill()
    ctx.lineWidth = 1.5
    ctx.strokeStyle = "rgba(167,243,208,0.25)"
    ctx.stroke()
    // The number in a gold circle.
    const cx = PAD + 62
    const cy = top + rowH / 2
    ctx.beginPath()
    ctx.arc(cx, cy, 34, 0, Math.PI * 2)
    ctx.fillStyle = "rgba(252,211,77,0.16)"
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = GOLD
    ctx.stroke()
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.font = `700 36px ${FAMILIES}`
    ctx.fillStyle = GOLD
    ctx.fillText(KM_NUM[i], cx, cy + 3)
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"
    const tx = PAD + 124
    ctx.font = `700 38px ${FAMILIES}`
    ctx.fillStyle = "#ffffff"
    ctx.fillText(p.title, tx, top + 49)
    ctx.font = `400 27px ${FAMILIES}`
    ctx.fillStyle = "#d1fae5"
    ctx.fillText(wrap(ctx, p.sub, W - PAD - 24 - tx, 1)[0] ?? "", tx, top + 89)
  })

  // The founder's call as a gold banner, just above the footer.
  const rowsEnd = rowTop + 3 * rowH + 2 * rowGap
  const bannerH = 76
  const bannerTop = rowsEnd + Math.max(14, (FRAME.footerTop - rowsEnd - bannerH) / 2)
  if (bannerTop + bannerH <= FRAME.footerTop - 8) {
    roundRect(ctx, PAD, bannerTop, W - 2 * PAD, bannerH, bannerH / 2)
    const gold = ctx.createLinearGradient(PAD, 0, W - PAD, 0)
    gold.addColorStop(0, "rgba(252,211,77,0.95)")
    gold.addColorStop(1, "rgba(245,158,11,0.95)")
    ctx.fillStyle = gold
    ctx.fill()
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.font = `700 30px ${FAMILIES}`
    ctx.fillStyle = "#064e3b"
    ctx.fillText(wrap(ctx, "លុយដែលអ្នកខំរក ស័ក្តិសមនឹងការគ្រប់គ្រងច្បាស់លាស់", W - 2 * PAD - 60, 1)[0] ?? "", W / 2, bannerTop + bannerH / 2 + 2)
  }

  drawFooter(ctx)
  return canvas.toBuffer("image/png")
}
