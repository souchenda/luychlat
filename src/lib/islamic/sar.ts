import { roundRiel } from "@/lib/money"

/**
 * The Saudi riyal for pilgrims (Hajj, Umrah — founder, 19/10/2026), in the Islamic Community hub only — never the
 * general NBC table, the community channel or the general dashboard. The riyal is pegged by the Saudi Central Bank at
 * 1 USD = 3.75 SAR, so its riel rate is the NBC dollar rate ÷ 3.75 — an estimate the card labels as such (money
 * changers' rates differ). Riel the app computes is rounded to 100 ៛ (lib/money roundRiel). Pure (sar.test.ts).
 */
export const SAR_PER_USD = 3.75

/** KHR per 1 SAR from the NBC dollar rate (unrounded — it is a rate, shown to the whole riel). */
export const khrPerSar = (usdKhr: number) => usdKhr / SAR_PER_USD
export const usdPerSar = () => 1 / SAR_PER_USD

export type SarFrom = "USD" | "KHR" | "SAR"

/** One amount in all three: USD and SAR to the cent / halala, riel to 100 ៛. Null without a usable rate or amount. */
export function convertSar(amount: number, from: SarFrom, usdKhr: number): { usd: number; khr: number; sar: number } | null {
  if (!Number.isFinite(amount) || amount < 0 || !Number.isFinite(usdKhr) || usdKhr <= 0) return null
  const usd = from === "USD" ? amount : from === "KHR" ? amount / usdKhr : amount / SAR_PER_USD
  const cents = (n: number) => Math.round(n * 100) / 100
  return { usd: cents(usd), khr: from === "KHR" ? amount : roundRiel(usd * usdKhr), sar: from === "SAR" ? amount : cents(usd * SAR_PER_USD) }
}
