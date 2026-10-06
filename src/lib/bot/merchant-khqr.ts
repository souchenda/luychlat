import type { Currency } from "@/lib/data/types"

/**
 * Merchant KHQR payment notifications (money a shop received), as the banks'
 * notifier bots post them in a merchant's Telegram group:
 *
 *   ACLEDA: Received 1.00 USD from Sreyleak Tim,ABA Bank by KHQR,on 06-Oct-2026 08:20PM,
 *           at Sou Chenda , STAND:0000435649 (Hash. f74f2977).
 *   ABA PayWay: ៛1,900,000 paid by HENG MENGHORN (*559) on Oct 06, 07:47 PM via ABA PAY
 *           at SOU CHENDA. Trx. ID: 179129086749644, APV: 905663.
 *
 * Pure: amount, currency, payer, the bank's unique reference (for idempotency)
 * and the time (Cambodia, UTC+7). Unknown text → null.
 */
export type MerchantPayment = {
  bank: "ACLEDA" | "ABA"
  amount: number
  currency: Currency
  payer: string
  /** The payer's bank / channel as printed ("ABA Bank", "ABA PAY"), if any. */
  via: string | null
  /** The bank's unique id for this payment: ACLEDA hash, ABA Trx. ID. */
  ref: string
  /** ISO time with +07:00, when the message says. */
  postedAt: string | null
  /** The merchant name the payment was made to ("Sou Chenda"). */
  merchant: string | null
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
const num = (s: string) => Number(s.replace(/,/g, ""))
const pad = (n: number) => String(n).padStart(2, "0")

/** "08:20PM" → 20:20; null on nonsense. */
function hour24(h: string, m: string, ampm: string) {
  let hh = Number(h)
  const mm = Number(m)
  if (hh < 1 || hh > 12 || mm > 59) return null
  if (/pm/i.test(ampm) && hh !== 12) hh += 12
  if (/am/i.test(ampm) && hh === 12) hh = 0
  return `${pad(hh)}:${pad(mm)}`
}

function iso(year: number, monthName: string, day: number, time: string | null) {
  const month = MONTHS.indexOf(monthName.slice(0, 3).toLowerCase())
  if (month < 0 || day < 1 || day > 31 || !time) return null
  const s = `${year}-${pad(month + 1)}-${pad(day)}T${time}:00+07:00`
  return Number.isNaN(Date.parse(s)) ? null : s
}

const tidy = (s: string | undefined) => (s ? s.replace(/\s+/g, " ").trim().slice(0, 80) || null : null)

const ACLEDA =
  /Received\s+([\d,]+(?:\.\d{1,2})?)\s*(USD|KHR)\s+from\s+([^,]+?)\s*,\s*([^,]*?)\s+by\s+KHQR\s*,\s*on\s+(\d{1,2})-([A-Za-z]{3})-(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)\s*,\s*at\s+(.+?)\s*,\s*STAND\s*:\s*(\d+)\s*\(\s*Hash\.?\s*([0-9a-fA-F]{6,64})\s*\)/i

const ABA =
  /([៛$])\s*([\d,]+(?:\.\d{1,2})?)\s+paid\s+by\s+(.+?)\s*(?:\(\s*\*\s*\d+\s*\))?\s+on\s+([A-Za-z]{3})\s+(\d{1,2})\s*,\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s+via\s+(.+?)\s+at\s+(.+?)\s*\.\s*Trx\.?\s*ID\s*:\s*(\d{6,30})/i

/**
 * `now` (for tests) decides the year of an ABA message, which prints none:
 * this year, or last year when that date would be in the future.
 */
export function parseMerchantPayment(raw: string, now: Date = new Date()): MerchantPayment | null {
  const text = raw.replace(/\s+/g, " ").trim()

  const a = text.match(ACLEDA)
  if (a) {
    const amount = num(a[1])
    if (!(amount > 0)) return null
    return {
      bank: "ACLEDA",
      amount,
      currency: a[2].toUpperCase() as Currency,
      payer: tidy(a[3]) ?? "",
      via: tidy(a[4]),
      ref: a[13].toLowerCase(),
      postedAt: iso(Number(a[7]), a[6], Number(a[5]), hour24(a[8], a[9], a[10])),
      merchant: tidy(a[11]),
    }
  }

  const b = text.match(ABA)
  if (b) {
    const amount = num(b[2])
    if (!(amount > 0)) return null
    const time = hour24(b[6], b[7], b[8])
    const cambodiaNow = new Date(now.getTime() + 7 * 3_600_000)
    let year = cambodiaNow.getUTCFullYear()
    let postedAt = iso(year, b[4], Number(b[5]), time)
    // A date ahead of today (by more than a day) belongs to last year.
    if (postedAt && Date.parse(postedAt) > now.getTime() + 86_400_000) postedAt = iso(--year, b[4], Number(b[5]), time)
    return {
      bank: "ABA",
      amount,
      currency: b[1] === "$" ? "USD" : "KHR",
      payer: tidy(b[3]) ?? "",
      via: tidy(b[9]),
      ref: b[11],
      postedAt,
      merchant: tidy(b[10]),
    }
  }
  return null
}
