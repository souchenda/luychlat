/**
 * KHQR (Bakong EMVCo) string builder.
 *
 * Mirrors the National Bank of Cambodia's official SDK (npm "bakong-khqr",
 * gitlab.nbc.gov.kh/khqr/sdk-javascript) tag for tag: same order, lengths
 * and CRC, so the strings are identical (see the test that compares the two).
 * We don't ship the SDK itself: it bundles an old axios for API calls we
 * make ourselves. Pure: no Node or browser APIs.
 */

export type KhqrCurrency = "USD" | "KHR"

export type KhqrInput = {
  /** Bakong account ID, e.g. "luysmart@aclb" (max 32). */
  accountId: string
  /** Shown in the bank app (max 25, ASCII recommended). */
  merchantName: string
  /** Max 15; defaults to Phnom Penh. */
  merchantCity?: string
  currency: KhqrCurrency
  /** Required for a dynamic KHQR (with an amount). USD: max 2 decimals; KHR: whole riel. */
  amount: number
  /** Unique per payment (max 25). */
  billNumber: string
  storeLabel?: string
  terminalLabel?: string
  /** Merchant KHQR (tag 30) instead of individual (tag 29). */
  merchant?: { merchantId: string; acquiringBank: string }
  /** Unix ms (13 digits). */
  createdAt: number
  expiresAt: number
}

export const KHQR_CURRENCY_CODE: Record<KhqrCurrency, string> = { USD: "840", KHR: "116" }

const MAX = { account: 32, name: 25, city: 15, bill: 25, label: 25, merchantId: 32, bank: 32, amount: 13 }

export class KhqrError extends Error {}

/** Tag + 2-digit length (in characters, like the SDK) + value. */
const tlv = (tag: string, value: string) => `${tag}${String(value.length).padStart(2, "0")}${value}`

function check(value: string | undefined, max: number, field: string, required = false) {
  if (value === undefined || value === "") {
    if (required) throw new KhqrError(`${field} is required`)
    return
  }
  if (value.length > max) throw new KhqrError(`${field} is longer than ${max}`)
}

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) over the UTF-8 bytes, 4 uppercase hex digits. */
export function crc16(text: string): string {
  let crc = 0xffff
  for (const byte of new TextEncoder().encode(text)) {
    crc ^= byte << 8
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
  }
  return crc.toString(16).toUpperCase().padStart(4, "0")
}

function formatAmount(amount: number, currency: KhqrCurrency): string {
  if (!(amount > 0) || !Number.isFinite(amount)) throw new KhqrError("amount must be positive")
  if (currency === "KHR") {
    if (!Number.isInteger(amount)) throw new KhqrError("KHR amount must be whole riel")
    return String(amount)
  }
  const [, decimals] = String(amount).split(".")
  if (decimals && decimals.length > 2) throw new KhqrError("USD amount has more than 2 decimals")
  return decimals ? amount.toFixed(2) : String(amount)
}

export function buildKhqr(input: KhqrInput): string {
  const city = input.merchantCity || "Phnom Penh"
  check(input.accountId, MAX.account, "accountId", true)
  check(input.merchantName, MAX.name, "merchantName", true)
  check(city, MAX.city, "merchantCity")
  check(input.billNumber, MAX.bill, "billNumber")
  check(input.storeLabel, MAX.label, "storeLabel")
  check(input.terminalLabel, MAX.label, "terminalLabel")
  if (input.merchant) {
    check(input.merchant.merchantId, MAX.merchantId, "merchantId", true)
    check(input.merchant.acquiringBank, MAX.bank, "acquiringBank", true)
  }
  if (String(input.createdAt).length !== 13 || String(input.expiresAt).length !== 13) throw new KhqrError("timestamps must be ms")
  if (input.expiresAt <= input.createdAt) throw new KhqrError("expiry must be after creation")
  const amount = formatAmount(input.amount, input.currency)
  if (amount.length > MAX.amount) throw new KhqrError("amount too long")

  const account = input.merchant
    ? tlv("30", tlv("00", input.accountId) + tlv("01", input.merchant.merchantId) + tlv("02", input.merchant.acquiringBank))
    : tlv("29", tlv("00", input.accountId))

  let additional = ""
  if (input.billNumber) additional += tlv("01", input.billNumber)
  if (input.storeLabel) additional += tlv("03", input.storeLabel)
  if (input.terminalLabel) additional += tlv("07", input.terminalLabel)

  const body =
    tlv("00", "01") + // payload format indicator
    tlv("01", "12") + // dynamic QR (has an amount)
    account +
    tlv("52", "5999") + // merchant category code
    tlv("53", KHQR_CURRENCY_CODE[input.currency]) +
    tlv("54", amount) +
    tlv("58", "KH") +
    tlv("59", input.merchantName) +
    tlv("60", city) +
    (additional ? tlv("62", additional) : "") +
    tlv("99", tlv("00", String(input.createdAt)) + tlv("01", String(input.expiresAt)))

  const withCrcTag = `${body}6304`
  return withCrcTag + crc16(withCrcTag)
}

/** Reads the top-level tags back (for display and tests). */
export function parseKhqr(qr: string): Record<string, string> {
  const out: Record<string, string> = {}
  let i = 0
  while (i + 4 <= qr.length) {
    const tag = qr.slice(i, i + 2)
    const len = Number(qr.slice(i + 2, i + 4))
    out[tag] = qr.slice(i + 4, i + 4 + len)
    i += 4 + len
  }
  return out
}

export function isValidCrc(qr: string): boolean {
  return qr.length > 8 && crc16(qr.slice(0, -4)) === qr.slice(-4)
}
