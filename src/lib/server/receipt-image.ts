// Server only: the shareable receipt image, drawn with Skia (@napi-rs/canvas),
// whose HarfBuzz shaping gets Khmer right (subscripts, split vowels like ោ ឿ ៀ).
import { createCanvas, GlobalFonts, type SKRSContext2D } from "@napi-rs/canvas"
import QRCode from "qrcode"

import type { Locale } from "@/lib/i18n/dictionaries"
import type { ReceiptData } from "@/lib/invoice"
import { isKhqr, khqrInfo } from "@/lib/khqr"
import { formatMoney } from "@/lib/money"
import { formatPhoneNumber } from "@/lib/format"

const W = 900
const PAD = 56
const KHQR_RED = "#E1232E"
// Latin first, then Khmer and Chinese for the characters it doesn't have.
const FAMILIES = `"Noto Sans", "Noto Sans Khmer", "Khmer UI", "WenQuanYi Zen Hei", "Microsoft YaHei", sans-serif`

let fontsLoaded = false
/** The image's fonts: Alpine's font-noto, font-noto-khmer and font-wqy-zenhei (Windows fonts in local dev). */
function loadFonts() {
  if (fontsLoaded) return
  fontsLoaded = true
  for (const dir of ["/usr/share/fonts", "C:/Windows/Fonts"]) GlobalFonts.loadFontsFromDir(dir)
}

type Labels = { title: string; no: string; date: string; customer: string; total: string; note: string; paid: string; cancelled: string; scan: string; noQr: string }

// Khmer and Chinese receipts carry English too: customers may read either.
const LABELS: Record<Locale, Labels> = {
  km: {
    title: "វិក្កយបត្រ · RECEIPT",
    no: "លេខ / No.",
    date: "កាលបរិច្ឆេទ / Date",
    customer: "អតិថិជន / Customer",
    total: "សរុប / TOTAL",
    note: "សម្គាល់ / Note",
    paid: "បានបង់ · PAID",
    cancelled: "បានបោះបង់ · CANCELLED",
    scan: "ស្កេនដើម្បីបង់ · Scan to pay",
    noQr: "មិនទាន់មាន KHQR",
  },
  en: { title: "RECEIPT", no: "No.", date: "Date", customer: "Customer", total: "TOTAL", note: "Note", paid: "PAID", cancelled: "CANCELLED", scan: "Scan to pay", noQr: "No KHQR yet" },
  zh: {
    title: "收据 · RECEIPT",
    no: "编号 / No.",
    date: "日期 / Date",
    customer: "客户 / Customer",
    total: "合计 / TOTAL",
    note: "备注 / Note",
    paid: "已付款 · PAID",
    cancelled: "已取消 · CANCELLED",
    scan: "扫码付款 · Scan to pay",
    noQr: "尚未添加 KHQR",
  },
}

/** "04/10/2026 22:15", Cambodia time. */
function stamp(iso: string) {
  const d = new Date(new Date(iso).getTime() + 7 * 3_600_000)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}

type Pen = { size: number; weight?: 400 | 600 | 700; color?: string; align?: "left" | "right" | "center" }

function writer(ctx: SKRSContext2D) {
  const set = (pen: Pen) => {
    ctx.font = `${pen.weight ?? 400} ${pen.size}px ${FAMILIES}`
    ctx.fillStyle = pen.color ?? "#0f172a"
    ctx.textAlign = pen.align ?? "left"
  }
  /** Draws one line, cut with "…" to fit maxWidth. */
  return (x: number, y: number, value: string, pen: Pen, maxWidth = W - 2 * PAD) => {
    set(pen)
    let s = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim()
    if (ctx.measureText(s).width > maxWidth) {
      const chars = [...s]
      while (chars.length > 1 && ctx.measureText(`${chars.join("")}…`).width > maxWidth) chars.pop()
      s = `${chars.join("")}…`
    }
    ctx.fillText(s, x, y)
    return ctx.measureText(s).width
  }
}

function dashed(ctx: SKRSContext2D, y: number) {
  ctx.save()
  ctx.strokeStyle = "#cbd5e1"
  ctx.lineWidth = 2
  ctx.setLineDash([10, 8])
  ctx.beginPath()
  ctx.moveTo(PAD, y)
  ctx.lineTo(W - PAD, y)
  ctx.stroke()
  ctx.restore()
}

