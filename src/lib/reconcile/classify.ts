/**
 * Sorts statement lines into a few groups the user can approve in one tap,
 * using Cambodian banking descriptions (KHQR, Bakong, ABA/ACLEDA wording).
 * Anything that doesn't clearly fit goes to "REVIEW". Pure: no app imports.
 *
 * Tuned on real ABA and ACLEDA statements:
 *   ABA     PAYMENT FROM <payer> … AT <you> …       (KHQR sale)
 *           FUNDS RECEIVED FROM <sender> (acct) …   (transfer in)
 *           FUNDS TRANSFERRED TO <payee> <acct> …   (transfer out)
 *           PURCHASE AT <merchant> ON … [BAKONG#]   (QR/card/Bakong payment)
 *   ACLEDA  Paid From <payer>(phone) … ACLEDA QR | Ref… | <you>   (sale)
 *           Paid To <payee>(TID…) … ACLEDA QR        (QR payment)
 *           Transferred To <payee>(phone) ACLEDA mobile
 *           Top up(Smart) pinless by ACLEDA mobile
 * The account holder's own name appears on every sale (as the receiver), so
 * only the counterparty is compared with the owner's names.
 */

import { FEE_PATTERN } from "./parse"

export type LineGroup = "REMEMBERED" | "SALES" | "TRANSFER_IN" | "OWNER" | "BILLS" | "EXPENSE" | "FEE" | "REVIEW"

/** Display order of the summary cards. */
export const GROUP_ORDER: LineGroup[] = ["REMEMBERED", "SALES", "TRANSFER_IN", "OWNER", "BILLS", "EXPENSE", "FEE", "REVIEW"]

const SALES_PATTERN = /\bKHQR\b|BAKONG|SCAN\s*PAY|\bPAID\s+FROM\b|\bPAYMENT\s+FROM\b|\bTID\b|\bMERCHANT\b|\bQR\s*PAY|ACLEDA\s+QR/i
const TRANSFER_IN_PATTERN = /\bFUNDS\s+RECEIVED\b|\bRECEIVED\s+FROM\b|\bTRANSFER(RED)?\s+FROM\b|\bDEPOSIT\b/i
const BILL_PATTERN =
  /\b(EDC|ELECTRICITE|ELECTRICITY|PPWSA|WATER\s*SUPPLY|EZECOM|METFONE|CELLCARD|SMART|SEATEL|OPENNET|SINET|TELECOM|INTERNET|BILL\s*PAY(MENT)?|TOP\s*-?\s*UP)\b|អគ្គិសនី|ទឹកស្អាត/i
const TELCO_PATTERN = /\b(EZECOM|METFONE|CELLCARD|SMART|SEATEL|OPENNET|SINET|TELECOM|INTERNET|TOP\s*-?\s*UP)\b/i
const EXPENSE_PATTERN =
  /\bTRANSFERRED\s+TO\b|\bFUNDS\s+TRANSFERRED\b|\bTRANSFER\s+TO\b|\bPURCHASE\b|\bPOS\b|\bPAYMENT\s+TO\b|\bPAID\s+TO\b|\bATM\b|\bWITHDRAW(AL)?\b/i

/**
 * Well-known Cambodian merchants → a spending category (preset key), checked
 * on money going out before the generic "transfer / purchase" rule. Personal
 * presets; a business workspace without the preset just leaves it to pick.
 * Grab is food (GrabFood is the common card charge) unless it says ride / car / bike.
 */
