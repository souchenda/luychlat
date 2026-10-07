// Bank slips sent to the bot as photos (ACLEDA, ABA, Bakong / KHQR…): the
// pure parts — cleaning what Gemini Vision read, choosing the wallet, and the
// one-tap category buttons. The server side is src/lib/server/slip-bot.ts.
import type { Meal } from "@/lib/data/types"
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
  /** HH:MM (24h, as printed), or null when the slip shows none. */
  time: string | null
  /** Who the money went to (or came from), as printed. */
  party: string | null
  /**
   * The slip owner's own account (OUT: paid from, IN: paid into): digits, with
   * "*" for each masked run ("016*4222"); null when the slip shows none.
   */
  account: string | null
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
  // "19:05", "7:05 PM", "07:05:33 am" → "19:05" / "07:05".
  const hm = typeof r.time === "string" ? /^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp])?\.?[Mm]?\.?$/.exec(r.time.trim()) : null
  let hour = hm ? Number(hm[1]) : NaN
  if (hm?.[3] && hour >= 1 && hour <= 12) hour = (hour % 12) + (/p/i.test(hm[3]) ? 12 : 0)
  const time = hm && hour < 24 && Number(hm[2]) < 60 ? `${String(hour).padStart(2, "0")}:${hm[2]}` : null
  const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().replace(/\s+/g, " ").slice(0, max) : null)
  return {
    amount: currency === "KHR" ? Math.round(amount) : Math.round(amount * 100) / 100,
    currency,
    direction: String(r.direction ?? "").toUpperCase() === "IN" ? "IN" : "OUT",
    bank: text(r.bank, 40),
    date,
    time,
    party: text(r.party, 60),
    account: cleanAccount(r.account),
  }
}

/** "016 824 222" → "016824222"; "016 *** 4222", "016xxx4222" → "016*4222". Too few digits → null. */
export function cleanAccount(v: unknown): string | null {
  if (typeof v !== "string" && typeof v !== "number") return null
  const s = String(v)
    .replace(/[*xX•·●…]+|\.{2,}/g, "*")
    .replace(/[^0-9*]/g, "")
    .replace(/\*+/g, "*")
    .replace(/^\*$/, "")
  return s.replace(/\*/g, "").length >= 4 && s.length <= 40 ? s : null
}

/**
 * How well a slip's account matches a wallet's account number: the count of
 * known digits that agree (every visible part must agree, masked runs are
 * wildcards), 0 when they differ. "016*4222" matches 016824222 (7) but never
 * 078824222, though both end in 4222.
 */
export function accountScore(slipAccount: string | null, walletAccount: string | null | undefined): number {
  const wallet = (walletAccount ?? "").replace(/\D/g, "")
  if (!slipAccount || wallet.length < 4) return 0
  const parts = slipAccount.split("*")
  if (parts.length === 1) {
    // Fully printed: the same number (or one ends with the other), also with phone-style numbers
    // "855" country code / leading 0 left off (Wing, ABA by phone).
    const local = (d: string) => d.replace(/^855(?=\d{8,9}$)/, "").replace(/^0+/, "")
    const a = parts[0]
    if (a === wallet || (local(a).length >= 6 && local(a) === local(wallet))) return a.length
    const [short, long] = a.length < wallet.length ? [a, wallet] : [wallet, a]
    return short.length >= 6 && long.endsWith(short) ? short.length : 0
  }
  // Masked: the visible head and tail must match the ends, any middle pieces in order between them.
  const head = parts[0]
  const tail = parts[parts.length - 1]
  if (!wallet.startsWith(head) || !wallet.endsWith(tail) || head.length + tail.length > wallet.length) return 0
  let at = head.length
  for (const mid of parts.slice(1, -1)) {
    const i = wallet.indexOf(mid, at)
    if (i < 0 || i + mid.length > wallet.length - tail.length) return 0
    at = i + mid.length
  }
  return parts.join("").length
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
 * The wallet for the slip. First by account number: the wallet(s) whose number
 * best matches the slip's (in the slip's currency first — a "$ + ៛" pair shares
 * one number). Only when no number matches: one named after its bank (in the
 * slip's currency first), else one in that currency, else the first. Credit
 * cards only when the bank or the number matches.
 */
export function pickWallet(slip: Pick<Slip, "bank" | "currency"> & Partial<Pick<Slip, "account">>, wallets: BotWallet[]): BotWallet | null {
  if (!wallets.length) return null
  if (slip.account) {
    const scored = wallets.map((w) => ({ w, score: accountScore(slip.account!, w.account_no) })).filter((x) => x.score >= 4)
    const best = Math.max(0, ...scored.map((x) => x.score))
    const top = scored.filter((x) => x.score === best).map((x) => x.w)
    const byNumber = top.find((w) => w.currency === slip.currency) ?? top[0]
    if (byNumber) return byNumber
  }
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

/** The meal of a food expense (transactions.subcategory). */
export type { Meal }
export const MEALS: Meal[] = ["breakfast", "lunch", "dinner", "snack"]

/** Cafés and drink shops (as Cambodian slips print them): always a snack / drink, whatever the hour. */
const CAFE = /caf[eé]|coffee|kopi|espresso|starbucks|amazon|brown|tube|costa|milk ?tea|bubble ?tea|chatime|koi th[eé]|gong ?cha|tous les jours|bakery|tea|កាហ្វេ|តែ/i

/**
 * The meal from the payment time (Cambodia, HH:MM): 06:00–10:30 breakfast,
 * 11:00–14:00 lunch, 17:00–21:00 dinner, any other hour (or a café) snack.
 * Null when there is no time to go by.
 */
export function mealFor(time: string | null, party: string | null): Meal | null {
  if (party && CAFE.test(party)) return "snack"
  const m = time ? /^(\d{2}):(\d{2})$/.exec(time) : null
  if (!m) return null
  const minutes = Number(m[1]) * 60 + Number(m[2])
  if (minutes >= 6 * 60 && minutes <= 10 * 60 + 30) return "breakfast"
  if (minutes >= 11 * 60 && minutes <= 14 * 60) return "lunch"
  if (minutes >= 17 * 60 && minutes <= 21 * 60) return "dinner"
  return "snack"
}

/** A slip choice that books food (the meal row shows under its saved card). */
export const isFoodChoice = (c: SlipChoice) => c.presets[0] === "food"
