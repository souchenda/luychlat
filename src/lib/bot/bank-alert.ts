import type { Currency } from "@/lib/data/types"

import { toLatinDigits } from "./parse-entry"

/**
 * Bank notification texts forwarded to the bot (ACLEDA, KHQR / Bakong …):
 *   ACLEDA: You have received USD 50.00 from SOK SAN to A/C ***6222 on 05/10/2026 10:15. Ref: 123456789.
 *   ACLEDA: KHQR payment received USD 25.50 to A/C ***6222 from Customer via Bakong. Trace: 98765432.
 *   ACLEDA: Transferred USD 12.00 from A/C ***6222 to SUPPLIER on 05/10/2026. Ref: 55443322.
 * Read: amount + currency, money in / out, the account's last digits, who, the
 * reference and the time. Pure; the database picks the wallet and saves it.
 */
export type BankAlert = {
  amount: number
  currency: Currency
  direction: "IN" | "OUT"
  /** Last 3–4 digits of the account (matched against the wallet's name, e.g. "ACLEDA ••6222"). */
  suffix: string
  party: string | null
  ref: string | null
  kind: "KHQR" | "TRANSFER" | "ALERT"
  /** ISO time with Cambodia's offset, when the alert says. */
  postedAt: string | null
}

// Account: "A/C ***6222", "Acc No. xxxx6222", "account ••6222", "*6222".
const ACCOUNT = /(?:a\/c|acc(?:ount)?(?:\s*no\.?)?|គណនី)\s*(?:no\.?|number|:)?\s*[*x•.#-]*\s*\d*?(\d{4})\b|[*x•]{2,}\s*(\d{3,4})\b/i
// "USD 50.00", "50.00 USD", "$50", "KHR 40,000", "40,000 KHR", "40000៛"
const MONEY = /(USD|KHR|\$|៛|riels?|dollars?)\s*([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)\s*(USD|KHR|\$|៛|riels?|dollars?)/i
const IN = /\b(received|receive|credited|credit|cash\s*-?in|deposit(?:ed)?|incoming|top\s*-?up\s+from)\b|ទទួល|ប្រាក់ចូល/i
const OUT = /\b(transferred|transfer\s+to|paid|payment\s+to|debited|debit|withdraw(?:al|n)?|cash\s*-?out|purchase|spent)\b|ផ្ទេរចេញ|ប្រាក់ចេញ|បានបង់/i
const BANKISH = /\b(ACLEDA|ABA|Wing|Bakong|KHQR|Canadia|Sathapana|Prince|PPCBank|Chip\s*Mong|PRASAC|Amret|TrueMoney)\b|a\/c|account|គណនី/i
const REF = /\b(?:ref(?:erence)?|trace|txn|trx|transaction\s*(?:id|no\.?)|hash)\b\s*(?:no\.?|id|#)?\s*[:#]?\s*([A-Za-z0-9-]{4,40})/i
const DATE = /\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/

/** The other party's name ("from SOK SAN", "to SUPPLIER"), never the account itself. */
function partyOf(text: string, direction: "IN" | "OUT"): string | null {
  const word = direction === "IN" ? "from" : "to"
  const re = new RegExp(`\\b${word}\\s+(?!a\\/c\\b|acc(?:ount)?\\b|your\\b|[*x•]{2,})([^.,;\\n]+?)(?=\\s+(?:to|from|on|via|at|ref|trace)\\b|[.,;\\n]|$)`, "i")
  const name = text.match(re)?.[1]?.trim()
  return name && name.length <= 60 && !/^\d+$/.test(name) ? name : null
}

export function parseBankAlert(raw: string): BankAlert | null {
  const text = toLatinDigits(raw).replace(/\s+/g, " ").trim()
  if (text.length < 20 || text.length > 1200 || !BANKISH.test(text)) return null
  const account = text.match(ACCOUNT)
  const money = text.match(MONEY)
  const inWords = IN.test(text)
  const outWords = OUT.test(text)
  if (!account || !money || inWords === outWords) {
    // A KHQR / "payment received" alert names both "payment" and "received": received wins.
    if (!(account && money && inWords && /payment\s+received|received.*payment/i.test(text))) return null
  }
  const unit = (money[1] ?? money[4] ?? "").toLowerCase()
  const amount = Number((money[2] ?? money[3]).replace(/,/g, ""))
  if (!Number.isFinite(amount) || amount <= 0) return null
  const currency: Currency = unit === "$" || unit.startsWith("usd") || unit.startsWith("dollar") ? "USD" : "KHR"
  const direction: "IN" | "OUT" = inWords && (!outWords || /payment\s+received|received/i.test(text)) ? "IN" : "OUT"

  let postedAt: string | null = null
  const d = text.match(DATE)
  if (d) {
    const [day, month, year] = [Number(d[1]), Number(d[2]), Number(d[3])]
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const p = (n: number) => String(n).padStart(2, "0")
      postedAt = `${year}-${p(month)}-${p(day)}T${p(Number(d[4] ?? 12))}:${d[5] ?? "00"}:00+07:00`
    }
  }
  return {
    amount: currency === "KHR" ? Math.round(amount) : Math.round(amount * 100) / 100,
    currency,
    direction,
    suffix: account[1] ?? account[2],
    party: partyOf(text, direction),
    ref: text.match(REF)?.[1] ?? null,
    kind: /\bKHQR\b|bakong/i.test(text) ? "KHQR" : /transfer/i.test(text) ? "TRANSFER" : "ALERT",
    postedAt,
  }
}
