/**
 * Statement metadata from the rows around the transaction table: which bank,
 * the account holder's name, the account number, currency, period and the
 * opening/closing balances. Runs on the device, like parse.ts, and is kept
 * free of app imports so it can be tested with plain Node.
 *
 * The labels are the common English/Khmer ones. Bank-specific layouts (ABA,
 * ACLEDA) are tuned from real sample exports.
 */

import { maskAccountNumber } from "@/lib/wallets/account-number"
import { parseStatementAmount, parseStatementDate, type DateOrder } from "./parse"

export type BankCode = "ABA" | "ACLEDA" | "GENERIC"

export type StatementMeta = {
  bank: BankCode
  /** As printed on the statement, e.g. "SOU CHENDA". */
  accountName: string | null
  /** Digits only. Shown masked (••1234) and never saved. */
  accountNumber: string | null
  currency: "USD" | "KHR" | null
  periodStart: string | null
  periodEnd: string | null
  openingBalance: number | null
  closingBalance: number | null
}

const LABELS = {
  accountName: /^(account\s*name|account\s*holder(\s*name)?|customer\s*name|name\s*of\s*account|ឈ្មោះគណនី|ឈ្មោះអតិថិជន)\b\s*[:：]?/i,
  accountNumber: /^(account\s*(no\.?|number|#)|a\/c\s*(no\.?)?|លេខគណនី)\s*[:：]?/i,
  currency: /^(currency|account\s*currency|រូបិយប័ណ្ណ)\s*[:：]?/i,
  period: /^(statement\s*period|for\s*period|period|statement\s*date|date\s*range|from\s*date|from(?=\s+[A-Z0-9])|កាលបរិច្ឆេទ|រយៈពេល)\s*[:：]?/i,
  opening: /^(opening\s*balance|beginning\s*balance|balance\s*brought\s*forward|balance\s*b\/f|previous\s*balance|សមតុល្យដើម(គ្រា)?)\s*[:：]?/i,
  // Not "available balance": with an overdraft it differs from the ledger balance.
  closing: /^(closing\s*balance|ending\s*balance|balance\s*carried\s*forward|balance\s*c\/f|សមតុល្យចុង(គ្រា)?)\s*[:：]?/i,
}

const clean = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim()

/** The value after a label: the rest of the same cell, or the next non-empty cell on the row. */
function valueFor(rows: string[][], label: RegExp): string | null {
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      const cell = clean(row[i])
      const m = cell.match(label)
      if (!m) continue
      const rest = clean(cell.slice(m[0].length)).replace(/^[:：\-–]\s*/, "")
      if (rest) return rest
      // Skip a lone ":" cell (ACLEDA puts it in its own column).
      const next = row
        .slice(i + 1)
        .map((c) => clean(c).replace(/^[:：]\s*/, ""))
        .find(Boolean)
      if (next) return next
    }
  }
  return null
}

/**
 * The issuing bank. Descriptions mention other banks ("ABA Bank KHQR" on an
 * ACLEDA statement), so the bank's own marks (SWIFT code, legal name, website)
 * decide first, anywhere in the file; loose mentions only when there are none.
 */
export function detectBank(rows: string[][], fileName = ""): BankCode {
  const all = rows.map((r) => r.join(" ")).join(" ")
  if (/ABAAKHPP/.test(all)) return "ABA"
  if (/ACLBKHPP/.test(all)) return "ACLEDA"
  if (/advanced\s+bank\s+of\s+asia|ababank\.com/i.test(all)) return "ABA"
  if (/acledabank\.com/i.test(all)) return "ACLEDA"
  const header = `${fileName} ${rows.slice(0, 40).map((r) => r.join(" ")).join(" ")}`
  if (/\bACLEDA\b|អេស៊ីលីដា/i.test(header)) return "ACLEDA"
  if (/\bABA\b/i.test(header)) return "ABA"
  return "GENERIC"
}

const DATE_TOKEN = /\d{1,4}[\/\-.]\d{1,2}[\/\-.]\d{1,4}|\d{1,2}[\s\-]+[A-Za-z]{3,9}[\s\-,]+\d{2,4}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}/g

/**
 * Reads the header block (rows before `headerRow`) and any summary rows after
 * the table. `dateOrder` is the order the table's dates use.
 */
export function extractMeta(rows: string[][], headerRow: number, dateOrder: DateOrder, fileName = ""): StatementMeta {
  const top = rows.slice(0, Math.max(0, headerRow))
  const bottom = rows.slice(-12)
  const all = [...top, ...bottom]

  const name = valueFor(top, LABELS.accountName)
  const numberText = valueFor(top, LABELS.accountNumber)
  const number = numberText?.replace(/[^\d]/g, "") || null

  const currencyText = valueFor(top, LABELS.currency) ?? top.map((r) => r.join(" ")).join(" ")
  const currency = /\bKHR\b|រៀល|riel/i.test(currencyText) && !/\bUSD\b/.test(currencyText) ? "KHR" : /\bUSD\b|US\s*dollar|ដុល្លារ/i.test(currencyText) ? "USD" : null

  let periodStart: string | null = null
  let periodEnd: string | null = null
  const periodText = valueFor(top, LABELS.period)
  if (periodText) {
    const dates = (periodText.match(DATE_TOKEN) ?? []).map((d) => parseStatementDate(d, dateOrder)).filter((d): d is string => Boolean(d))
    if (dates.length >= 2) [periodStart, periodEnd] = [dates[0], dates[dates.length - 1]].sort()
  }

  const amountOf = (label: RegExp) => {
    const raw = valueFor(all, label)
    return raw ? parseStatementAmount(raw.replace(/\b(USD|KHR)\b|\$|៛/gi, "")) : null
  }

  return {
    bank: detectBank(rows, fileName),
    // A name is letters; skip values that are really numbers or dates.
    accountName: name && /\p{L}{2,}/u.test(name) ? name.slice(0, 80) : null,
    accountNumber: number && number.length >= 6 ? number : null,
    currency,
    periodStart,
    periodEnd,
    openingBalance: amountOf(LABELS.opening),
    closingBalance: amountOf(LABELS.closing),
  }
}

/** "••4321" for display. */
/** Prefix + last 4 (078***4222): accounts that are phone numbers often share the last digits. */
export const maskAccount = (digits: string | null) => maskAccountNumber(digits)

/** Fills balances the table didn't give (no running-balance column) from the statement's summary. */
export function withMetaBalances<T extends { opening_balance: number | null; closing_balance: number | null }>(parsed: T, meta: StatementMeta | null): T {
  if (!meta) return parsed
  return {
    ...parsed,
    opening_balance: parsed.opening_balance ?? meta.openingBalance,
    closing_balance: parsed.closing_balance ?? meta.closingBalance,
  }
}
