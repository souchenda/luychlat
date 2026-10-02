import type { Currency } from "@/lib/data/types"
import { convert, roundMoney } from "@/lib/money"

/**
 * Diamonds (ពេជ្រ). Shops in Cambodia buy a diamond back at the purchase
 * price minus a deduction (often 15% for cash, less as a trade-in), so the
 * money it would really fetch today is price × (1 − deduction). That liquid
 * value, not the sticker price, counts in net worth.
 */
export type DiamondForm = "RING" | "NECKLACE" | "EARRINGS" | "BRACELET" | "LOOSE"
export const DIAMOND_FORMS: DiamondForm[] = ["RING", "NECKLACE", "EARRINGS", "BRACELET", "LOOSE"]
export const FORM_EMOJI: Record<DiamondForm, string> = { RING: "💍", NECKLACE: "📿", EARRINGS: "✨", BRACELET: "⭕", LOOSE: "💎" }

export type ColorScale = "KH" | "GIA"
export const KH_COLORS = ["100", "99", "98", "97"] as const
export const GIA_COLORS = ["D", "E", "F", "G", "H", "I", "J", "K", "L", "M"] as const
export const CLARITIES = ["FL", "IF", "VVS1", "VVS2", "VS1", "VS2", "SI1", "SI2", "I1"] as const
export type CertType = "GIA" | "HRD" | "IGI" | "STORE" | "NONE"
export const CERT_TYPES: CertType[] = ["GIA", "HRD", "IGI", "STORE", "NONE"]
/** Sizes people ask for in shops (លី = mm). */
export const COMMON_SIZES_LI = [3.0, 3.6, 4.0, 4.5, 5.0, 5.4, 6.0, 6.3, 6.5, 7.2, 8.0]

export type Diamond = {
  id: string
  workspace_id: string
  name: string
  form: DiamondForm
  size_li: number | null
  carat: number | null
  color_scale: ColorScale | null
  color: string | null
  clarity: string | null
  cert_type: CertType
  cert_number: string | null
  store: string | null
  purchase_date: string | null
  purchase_price: number
  currency: Currency
  buyback_pct: number
  tradein_pct: number | null
  note: string | null
  created_at: string
}
export type DiamondInput = Omit<Diamond, "id" | "workspace_id" | "created_at">

/**
 * Approximate carat of a round brilliant from its diameter in mm (លី):
 * weight ≈ 0.0037 × d³ (4.5 → 0.34 ct, 5.4 → 0.58 ct, 6.5 → 1.02 ct).
 */
export function caratFromSize(sizeLi: number): number {
  return Math.round(0.0037 * sizeLi ** 3 * 100) / 100
}

/** Cash a shop would pay back (and the trade-in value when a rate is set). */
export function resaleValue(d: Pick<Diamond, "purchase_price" | "currency" | "buyback_pct" | "tradein_pct">) {
  const liquid = roundMoney(d.purchase_price * (1 - d.buyback_pct / 100), d.currency)
  const tradeIn = d.tradein_pct == null ? null : roundMoney(d.purchase_price * (1 - d.tradein_pct / 100), d.currency)
  return { liquid, deduction: roundMoney(d.purchase_price - liquid, d.currency), tradeIn }
}

/** Total liquid value in USD (what counts in net worth) and total paid. */
export function diamondTotals(list: Diamond[], khrPerUsd: number) {
  let liquid = 0
  let paid = 0
  let carats = 0
  for (const d of list) {
    liquid += convert(resaleValue(d).liquid, d.currency, "USD", khrPerUsd)
    paid += convert(d.purchase_price, d.currency, "USD", khrPerUsd)
    carats += d.carat ?? 0
  }
  return { liquidUsd: roundMoney(liquid, "USD"), paidUsd: roundMoney(paid, "USD"), carats: Math.round(carats * 1000) / 1000 }
}

/** "5.4 លី · 0.58 ct · ទឹក 99 · VVS1" (only what is known). */
export function diamondSpec(d: Pick<Diamond, "size_li" | "carat" | "color_scale" | "color" | "clarity">, locale: "km" | "en"): string {
  const parts: string[] = []
  if (d.size_li != null) parts.push(`${d.size_li} ${locale === "km" ? "លី" : "mm"}`)
  if (d.carat != null) parts.push(`${d.carat} ct`)
  if (d.color) parts.push(d.color_scale === "KH" ? `${locale === "km" ? "ទឹក" : "Water"} ${d.color}` : d.color)
  if (d.clarity) parts.push(d.clarity)
  return parts.join(" · ")
}