const MERCHANTS: { pattern: RegExp; preset: string }[] = [
  { pattern: /\bGRAB\s*(RIDE|CAR|BIKE|TAXI|TUKTUK|REMORK)\b|\bPASSAPP\b|\bPASS\s*APP\b|\bTADA\b|\bWEGO\b|\bPARKING\b/i, preset: "transport" },
  { pattern: /\b(CALTEX|PTT|TOTAL(ENERGIES)?|TELA|SOKIMEX|CHEVRON|SHELL|PETRONAS|GAS\s*STATION|FUEL|PETROL)\b/i, preset: "transport" },
  {
    pattern:
      /\b(BROWN\s*COFFEE|BROWN|CAFE\s*AMAZON|AMAZON|STARBUCKS|FOODPANDA|FOOD\s*PANDA|GRAB\s*FOOD|GRAB|E-?GETS|NHAM\s*24|TUBE\s*COFFEE|COFFEE|CAFE|KFC|BURGER\s*KING|PIZZA|MCDONALD'?S?|CHATIME|KOI\s*TH[EÉ]|TOUS\s*LES\s*JOURS|RESTAURANT|BAKERY|LUCKY\s*SUPERMARKET|7-?ELEVEN|SUPERMARKET)\b/i,
    preset: "food",
  },
  { pattern: /\b(AEON|CHIP\s*MONG|SHOPEE|LAZADA|LITTLE\s*FASHION|ZANDO|MALL)\b/i, preset: "shopping" },
  { pattern: /\b(PHARMACY|PHARMACIE|U-?CARE|HOSPITAL|CLINIC|ROYAL\s*PHNOM\s*PENH\s*HOSPITAL|SUNRISE\s*JAPAN)\b/i, preset: "health" },
]

/** The spending category of a known merchant in the line, or null. */
export function merchantPreset(description: string): string | null {
  return MERCHANTS.find((m) => m.pattern.test(description))?.preset ?? null
}

/** The other party: the name after "Paid from", "Transferred to", "Purchase at"…, up to the account/phone/date. */
const PARTY =
  /(?:FUNDS\s+RECEIVED\s+FROM|FUNDS\s+TRANSFERRED\s+TO|PAYMENT\s+FROM|PAYMENT\s+TO|PAID\s+FROM|PAID\s+TO|TRANSFERRED\s+(?:TO|FROM)|TRANSFER\s+(?:TO|FROM)|RECEIVED\s+FROM|PURCHASE\s+AT|SENT\s+TO)\s+(.+?)(?=\s*\(|\s+\d|\s*\*|\s+ON\s+[A-Za-z]{3}\b|\s+ORIGINAL\b|\s+BANK\b|\s*\||\s+KHR\b|\s+USD\b|$)/i

export function counterparty(description: string): string | null {
  const m = description.match(PARTY)
  return m ? m[1].trim() || null : null
}

/** Upper-case Latin/Khmer words, everything else is a separator. */
export function nameWords(text: string): string[] {
  return text
    .toUpperCase()
    .split(/[^\p{L}\p{M}]+/u)
    .filter((w) => w.length >= 2)
}

/**
 * Owner names to look for. Joint holders ("SOU CHENDA AND TIM SREYLEAK",
 * "A / B") count separately. Each name needs two words (family + given name)
 * so a single common word can't misfire; word order doesn't matter.
 */
export function ownerMatchers(names: (string | null | undefined)[]): string[][] {
  const out: string[][] = []
  for (const name of names) {
    for (const part of (name ?? "").split(/\s+(?:AND|&)\s+|\/|,|\+/i)) {
      const words = nameWords(part)
      if (words.length >= 2 && !out.some((o) => o.join(" ") === words.join(" "))) out.push(words)
    }
  }
  return out
}

/** True when the line's counterparty is one of the owners. */
export function mentionsOwner(description: string, owners: string[][]): boolean {
  if (!owners.length) return false
  const party = counterparty(description)
  if (!party) return false
  const words = new Set(nameWords(party))
  return owners.some((name) => name.every((w) => words.has(w)))
}

export type Classified = { group: LineGroup; /** Suggested preset category key, by direction and workspace type. */ preset: string | null }

export function classifyLine(
  line: { amount: number; description: string },
  ctx: { owners: string[][]; business: boolean; remembered?: boolean },
): Classified {
  const d = line.description
  const income = line.amount > 0
  if (ctx.remembered) return { group: "REMEMBERED", preset: null }
  if (mentionsOwner(d, ctx.owners)) return { group: "OWNER", preset: income ? "owner_contribution" : "owner_draw" }
  if (!income && FEE_PATTERN.test(d) && !EXPENSE_PATTERN.test(d)) return { group: "FEE", preset: "bank_fee" }
  if (income) {
    if (SALES_PATTERN.test(d)) return { group: "SALES", preset: ctx.business ? "sales" : "other_income" }
    if (TRANSFER_IN_PATTERN.test(d)) return { group: "TRANSFER_IN", preset: ctx.business ? "sales" : "other_income" }
    return { group: "REVIEW", preset: null }
  }
  if (BILL_PATTERN.test(d)) {
    const telco = TELCO_PATTERN.test(d)
    // A business: EDC / water are utilities, telecom (Smart, Cellcard, Metfone, Ezecom…) is an operating expense.
    return { group: "BILLS", preset: ctx.business ? (telco ? "operating" : "utilities") : telco ? "phone" : "housing" }
  }
  const merchant = merchantPreset(counterparty(d) ?? d)
  if (merchant) return { group: "EXPENSE", preset: ctx.business ? "other_expense" : merchant }
  if (EXPENSE_PATTERN.test(d)) return { group: "EXPENSE", preset: "other_expense" }
  return { group: "REVIEW", preset: null }
}
