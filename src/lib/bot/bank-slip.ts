// Bank slips sent to the bot as photos (ACLEDA, ABA, Bakong / KHQR…): the
// pure parts — cleaning what Gemini Vision read, choosing the wallet, and the
// one-tap category buttons. The server side is src/lib/server/slip-bot.ts.
import type { MessageKey } from "@/lib/i18n/dictionaries"
import type { BotCategory, BotWallet } from "./parse-entry"

export type Slip = {
  amount: number
  currency: "USD" | "KHR"
  /** OUT: the user paid / sent money; IN: they received it. */
  direction: "OUT" | "IN"
  bank: string | null
  /** YYYY-MM-DD, or null when the slip shows none. */
  date: string | null
  /** Who the money went to (or came from), as printed. */
  party: string | null
}

/**
 * What Gemini returned, checked: a slip with a positive amount in USD or KHR,
 * a real calendar date (else none), short text fields. Null when it isn't a slip.
 */
export function cleanSlip(raw: unknown): Slip | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  if (r.is_slip === false) return null
  const amount = typeof r.amount === "number" ? r.amount : Number(String(r.amount ?? "").replace(/[^0-9.]/g, ""))
  const cur = String(r.currency ?? "").toUpperCase()
  const currency = cur === "USD" || cur === "$" ? "USD" : cur === "KHR" || cur === "៛" || cur === "RIEL" ? "KHR" : null
  if (!currency || !Number.isFinite(amount) || amount <= 0 || amount >= 1e12) return null
  const date = typeof r.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && !Number.isNaN(Date.parse(`${r.date}T00:00:00Z`)) ? r.date : null
  const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().replace(/\s+/g, " ").slice(0, max) : null)
  return {
    amount: currency === "KHR" ? Math.round(amount) : Math.round(amount * 100) / 100,
    currency,
    direction: String(r.direction ?? "").toUpperCase() === "IN" ? "IN" : "OUT",
    bank: text(r.bank, 40),
    date,
    party: text(r.party, 60),
  }
}

/** Bank names as printed on slips → words that appear in wallet names. */
const BANK_WORDS: [RegExp, string[]][] = [
  [/acleda|អេស៊ីលីដា/i, ["acleda", "អេស៊ីលីដា"]],
  [/\baba\b|advanced bank/i, ["aba"]],
  [/wing/i, ["wing"]],
  [/bakong|បាគង/i, ["bakong", "បាគង"]],
  [/canadia/i, ["canadia"]],
  [/prince/i, ["prince"]],
  [/chip ?mong/i, ["chip mong", "chipmong"]],
  [/sathapana/i, ["sathapana"]],
  [/\bppcb|phnom penh commercial/i, ["ppcb"]],
  [/true ?money/i, ["truemoney", "true money"]],
]

/**
 * The wallet for the slip: one named after its bank (in the slip's currency
 * first), else one in that currency, else the first. Credit cards only when
 * the bank matches.
 */
export function pickWallet(slip: Pick<Slip, "bank" | "currency">, wallets: BotWallet[]): BotWallet | null {
  if (!wallets.length) return null
  const words = slip.bank ? (BANK_WORDS.find(([re]) => re.test(slip.bank!))?.[1] ?? [slip.bank.toLowerCase()]) : []
  const named = wallets.filter((w) => words.some((x) => w.name.toLowerCase().includes(x)))
  const plain = wallets.filter((w) => w.kind !== "CREDIT_CARD")
  return (
    named.find((w) => w.currency === slip.currency) ??
    named[0] ??
    plain.find((w) => w.currency === slip.currency) ??
    plain[0] ??
    wallets[0]
  )
}

/** A one-tap button: the category (by preset, with fallbacks) and a note tag for the finer ones. */
export type SlipChoice = { label: MessageKey; presets: string[]; tag?: boolean }

export const SLIP_OUT: SlipChoice[] = [
  { label: "bot.slipCat.food", presets: ["food"] },
  // No coffee category: saved as food, with "☕ …" in the note.
  { label: "bot.slipCat.coffee", presets: ["food"], tag: true },
  { label: "bot.slipCat.fuel", presets: ["transport"], tag: true },
  { label: "bot.slipCat.shopping", presets: ["shopping", "inventory"] },
  { label: "bot.slipCat.home", presets: ["utilities", "housing", "rent"] },
  { label: "bot.slipCat.other", presets: ["other_expense"] },
]

export const SLIP_IN: SlipChoice[] = [
  { label: "bot.slipCat.sales", presets: ["sales", "services"] },
  { label: "bot.slipCat.salary", presets: ["salary"] },
  { label: "bot.slipCat.income", presets: ["other_income"] },
]

export const slipChoices = (kind: "EXPENSE" | "INCOME") => (kind === "INCOME" ? SLIP_IN : SLIP_OUT)

/** The workspace's category for a button (its first preset that exists, else "other"). */
export function categoryFor(choice: SlipChoice, kind: "EXPENSE" | "INCOME", categories: BotCategory[]): BotCategory | null {
  const own = categories.filter((c) => c.type === kind)
  for (const preset of choice.presets) {
    const c = own.find((x) => x.preset_key === preset)
    if (c) return c
  }
  return own.find((c) => c.preset_key === (kind === "INCOME" ? "other_income" : "other_expense")) ?? null
}
