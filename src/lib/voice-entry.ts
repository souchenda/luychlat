/**
 * 🎤 Speak an entry in the app (founder, 3/11/2026 — the bot's Khmer voice engine behind a mic in the entry sheet):
 * what was heard → the amount, currency, kind, wallet and category the entry sheet is filled with, by the bot's own
 * parser (lib/bot/parse-entry.ts). Nothing is saved here — the person checks the sheet and taps Save, as the bot's ✅.
 * Pure (voice-entry.test.ts).
 */
import { parseAmountText, parseEntry, type BotCategory, type BotWallet } from "@/lib/bot/parse-entry"
import type { CategoryType, Currency } from "@/lib/data/types"
import { roundMoney } from "@/lib/money"

/** A note longer than this is not an entry (and costs more to transcribe): the recorder stops itself. */
export const VOICE_MAX_SECONDS = 30
/** About 30 s of compressed speech, with room to spare. */
export const VOICE_MAX_BYTES = 2 * 1024 * 1024

/**
 * Free for everyone (founder, 4/11/2026: «free, as long as it costs us nothing and never slows PRO»): a Free account speaks
 * up to 10 entries a Cambodian day, so the speech quota PRO shares is never spent by free use; PRO / ULTRA, no daily cap.
 */
export const VOICE_FREE_PER_DAY = 10
export const voiceDayAllowed = (tier: string | null | undefined, usedToday: number) => (tier === "PRO" || tier === "ULTRA" ? true : usedToday < VOICE_FREE_PER_DAY)

export type VoiceDraft = {
  type: CategoryType
  amount: number
  currency: Currency
  /** Null: the sheet keeps its wallet. */
  walletId: string | null
  /** Null when nothing matched (the parser's «other» fallback is not offered — the person picks). */
  categoryId: string | null
  note: string
}

/** The sheet's fields from the words heard (digits already turned from Khmer words); null when no amount was said. */
export function voiceDraft(text: string, ctx: { wallets: BotWallet[]; categories: BotCategory[]; rate: number }): VoiceDraft | null {
  const note = text.replace(/\s+/g, " ").trim().slice(0, 200)
  const parsed = parseEntry(text, { ...ctx, debts: [] })
  if (parsed.ok && parsed.kind !== "REPAY") {
    return {
      type: parsed.kind,
      amount: parsed.amount,
      currency: parsed.currency,
      walletId: parsed.wallet.id,
      categoryId: parsed.guessed ? null : (parsed.category?.id ?? null),
      note: parsed.note,
    }
  }
  // A repayment («សង Dara 20$») is the debt's screen; no wallet yet: the amount alone still saves typing.
  const amount = parseAmountText(text)
  if (!amount) return null
  const currency = amount.currency ?? ctx.wallets[0]?.currency ?? "USD"
  return { type: "EXPENSE", amount: roundMoney(amount.value, currency), currency, walletId: null, categoryId: null, note }
}

/** The first recording format this browser can make (Chrome / Android: webm; iPhone Safari: mp4). */
export function recorderMime(supported: (mime: string) => boolean): string | null {
  for (const mime of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) if (supported(mime)) return mime
  return null
}

/** What the server may answer. */
export type VoiceEntryResponse = { heard: string; text: string } | { error: "unauthorized" | "feature" | "off" | "invalid" | "failed" | "unsure" | "busy" | "limit"; heard?: string }
