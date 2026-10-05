import type { Currency } from "@/lib/data/types"

/** Gift & merit ledger (សៀវភៅចំណងដៃ): shared by the app and the bot. */
export type GiftDirection = "given" | "received"
export type GiftEventType = "wedding" | "housewarming" | "monk_merit" | "funeral" | "birthday" | "other"

export type Gift = {
  id?: string
  direction: GiftDirection
  person_name: string
  phone_number?: string | null
  event_type: GiftEventType
  event_title: string | null
  amount: number
  currency: Currency
  event_date: string
  wallet_id?: string | null
  transaction_id?: string | null
  notes?: string | null
  created_at?: string
}

export const GIFT_EVENTS: { type: GiftEventType; emoji: string }[] = [
  { type: "wedding", emoji: "💍" },
  { type: "housewarming", emoji: "🏠" },
  { type: "monk_merit", emoji: "🪷" },
  { type: "funeral", emoji: "🕯️" },
  { type: "birthday", emoji: "🎂" },
  { type: "other", emoji: "🎁" },
]
export const giftEmoji = (type: string) => GIFT_EVENTS.find((e) => e.type === type)?.emoji ?? "🎁"

/** The same person however the name was typed ("បង សុខា" = "បងសុខា"). */
export const personKey = (name: string) => name.toLowerCase().replace(/\s+/g, "").trim()

export type GiftSummary = {
  given: Partial<Record<Currency, number>>
  received: Partial<Record<Currency, number>>
  countGiven: number
  countReceived: number
  lastReceived: Gift | null
  lastGiven: Gift | null
  /** What to give back next time: what they last gave us (else what we last gave them). */
  suggestion: { amount: number; currency: Currency; basis: "they_gave" | "we_gave" } | null
}

/** The two-way picture with one person (entries already filtered to them). */
export function giftSummary(entries: Gift[]): GiftSummary {
  const given: Partial<Record<Currency, number>> = {}
  const received: Partial<Record<Currency, number>> = {}
  const byDate = [...entries].sort((a, b) => b.event_date.localeCompare(a.event_date))
  for (const g of entries) {
    const bucket = g.direction === "given" ? given : received
    bucket[g.currency] = (bucket[g.currency] ?? 0) + Number(g.amount)
  }
  const lastReceived = byDate.find((g) => g.direction === "received") ?? null
  const lastGiven = byDate.find((g) => g.direction === "given") ?? null
  const suggestion = lastReceived
    ? { amount: Number(lastReceived.amount), currency: lastReceived.currency, basis: "they_gave" as const }
    : lastGiven
      ? { amount: Number(lastGiven.amount), currency: lastGiven.currency, basis: "we_gave" as const }
      : null
  return {
    given,
    received,
    countGiven: entries.filter((g) => g.direction === "given").length,
    countReceived: entries.filter((g) => g.direction === "received").length,
    lastReceived,
    lastGiven,
    suggestion,
  }
}
