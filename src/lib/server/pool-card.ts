// Server only: the shared pool's closing summary card (1080 × 1080 PNG) on the
// standard poster frame — the pool, what was collected / spent / is left,
// spending by category and the refund per share. Posted to the group when the
// pool is settled, and forwardable as an image.
import { createCanvas } from "@napi-rs/canvas"

import type { PoolSnapshot } from "@/lib/pool"
import { khmerDigits } from "@/lib/dates"
import { formatMoney } from "@/lib/money"

import { FAMILIES, FRAME, GOLD, drawFooter, drawHeader, loadFonts, roundRect, wrap } from "./poster-kit"

const { W, H, PAD } = FRAME

/** Spending by category, largest first (entries carry their category name). */
export function spentByCategory(p: PoolSnapshot): { name: string; amt: number }[] {
  const totals = new Map<string, number>()
  for (const e of p.entries) {
    if (e.type !== "EXPENSE") continue
    const name = e.category ?? "ផ្សេងៗ"
    totals.set(name, (totals.get(name) ?? 0) + Number(e.amt))
  }
  return [...totals.entries()].map(([name, amt]) => ({ name, amt })).sort((a, b) => b.amt - a.amt)
}

export function poolCard(p: PoolSnapshot): Buffer {
  loadFonts()
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext("2d")
  const money = (v: number) => formatMoney(v, p.currency)

  const bg = ctx.createLinearGradient(0, 0, W * 0.35, H)
  bg.addColorStop(0, "#031c15")
  bg.addColorStop(1, "#064e3b")
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W * 0.85, H * 0.08, 0, W * 0.85, H * 0.08, W * 0.7)
  glow.addColorStop(0, "rgba(52,211,153,0.22)")
  glow.addColorStop(1, "rgba(52,211,153,0)")
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  drawHeader(ctx, { text: p.unit === "FAMILY" ? "បេឡារួម · គ្រួសារ" : "បេឡារួម", icon: "bulb" })

  // Title and a closing tag.
  ctx.textAlign = "left"
  ctx.textBaseline = "alphabetic"
  ctx.font = `600 28px ${FAMILIES}`
  ctx.fillStyle = "#fde68a"
  ctx.fillText("សរុបបិទបេឡារួម", PAD, FRAME.contentTop + 50)
  ctx.font = `700 60px ${FAMILIES}`
  ctx.fillStyle = "#ffffff"
  ctx.fillText(wrap(ctx, p.title, W - 2 * PAD, 1)[0], PAD, FRAME.contentTop + 128)

  // Three totals.
  const boxes: [string, number, string][] = [
    ["ប្រមូលបាន", p.pooled, "#a7f3d0"],
    ["ចំណាយ", p.spent, "#fecaca"],
    ["នៅសល់", p.remaining, GOLD],
  ]
  const top = FRAME.contentTop + 170
  const bw = (W - 2 * PAD - 2 * 18) / 3
  boxes.forEach(([label, value, color], i) => {
    const x = PAD + i * (bw + 18)
    roundRect(ctx, x, top, bw, 120, 22)
    ctx.fillStyle = "rgba(255,255,255,0.06)"
    ctx.fill()
    ctx.lineWidth = 1.5
    ctx.strokeStyle = "rgba(52,211,153,0.3)"
    ctx.stroke()
    ctx.font = `500 26px ${FAMILIES}`
    ctx.fillStyle = "rgba(209,250,229,0.8)"
    ctx.fillText(label, x + 24, top + 44)
    ctx.font = `700 38px ${FAMILIES}`
    ctx.fillStyle = color
    ctx.fillText(money(value), x + 24, top + 94)
  })

  // Spending by category (up to 4 bars).
  let y = top + 180
  const cats = spentByCategory(p).slice(0, 4)
  const most = Math.max(1, ...cats.map((c) => c.amt))
  ctx.font = `600 26px ${FAMILIES}`
  ctx.fillStyle = "#fde68a"
  if (cats.length) ctx.fillText("ចំណាយតាមប្រភេទ", PAD, y)
  y += 22
  for (const c of cats) {
    ctx.font = `500 26px ${FAMILIES}`
    ctx.fillStyle = "#ecfdf5"
    ctx.fillText(c.name, PAD, y + 28)
    ctx.textAlign = "right"
    ctx.fillText(money(c.amt), W - PAD, y + 28)
    ctx.textAlign = "left"
    roundRect(ctx, PAD, y + 40, W - 2 * PAD, 10, 5)
    ctx.fillStyle = "rgba(255,255,255,0.08)"
    ctx.fill()
    roundRect(ctx, PAD, y + 40, Math.max(10, ((W - 2 * PAD) * c.amt) / most), 10, 5)
    ctx.fillStyle = "#34d399"
    ctx.fill()
    y += 70
  }

  // Refund per share (equal shares → one line; otherwise the first few).
  const s = p.settlement
  if (s && s.shares.length && s.mode !== "ROLLOVER") {
    y += 14
    const amounts = new Set(s.shares.map((x) => x.amount))
    const each = s.mode === "REFUND" ? "ប្រាក់សល់ត្រឡប់វិញ" : "ត្រូវបង់បន្ថែម"
    const unit = p.unit === "FAMILY" ? "គ្រួសារ" : "នាក់"
    roundRect(ctx, PAD, y, W - 2 * PAD, 76, 20)
    ctx.fillStyle = "rgba(251,191,36,0.12)"
    ctx.fill()
    ctx.strokeStyle = "rgba(251,191,36,0.5)"
    ctx.stroke()
    ctx.font = `600 28px ${FAMILIES}`
    ctx.fillStyle = "#fde68a"
    const line =
      amounts.size === 1
        ? `${each}៖ ${money(s.shares[0].amount)} ក្នុងមួយ${unit} (${khmerDigits(String(s.shares.length))} ${unit})`
        : `${each}៖ ${s.shares.slice(0, 3).map((x) => `${x.name} ${money(x.amount)}`).join(" · ")}${s.shares.length > 3 ? " …" : ""}`
    ctx.fillText(wrap(ctx, line, W - 2 * PAD - 48, 1)[0], PAD + 24, y + 48)
  }

  drawFooter(ctx)
  return canvas.toBuffer("image/png")
}
