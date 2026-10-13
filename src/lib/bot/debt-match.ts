/**
 * Receipts and «clc paid» meet the loans (founder, 13/10/2026): which loan the person owes a payee /
 * a typed name points to — by the institution («CAMBODIAN LABOR CARE PLC», «clc» → the CLC loan) or by
 * a distinctive word of the loan's name. Only when exactly one loan fits — two PPCBank loans and
 * «ppcbank paid» is a question for the app, never a guess. Pure (debt-match.test.ts).
 */
import { matchInstitution } from "@/lib/institution-logos"

import type { BotDebt } from "./parse-entry"

/** Words of a loan's name that say nothing about which loan it is. */
const STOP = new Set(["plc", "co", "ltd", "inc", "bank", "loan", "loans", "company", "the", "of", "to", "for", "individual", "usd", "khr", "new", "and", "កម្ចី", "ធនាគារ"])

const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter((w) => w.length >= 3 && !STOP.has(w))

/** The one open loan the person owes that `text` names, or null (none, or more than one). */
export function matchPayableDebt(text: string | null | undefined, debts: BotDebt[]): BotDebt | null {
  if (!text?.trim()) return null
  const owed = debts.filter((d) => d.type === "PAYABLE" && d.remaining > 0)
  if (!owed.length) return null
  // 0. A loan account number in the text that one loan's name carries («1-224-00006341-4»).
  const digits = (s: string) => (s.match(/\d[\d-]{5,}\d/g) ?? []).map((x) => x.replace(/\D/g, "")).filter((x) => x.length >= 6)
  const numbers = digits(text)
  if (numbers.length) {
    const byNumber = owed.filter((d) => digits(d.party_name).some((n) => numbers.includes(n)))
    if (byNumber.length === 1) return byNumber[0]
  }
  // 1. The same institution (registry aliases: «clc», «Labor Care», «PPCBank»).
  const inst = matchInstitution(text)?.key
  if (inst) {
    const same = owed.filter((d) => matchInstitution(d.party_name)?.key === inst)
    if (same.length === 1) return same[0]
    if (same.length > 1) return null
  }
  // 2. A distinctive word of the loan's name in the text ("labor care", "sokha").
  const typed = new Set(words(text))
  const scored = owed.map((d) => ({ d, score: words(d.party_name).filter((w) => typed.has(w)).reduce((n, w) => n + w.length, 0) })).filter((x) => x.score >= 4)
  if (!scored.length) return null
  scored.sort((a, b) => b.score - a.score)
  return scored.length === 1 || scored[0].score > scored[1].score ? scored[0].d : null
}

/** «clc paid», «បង់ clc», «paid clc», «បានបង់ CLC ហើយ» — paying, not a new expense. */
export const PAID_WORDS = /(^|[^\p{L}])(paid|pay|payed)($|[^\p{L}])|បង់|បានសង|已付|付了/iu
export const isPaidMessage = (text: string) => PAID_WORDS.test(text)

/** The «record this receipt as that loan's repayment?» buttons (≤ 64 bytes each). */
export function debtLinkButtons(txId: string, debtId: string) {
  return {
    inline_keyboard: [
      [
        { text: "✅ បាទ — សងកម្ចីនេះ", callback_data: `dl:${txId}:${debtId.slice(0, 8)}` },
        { text: "❌ ទេ", callback_data: `dx:${txId}` },
      ],
    ],
  }
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
export const isDebtLinkCallback = (data: string | undefined) => new RegExp(`^(dl:${UUID}:[0-9a-f]{8}|dx:${UUID})$`).test(data ?? "")
export function parseDebtLinkCallback(data: string | undefined): { txId: string; debtPrefix: string | null } | null {
  const m = new RegExp(`^(?:dl:(${UUID}):([0-9a-f]{8})|dx:(${UUID}))$`).exec(data ?? "")
  if (!m) return null
  return m[1] ? { txId: m[1], debtPrefix: m[2] } : { txId: m[3], debtPrefix: null }
}
