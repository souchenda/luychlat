import type { Currency } from "@/lib/data/types"
import { formatMoney, roundMoney } from "@/lib/money"

/**
 * «ចែកថ្លៃ» — split a bill (founder, 9/11/2026): a meal with friends, the rent, the electricity. The payer keeps the
 * expense; each other person's share becomes «money owed to me» (a RECEIVABLE debt, so the debt reminders and repayments
 * work for it). Pure.
 *
 * Even split: each share is the total ÷ people, rounded DOWN to the cent (USD) or to 100 ៛ (KHR — a computed riel,
 * guardrail 2); whatever the rounding leaves goes to the payer, so the shares always add up to the bill exactly and nobody
 * is asked for more than their part.
 */
export type SplitShare = { name: string; amount: number }

export function evenShares(total: number, currency: Currency, others: string[]): { mine: number; shares: SplitShare[] } {
  const people = others.length + 1
  if (!(total > 0) || others.length === 0) return { mine: roundMoney(Math.max(0, total), currency), shares: [] }
  const each = currency === "KHR" ? Math.floor(total / people / 100) * 100 : Math.floor((total / people) * 100) / 100
  const shares = others.map((name) => ({ name, amount: each }))
  const mine = roundMoney(total - each * others.length, currency)
  return { mine, shares }
}

/** Custom amounts: valid only when the others' shares are positive and leave the payer zero or more. */
export function customShares(total: number, currency: Currency, shares: SplitShare[]): { mine: number; ok: boolean } {
  const others = shares.reduce((s, x) => s + x.amount, 0)
  const mine = roundMoney(total - others, currency)
  return { mine, ok: shares.length > 0 && shares.every((s) => s.amount > 0 && s.name.trim() !== "") && mine >= 0 }
}

/** The message to send the group: what the bill was, and each person's part (international digits — guardrail 7). */
export function splitMessage(title: string, currency: Currency, shares: SplitShare[], lang: "km" | "en" | "zh"): string {
  const head = lang === "km" ? `ចែកថ្លៃ៖ ${title}` : lang === "zh" ? `分摊：${title}` : `Split: ${title}`
  const lines = shares.map((s) => `• ${s.name}: ${formatMoney(s.amount, currency)}`)
  const tail = lang === "km" ? "— អេប លុយឆ្លាត" : "— App Luy Chlat"
  return [head, ...lines, tail].join("\n")
}
