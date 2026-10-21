/**
 * The app's own slip scanner (founder, 21/10/2026 — «ស្កេនវិក្កយបត្រ» opens a sheet in the app, never t.me): what the
 * server read from the photo (/api/slip, the bot's reader) → a draft entry for the person to confirm. The same rules as
 * the bot (golden path 1): the exact amount as printed, the wallet only when it is certain (else they pick — never
 * another bank's wallet by number), the payee's obvious category suggested, nothing saved until they tap 💾.
 * Pure — the sheet is components/transactions/scan-slip-modal.tsx.
 */
import { categoryFor, mealFor, resolveWallet, slipChoices, type Slip, type SlipChoice } from "@/lib/bot/bank-slip"
import type { BotCategory, BotWallet } from "@/lib/bot/parse-entry"
import { choiceIndex, heuristicChoice } from "@/lib/bot/slip-auto"
import type { Category, EntryInput, Wallet } from "@/lib/data/types"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { roundMoney } from "@/lib/money"
import { defaultNeedWant } from "@/lib/need-want"

/** What /api/slip answers: the slip, or why there is none. */
export type SlipScanResponse = { slip: Slip } | { error: string }

export const slipKind = (slip: Pick<Slip, "direction">): "EXPENSE" | "INCOME" => (slip.direction === "IN" ? "INCOME" : "EXPENSE")

const asBotWallet = (w: Wallet): BotWallet => ({ id: w.id, name: w.name, currency: w.currency, kind: w.kind ?? null, account_no: w.account_no ?? null, icon: w.icon })

/**
 * The wallet: `walletId` only when the slip settles it (its account name or number, or the one wallet at its bank in
 * its currency); otherwise `choices` to pick from, and nothing is preselected. `wallets` are the workspace's usable,
 * active wallets (no savings goals — they only take transfers).
 */
export function slipWallet(slip: Slip, wallets: Wallet[]): { walletId: string | null; choices: Wallet[] } {
  const pick = resolveWallet(slip, wallets.map(asBotWallet))
  if (!pick) return { walletId: null, choices: wallets }
  if ("wallet" in pick) return { walletId: pick.wallet.id, choices: wallets }
  const ids = new Set(pick.choices.map((w) => w.id))
  return { walletId: null, choices: wallets.filter((w) => ids.has(w.id)) }
}

export type SlipCategoryChoice = { label: MessageKey; categoryId: string; tag: boolean }

/** The bot's one-tap categories (🍲 ☕ ⛽ 🛒 🏠 📦 · 🛍️ 💼 💰), each with the workspace's category; ones it lacks are left out. */
export function slipCategoryChoices(kind: "EXPENSE" | "INCOME", categories: Pick<Category, "id" | "name" | "type" | "preset_key">[]): SlipCategoryChoice[] {
  const own: BotCategory[] = categories.map((c) => ({ id: c.id, name: c.name, type: c.type, preset_key: c.preset_key ?? null }))
  return slipChoices(kind).flatMap((c: SlipChoice) => {
    const category = categoryFor(c, kind, own)
    return category ? [{ label: c.label, categoryId: category.id, tag: Boolean(c.tag) }] : []
  })
}

/** The payee that makes it obvious (a café, a fuel station, a restaurant at a meal time, a mart) → that choice's label. */
export function suggestedChoice(slip: Slip): MessageKey | null {
  if (slipKind(slip) !== "EXPENSE") return null
  const key = heuristicChoice(slip.party, slip.time)
  return key ? slipChoices("EXPENSE")[choiceIndex(key)].label : null
}

/** The slip's own note, as the bot writes it: «🧾 ABA → HUAT HUAT RESTAURANT (012 345 678)». */
export function slipNote(slip: Slip): string {
  return ["🧾", slip.bank, slip.party ? `${slip.direction === "IN" ? "←" : "→"} ${slip.party}` : null, slip.consumer ? `(${slip.consumer})` : null]
    .filter(Boolean)
    .join(" ")
    .slice(0, 200)
}

/** When it was paid: the slip's date and time (Phnom Penh), its date at noon without a time, else now. */
export function slipInstant(slip: Pick<Slip, "date" | "time">, now: Date = new Date()): string {
  if (!slip.date) return now.toISOString()
  return new Date(`${slip.date}T${slip.time ?? "12:00"}:00+07:00`).toISOString()
}

/**
 * The entry to save. The amount is the slip's, exact (never rounded to 100 ៛ — a bank stated it); a wallet in the other
 * currency books it at `rate` (KHR per USD), as a typed entry does. A ☕ / ⛽ choice rides on the note, as in the bot.
 */
export function slipEntryInput(
  slip: Slip,
  o: { wallet: Pick<Wallet, "id" | "currency">; category: SlipCategoryChoice & { preset: string | null }; tagText?: string | null; rate: number; receipt: string | null; now?: Date },
): EntryInput {
  const kind = slipKind(slip)
  const meal = kind === "EXPENSE" && o.category.preset === "food" ? mealFor(slip.time, slip.party) : null
  const note = [o.category.tag ? o.tagText : null, slipNote(slip)].filter(Boolean).join(" · ")
  return {
    type: kind,
    wallet_id: o.wallet.id,
    category_id: o.category.categoryId,
    amount: roundMoney(slip.amount, slip.currency),
    currency: slip.currency,
    exchange_rate: slip.currency === o.wallet.currency ? null : o.rate,
    note: note || null,
    transaction_date: slipInstant(slip, o.now),
    receipt_url: o.receipt,
    need_want: kind === "EXPENSE" ? defaultNeedWant({ preset: o.category.preset, meal }) : null,
    subcategory: meal,
  }
}

/** The sheet's message for each answer that is not a slip. */
export function slipErrorKey(error: string): MessageKey {
  if (error === "busy") return "scanSlip.busy"
  if (error === "feature") return "scanSlip.feature"
  if (["utility_bill", "loan_schedule", "loan_detail", "term_deposit", "kscore", "bank_account", "ev_charge"].includes(error)) return "scanSlip.notSlip"
  return "scanSlip.unreadable"
}