/** Lays the receipt out; with draw = false it only measures the height. */
function layout(ctx: SKRSContext2D, data: ReceiptData, locale: Locale): number {
  const L = LABELS[locale] ?? LABELS.km
  const inv = data.invoice
  const money = (n: number) => formatMoney(n, inv.currency)
  const write = writer(ctx)
  const half = (W - 2 * PAD) / 2 - 10

  // Header band: who it is from.
  const headerH = data.merchant_phone ? 170 : 140
  ctx.fillStyle = "#0f766e"
  ctx.fillRect(0, 0, W, headerH)
  write(PAD, 80, data.merchant, { size: 44, weight: 700, color: "#ffffff" })
  if (data.merchant_phone) write(PAD, 130, formatPhoneNumber(data.merchant_phone), { size: 28, color: "#ccfbf1" })
  let y = headerH + 72

  write(PAD, y, L.title, { size: 38, weight: 700 })
  const row = (label: string, value: string, weight: 400 | 600 = 400) => {
    y += 44
    write(PAD, y, label, { size: 26, color: "#64748b" }, half)
    write(W - PAD, y, value, { size: 26, weight, align: "right" }, half)
  }
  y += 10
  row(L.no, inv.invoice_number, 600)
  row(L.date, stamp(inv.created_at))
  if (inv.customer_name) row(L.customer, inv.customer_name, 600)
  y += 34
  dashed(ctx, y)

  // Items.
  for (const item of inv.items.slice(0, 30)) {
    y += 52
    const qty = item.qty && item.qty !== 1 ? ` × ${item.qty}` : ""
    const priced = typeof item.price === "number"
    write(PAD, y, item.name + qty, { size: 30 }, priced ? W - 2 * PAD - 220 : W - 2 * PAD)
    if (priced) write(W - PAD, y, money((item.qty ?? 1) * item.price!), { size: 30, align: "right" }, 210)
  }
  if (inv.items.length) {
    y += 34
    dashed(ctx, y)
  }

  // Total.
  y += 72
  write(PAD, y, L.total, { size: 32, weight: 700 }, 330)
  write(W - PAD, y + 4, money(inv.total_amount), { size: 56, weight: 700, color: "#0f766e", align: "right" }, 460)
  if (inv.notes) {
    y += 56
    write(PAD, y, `${L.note}: ${inv.notes}`, { size: 26, color: "#475569" })
  }

  // Paid / cancelled stamp, or the KHQR to pay with.
  y += 50
  if (inv.status !== "pending") {
    const paid = inv.status === "paid"
    const color = paid ? "#059669" : "#dc2626"
    const label = paid ? L.paid : L.cancelled
    ctx.font = `700 52px ${FAMILIES}`
    const boxW = Math.min(W - 2 * PAD, ctx.measureText(label).width + 100)
    y += 30
    ctx.save()
    ctx.translate(W / 2, y + 60)
    ctx.rotate((-6 * Math.PI) / 180)
    ctx.strokeStyle = color
    ctx.lineWidth = 7
    ctx.beginPath()
    ctx.roundRect(-boxW / 2, -60, boxW, 120, 18)
    ctx.stroke()
    write(0, 18, label, { size: 52, weight: 700, color, align: "center" }, boxW - 40)
    ctx.restore()
    if (paid && inv.paid_at) write(W / 2, y + 176, stamp(inv.paid_at), { size: 24, color: "#64748b", align: "center" })
    y += 210
  } else if (data.khqr && isKhqr(data.khqr)) {
    const info = khqrInfo(data.khqr)
    const cardW = 520
    const cardX = (W - cardW) / 2
    const qrSize = 400
    const cardH = 96 + 70 + qrSize + 60
    ctx.fillStyle = "#ffffff"
    ctx.strokeStyle = "#e2e8f0"
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.roundRect(cardX, y, cardW, cardH, 28)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = KHQR_RED
    ctx.beginPath()
    ctx.roundRect(cardX, y, cardW, 96, [28, 28, 0, 0])
    ctx.fill()
    write(W / 2, y + 64, "KHQR", { size: 40, weight: 700, color: "#ffffff", align: "center" })
    write(W / 2, y + 96 + 46, info.name ?? data.merchant, { size: 28, weight: 600, align: "center" }, cardW - 40)
    // The user's own code, exactly as it is (nothing added).
    const qr = QRCode.create(data.khqr, { errorCorrectionLevel: "M" })
    const n = qr.modules.size
    const cell = qrSize / n
    const qx = (W - qrSize) / 2
    const qy = y + 96 + 70
    ctx.fillStyle = "#000000"
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.modules.get(r, c)) ctx.fillRect(qx + c * cell, qy + r * cell, Math.ceil(cell), Math.ceil(cell))
    y += cardH + 50
    write(W / 2, y, `${L.scan} ${money(inv.total_amount)}`, { size: 28, weight: 600, align: "center" })
    y += 30
  } else {
    ctx.fillStyle = "#f1f5f9"
    ctx.beginPath()
    ctx.roundRect(PAD, y, W - 2 * PAD, 90, 18)
    ctx.fill()
    write(W / 2, y + 56, L.noQr, { size: 26, color: "#64748b", align: "center" })
    y += 90
  }

  y += 70
  write(W / 2, y, "LuyChlat · លុយឆ្លាត", { size: 22, color: "#94a3b8", align: "center" })
  return y + 50
}

/** PNG of the receipt (900 px wide). */
export function receiptPng(data: ReceiptData, locale: Locale): Buffer {
  loadFonts()
  // Measure on a scratch canvas, then draw at the right height.
  const height = layout(createCanvas(W, 3000).getContext("2d"), data, locale)
  const canvas = createCanvas(W, height)
  const ctx = canvas.getContext("2d")
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, W, height)
  layout(ctx, data, locale)
  return canvas.toBuffer("image/png")
}
