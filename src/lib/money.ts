import type { Currency } from "@/lib/data/types"

export const DEFAULT_KHR_PER_USD = 4100
export const HIDDEN_AMOUNT = "*****"

/** USD keeps cents; KHR has no minor unit in practice. */
export function roundMoney(amount: number, currency: Currency): number {
  return currency === "KHR" ? Math.round(amount) : Math.round(amount * 100) / 100
}

export function convert(amount: number, from: Currency, to: Currency, khrPerUsd: number): number {
  if (from === to) return amount
  return roundMoney(from === "USD" ? amount * khrPerUsd : amount / khrPerUsd, to)
}

/** Rate that turns `from` amounts into `to` amounts. */
export function rateBetween(from: Currency, to: Currency, khrPerUsd: number): number {
  if (from === to) return 1
  return from === "USD" ? khrPerUsd : 1 / khrPerUsd
}

const usdFormat = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const khrFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 })

export function formatMoney(amount: number, currency: Currency, opts?: { hidden?: boolean; signed?: boolean }): string {
  if (opts?.hidden) return currency === "USD" ? `$${HIDDEN_AMOUNT}` : `${HIDDEN_AMOUNT}៛`
  const sign = amount < 0 ? "-" : opts?.signed && amount > 0 ? "+" : ""
  const abs = Math.abs(amount)
  return currency === "USD" ? `${sign}$${usdFormat.format(abs)}` : `${sign}${khrFormat.format(abs)}៛`
}

/** Parses user input like "1,234.5" -> 1234.5; NaN when not a number. */
export function parseAmount(input: string): number {
  const cleaned = input.replace(/[,\s]/g, "")
  if (!/^\d*\.?\d*$/.test(cleaned) || cleaned === "" || cleaned === ".") return Number.NaN
  return Number(cleaned)
}
