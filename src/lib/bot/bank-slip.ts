// Bank slips sent to the bot as photos (ACLEDA, ABA, Bakong / KHQR…): the
// pure parts — cleaning what Gemini Vision read, choosing the wallet, and the
// one-tap category buttons. The server side is src/lib/server/slip-bot.ts.
import type { Meal } from "@/lib/data/types"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { providerForName, walletInstitution } from "@/lib/wallets/providers"

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
  /** The name printed with the slip owner's account ("DL USD"), if any. */
  accountName?: string | null
  /** The slip owner's account holder name ("SOK DARA"), if printed. */
  owner?: string | null
  /** A bill payment / top-up's consumer ID or phone number, if any. */
  consumer?: string | null
  /** The account the money went TO (digits, "*" for masked runs), if printed. */
  toAccount?: string | null
  /** The slip's own transaction ID / reference ("000234726282C4VF"), letters and digits only. */
  ref?: string | null
}

/**
 * What Gemini returned, checked: a slip with a positive amount in USD or KHR,
 * a real calendar date (else none), short text fields. Null when it isn't a slip.
 */
/** "Trx. ID: 0002 3472 6282 C4VF" → "000234726282C4VF"; too short to identify a payment → null. */
export function slipRef(v: unknown): string | null {
  // A label read along with it ("Trx. ID:", "Reference #", "Hash.", "លេខយោង ៖") is not part of the ID.
  const raw = typeof v === "string" ? v.replace(/^\s*(?:trx\.?\s*id|transaction\s*id|ref(?:erence)?(?:\s*(?:no|number))?|hash|លេខយោង)\.?\s*[:#៖.]?\s*/i, "") : ""
  const ref = raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 40)
  return ref.length >= 6 ? ref : null
}

export function cleanSlip(raw: unknown): Slip | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  if (r.is_slip === false) return null
  // "-11.66" (a purchase printed with its minus sign) is 11.66: the direction says which way it went.
  const amount = Math.abs(typeof r.amount === "number" ? r.amount : Number(String(r.amount ?? "").replace(/[^0-9.]/g, "")))
  const cur = String(r.currency ?? "").toUpperCase()
  const currency = cur === "USD" || cur === "$" ? "USD" : cur === "KHR" || cur === "៛" || cur === "RIEL" ? "KHR" : null
  if (!currency || !Number.isFinite(amount) || amount <= 0 || amount >= 1e12) return null
  const timeAmount = typeof r.time === "string" ? /(\d{1,2}):(\d{2})/.exec(r.time) : null
  // "11:27 AM" read as $11 — a small amount equal to the slip's hour or minute is a misread, not a payment.
  // Not when the amount was read with its cents ("-5.00") or the slip names a phone / customer number
  // (a bill payment or top-up): a time is never read that way, and a $5 top-up at 5 PM is real.
  const withCents = typeof r.amount === "string" && /\.\d{2}(?!\d)/.test(r.amount)
  const billOrTopUp = typeof r.consumer === "string" && /\d{3}/.test(r.consumer)
  if (timeAmount && !withCents && !billOrTopUp && amount < 60 && (amount === Number(timeAmount[1]) || amount === Number(timeAmount[2]))) return null
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
    // No bank printed but a 3-3-3 account ("001 879 507"): ABA's format.
    bank: text(r.bank, 40) ?? (typeof r.account === "string" && /^\s*\d{3} \d{3} \d{3}\s*$/.test(r.account) ? "ABA" : null),
    date,
    time,
    party: text(r.party, 60),
    account: cleanAccount(r.account),
    accountName: text(r.account_name, 40),
    owner: text(r.owner, 60),
    consumer: text(r.consumer, 30),
    toAccount: cleanAccount(r.to_account),
    ref: slipRef(r.ref),
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
 * The account name as people name a wallet: the number in brackets, digits, masks and the bank's own words left out
 * — «DL USD (016 824 222)» on an ABA slip and the wallet «ABA DL USD» are both «dl usd» (founder, 19/10/2026).
 */
export function accountNameKey(name: string, bank: string | null): string {
  const bankWords = bank ? (BANK_WORDS.find(([re]) => re.test(bank))?.[1] ?? [bank.toLowerCase()]) : []
  const drop = new Set(["bank", "account", "acct", "ធនាគារ", "គណនី", ...bankWords.flatMap((w) => w.split(/\s+/))])
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[0-9*•.,:#_/\-]+/g, " ")
    .split(/\s+/)
    .filter((t) => t && !drop.has(t))
    .join(" ")
}

/** The slip's printed account name and a wallet's name are the same account — and say more than a currency. */
export function sameAccountName(printed: string | null | undefined, walletName: string, bank: string | null): boolean {
  if (!printed) return false
  const a = accountNameKey(printed, bank)
  return a.length >= 2 && a === accountNameKey(walletName, bank) && a.split(" ").some((t) => !/^(usd|khr|riel|dollar)$/.test(t))
}

/** The wallet for a slip, or the wallets to ask about. Never a guess between two. */
export type WalletPick = { wallet: BotWallet } | { choices: BotWallet[] }

/** At most this many "which wallet?" buttons. */
const MAX_CHOICES = 8

/** Is this wallet at the slip's bank (by the bank picked for it, or by its name)? */
function atBank(w: BotWallet, bank: string | null): boolean {
  if (!bank) return false
  const slipBank = providerForName(bank)
  if (slipBank && slipBank.key !== "other" && walletInstitution({ icon: w.icon ?? null, name: w.name }).key === slipBank.key) return true
  const words = BANK_WORDS.find(([re]) => re.test(bank))?.[1] ?? [bank.toLowerCase()]
  return words.some((x) => w.name.toLowerCase().includes(x))
}

/** The slip names a known bank, and this wallet is known to be at a different one. */
function atOtherBank(w: BotWallet, bank: string | null): boolean {
  const slipBank = bank ? providerForName(bank) : null
  if (!slipBank || slipBank.key === "other") return false
  const walletBank = walletInstitution({ icon: w.icon ?? null, name: w.name })
  return walletBank.key !== "other" && walletBank.key !== "cash" && walletBank.key !== slipBank.key
}

/**
 * The wallet a slip belongs to — only when it is certain:
 * 1. By account number: exactly one wallet in the slip's currency matches the
 *    slip's number (every visible digit agrees). Two that match ("***4222" on
 *    078…4222 and 016…4222) → the one at the slip's bank if just one is,
 *    else ask between them.
 * 2. Else (no number on the slip, or one that matches no wallet): the one
 *    wallet at the slip's bank in its currency, unless its recorded number
 *    differs from the slip's. None or several → ask (that bank's wallets in the
 *    currency, else the currency's, else all) — a USD wallet is never picked
 *    for a riel slip, nor another bank's wallet for this bank's slip.
 * Credit cards only when their number matches.
 */
export function resolveWallet(slip: Pick<Slip, "bank" | "currency"> & Partial<Pick<Slip, "account" | "accountName">>, wallets: BotWallet[]): WalletPick | null {
  if (!wallets.length) return null
  // The slip prints the account's own name ("DL USD (016 824 222)"): the wallet of that name («ABA DL USD» —
  // the bank's words and the number aside), in the slip's currency.
  const printed = slip.accountName?.trim()
  if (printed) {
    const named = wallets.filter((w) => !atOtherBank(w, slip.bank) && sameAccountName(printed, w.name, slip.bank))
    const one = named.filter((w) => w.currency === slip.currency)
    if (one.length === 1) return { wallet: one[0] }
    if (named.length === 1) return { wallet: named[0] }
  }
  const account = slip.account ?? null
  const decide = (pool: BotWallet[]): WalletPick | null =>
    pool.length === 1 ? { wallet: pool[0] } : pool.length > 1 ? { choices: pool.slice(0, MAX_CHOICES) } : null
  // A slip that names a known bank never offers another bank's wallet — not even when the digits match
  // (an ABA slip from 016 824 222 never lists the ACLEDA wallet saved with that number — founder, 19/10/2026).
  const notOtherBank = (w: BotWallet) => !atOtherBank(w, slip.bank)

  if (account) {
    const matched = wallets.filter((w) => accountScore(account, w.account_no) >= 4)
    const inCurrency = matched.filter((w) => w.currency === slip.currency)
    const pool = inCurrency.length ? inCurrency : matched
    // One number on two banks' wallets (e.g. a phone number): the slip's bank settles it.
    const atSlipBank = pool.filter((w) => atBank(w, slip.bank))
    // The number matches only wallets known to be at ANOTHER bank (an ABA slip, the number saved on an
    // ACLEDA wallet — founder, 13/10/2026): never booked there — ask, this bank's wallets first.
    const bankConflict = pool.length > 0 && atSlipBank.length === 0 && pool.every((w) => atOtherBank(w, slip.bank))
    if (bankConflict) {
      const sameBank = wallets.filter((w) => w.currency === slip.currency && atBank(w, slip.bank))
      if (sameBank.length) return { choices: sameBank.slice(0, MAX_CHOICES) }
      // No wallet at the slip's bank: ask among the currency's other wallets (cash, unknown) — never another bank's.
      const rest = wallets.filter((w) => w.kind !== "CREDIT_CARD" && w.currency === slip.currency && notOtherBank(w))
      return rest.length ? { choices: rest.slice(0, MAX_CHOICES) } : null
    }
    const poolOk = pool.filter(notOtherBank)
    const byNumber = decide(poolOk.length > 1 && atSlipBank.length === 1 ? atSlipBank : poolOk)
    if (byNumber) return byNumber
  }
  // Without a number match, book only the one obvious wallet: the only one at the slip's bank in its
  // currency (and not recorded with a different number) — or, for a slip naming no bank, the only
  // wallet in its currency. Anything else is a question, never a guess.
  const plain = wallets.filter((w) => w.kind !== "CREDIT_CARD")
  const sameCurrency = plain.filter((w) => w.currency === slip.currency)
  const atBankCurrency = sameCurrency.filter((w) => atBank(w, slip.bank))
  const differs = (w: BotWallet) => Boolean(account && w.account_no && accountScore(account, w.account_no) === 0)
  const obvious = slip.bank ? atBankCurrency.filter((w) => !differs(w)) : sameCurrency.filter((w) => !differs(w))
  if (obvious.length === 1) return { wallet: obvious[0] }
  const ask = [atBankCurrency, sameCurrency, plain, wallets].map((list) => list.filter(notOtherBank)).find((list) => list.length > 0) ?? []
  return ask.length ? { choices: ask.slice(0, MAX_CHOICES) } : null
}

/** A workspace's wallets, as the bot context gives them (the first is the bot's default — Personal). */
export type WorkspaceWallets = { id: string; name: string; wallets: BotWallet[] }
/** A wallet to offer, with its workspace; `elsewhere` = not the bot's default workspace. */
export type SlipCandidate = { wallet: BotWallet; workspaceId: string; workspaceName: string; elsewhere: boolean }

/**
 * Certain by the slip's own words: the wallet's name is the account name the slip prints («DL USD (016 824 222)»),
 * or its number is the slip's full printed number — and it is not at another bank.
 */
export function strongMatch(slip: Pick<Slip, "bank"> & Partial<Pick<Slip, "account" | "accountName">>, w: BotWallet): boolean {
  if (atOtherBank(w, slip.bank)) return false
  if (sameAccountName(slip.accountName, w.name, slip.bank)) return true
  // Digits only («016 824 222» as printed, or already cleaned); a masked number («016***4222») never counts here.
  const account = (slip.account ?? "").replace(/[^\d*]/g, "")
  return !account.includes("*") && account.length >= 8 && accountScore(account, w.account_no) >= 8
}

/**
 * The slip's wallet across the person's workspaces (founder, 19/10/2026): the default workspace decides as before;
 * a wallet in another of their workspaces that the slip names exactly (strongMatch — «DL USD (016 824 222)» in
 * DL MEAT SUPPLY) is offered too, first, labelled with its workspace — never booked there without a tap, and never
 * hidden because the bot's default is Personal. Another bank's wallet is never offered (resolveWallet).
 */
export function resolveSlipAcrossWorkspaces(
  slip: Pick<Slip, "bank" | "currency"> & Partial<Pick<Slip, "account" | "accountName">>,
  workspaces: WorkspaceWallets[],
): { wallet: SlipCandidate } | { choices: SlipCandidate[] } | null {
  const [home, ...others] = workspaces
  if (!home) return null
  const at = (ws: WorkspaceWallets, elsewhere: boolean) => (wallet: BotWallet): SlipCandidate => ({ wallet, workspaceId: ws.id, workspaceName: ws.name, elsewhere })
  // The wallet the slip names exactly — its account name or its full number — in any of the person's workspaces is
  // THE answer (founder, 19/10/2026: «DL USD (016 824 222)» is «ABA DL USD» in DL MEAT SUPPLY, never the personal
  // ABA wallet that only shares the last four digits). Its own workspace first when it is in several.
  const strong = [...home.wallets.filter((w) => strongMatch(slip, w)).map(at(home, false)), ...others.flatMap((ws) => ws.wallets.filter((w) => strongMatch(slip, w)).map(at(ws, true)))]
  const inCurrency = strong.filter((c) => c.wallet.currency === slip.currency)
  const named = inCurrency.length ? inCurrency : strong
  if (named.length === 1) return { wallet: named[0] }
  if (named.length > 1) return { choices: named.slice(0, MAX_CHOICES) }
  // Nothing named exactly: the default workspace decides, as before (a question when unsure).
  const pick = resolveWallet(slip, home.wallets)
  return pick ? ("wallet" in pick ? { wallet: at(home, false)(pick.wallet) } : { choices: pick.choices.map(at(home, false)) }) : null
}

/** "016824222" → "016***4222" (as the app shows it); short numbers as they are. */
export function maskedAccount(account: string | null | undefined): string | null {
  const d = (account ?? "").replace(/\D/g, "")
  if (!d) return null
  return d.length > 7 ? `${d.slice(0, 3)}***${d.slice(-4)}` : d
}

/** "ACLEDA KHR · 016***4222" — the account number unless the name already shows it. */
export function walletLabel(w: Pick<BotWallet, "name" | "account_no">): string {
  const masked = maskedAccount(w.account_no)
  return masked && !w.name.includes(masked) ? `${w.name} · ${masked}` : w.name
}

/** A one-tap button: the category (by preset, with fallbacks) and a note tag for the finer ones. */
export type SlipChoice = { label: MessageKey; presets: string[]; tag?: boolean; draw?: boolean }

/**
 * A slip paid from a BUSINESS account (founder, 26/10/2026 — Task #510: the $370 from DL MEAT SUPPLY's «ABA DL USD» got
 * the household buttons — food, coffee…): the business's own one-tap categories, and the owner's draw — money the owner
 * took for himself, kept out of the business P&L (owner_draw), mirrored into a Personal wallet he names (bot_owner_draw).
 */
export const SLIP_OUT_BUSINESS: SlipChoice[] = [
  { label: "bot.slipBiz.stock", presets: ["inventory"] },
  { label: "bot.slipBiz.delivery", presets: ["delivery", "transport"] },
  { label: "bot.slipBiz.payroll", presets: ["payroll"] },
  { label: "bot.slipBiz.stall", presets: ["operating", "rent", "utilities"] },
  { label: "bot.slipBiz.draw", presets: ["owner_draw"], draw: true },
  { label: "bot.slipBiz.other", presets: ["other_expense"] },
]

/** Business slips get SLIP_OUT_BUSINESS; Personal and Family the household SLIP_OUT. */
export const isBusinessWorkspace = (type: string | null | undefined) => type === "BUSINESS"

/** A meat business («DL MEAT SUPPLY», «… សាច់ …») buys «🥩 ស្តុកសាច់»; any other business «🛒 ស្តុកទំនិញ». */
export function businessChoiceLabel(choice: SlipChoice, workspaceName: string | null | undefined): MessageKey {
  return choice.label === "bot.slipBiz.stock" && /meat|សាច់/i.test(workspaceName ?? "") ? "bot.slipBiz.stockMeat" : choice.label
}

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
 * A meal named in the words ("បាយល្ងាច", "lunch") wins over the time.
 * Null when there is no time to go by.
 */
export function mealFor(time: string | null, party: string | null): Meal | null {
  if (party && CAFE.test(party)) return "snack"
  // A meal named in the words wins over the clock ("បាយល្ងាច" logged the next morning is still dinner).
  if (party && /បាយព្រឹក|អាហារពេលព្រឹក|breakfast/i.test(party)) return "breakfast"
  if (party && /បាយថ្ងៃ|ថ្ងៃត្រង់|អាហារថ្ងៃត្រង់|lunch/i.test(party)) return "lunch"
  if (party && /បាយល្ងាច|អាហារពេលល្ងាច|dinner/i.test(party)) return "dinner"
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
