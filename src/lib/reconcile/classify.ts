/**
 * Sorts statement lines into a few groups the user can approve in one tap,
 * using Cambodian banking descriptions (KHQR, Bakong, ABA/ACLEDA wording).
 * Anything that doesn't clearly fit goes to "REVIEW". Pure: no app imports.
 *
 * The patterns follow the wording banks use in their exports; they are
 * deliberately conservative and tuned with real samples.
 */

import { FEE_PATTERN } from "./parse"

export type LineGroup = "REMEMBERED" | "SALES" | "OWNER" | "BILLS" | "EXPENSE" | "FEE" | "REVIEW"

/** Display order of the summary cards. */
export const GROUP_ORDER: LineGroup[] = ["REMEMBERED", "SALES", "OWNER", "BILLS", "EXPENSE", "FEE", "REVIEW"]

const SALES_PATTERN = /\bKHQR\b|BAKONG|SCAN\s*PAY|\bPAID\s+FROM\b|\bTID\b|\bMERCHANT\b|\bQR\s*PAY/i
const BILL_PATTERN =
  /\b(EDC|ELECTRICITE|ELECTRICITY|PPWSA|WATER\s*SUPPLY|EZECOM|METFONE|CELLCARD|SMART\s*AXIATA|SMART\s*TOP|OPENNET|SINET|TELECOM|INTERNET|BILL\s*PAY(MENT)?)\b|អគ្គិសនី|ទឹកស្អាត/i
const EXPENSE_PATTERN = /\bTRANSFERRED\s+TO\b|\bTRANSFER\s+TO\b|\bPURCHASE\s+AT\b|\bPURCHASE\b|\bPOS\b|\bPAYMENT\s+TO\b|\bPAID\s+TO\b|\bATM\b|\bWITHDRAW(AL)?\b/i
const TELCO_PATTERN = /\b(EZECOM|METFONE|CELLCARD|SMART|OPENNET|SINET|TELECOM|INTERNET)\b/i

/** Upper-case Latin/Khmer words, everything else is a separator. */
export function nameWords(text: string): string[] {
  return text
    .toUpperCase()
    .split(/[^\p{L}\p{M}]+/u)
    .filter((w) => w.length >= 2)
}

/**
 * Owner names to look for: each must have at least two words (family + given
 * name), so a single common word can't misfire. Order doesn't matter:
 * "SOU CHENDA" also matches "CHENDA SOU".
 */
export function ownerMatchers(names: (string | null | undefined)[]): string[][] {
  const out: string[][] = []
  for (const name of names) {
    const words = nameWords(name ?? "")
    if (words.length >= 2 && !out.some((o) => o.join(" ") === words.join(" "))) out.push(words)
  }
  return out
}

export function mentionsOwner(description: string, owners: string[][]): boolean {
  if (!owners.length) return false
  const words = new Set(nameWords(description))
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
  if (!income && FEE_PATTERN.test(d)) return { group: "FEE", preset: "bank_fee" }
  // Owner first: "Transferred to SOU CHENDA" is the owner moving money, not a supplier.
  if (mentionsOwner(d, ctx.owners)) return { group: "OWNER", preset: income ? "owner_contribution" : "owner_draw" }
  if (income && SALES_PATTERN.test(d)) return { group: "SALES", preset: ctx.business ? "sales" : "other_income" }
  if (!income && BILL_PATTERN.test(d)) {
    const telco = TELCO_PATTERN.test(d)
    return { group: "BILLS", preset: ctx.business ? "utilities" : telco ? "phone" : "housing" }
  }
  if (!income && EXPENSE_PATTERN.test(d)) return { group: "EXPENSE", preset: "other_expense" }
  return { group: "REVIEW", preset: null }
}
