/**
 * The LuyChlat card & document vault standard (NSSF cards live in nssf_members; every other card in
 * id_cards). The physical photo is the ground truth; what is read from it is only an index:
 *   1. the card's own QR / barcode, decoded on the phone first, is authoritative for what it states;
 *   2. Vision reads the rest — Khmer verbatim, an unclear character becomes "?" (is_uncertain);
 *   3. nothing is saved with a "?" left in it, and the user confirms against the photo (verified_by_user).
 * Pure (id-card.test.ts).
 */

export type CardKind = "NATIONAL_ID" | "DRIVER_LICENSE" | "VEHICLE_REG" | "INSURANCE" | "BANK_CARD"
export const CARD_KINDS: CardKind[] = ["NATIONAL_ID", "DRIVER_LICENSE", "VEHICLE_REG", "INSURANCE", "BANK_CARD"]

/** Kind-specific details (in id_cards.details). */
export type DetailKey = "plate" | "make" | "model" | "color" | "year" | "license_class" | "plan" | "last4"

export type KindSpec = {
  /** Which common fields the card has. */
  fields: { holder: boolean; number: boolean; dob: boolean; gender: boolean; issued: boolean; expiry: boolean; issuer: boolean }
  details: DetailKey[]
  /**
   * Bank cards: no photo is ever stored (the front shows the full card number, the back the CVV —
   * together enough to spend); the photo is read once on the phone and discarded, the number kept
   * as its last 4 digits only.
   */
  storesPhotos: boolean
  hasBack: boolean
  /** For the vision prompt. */
  describe: string
}

export const KIND_SPECS: Record<CardKind, KindSpec> = {
  NATIONAL_ID: {
    fields: { holder: true, number: true, dob: true, gender: true, issued: true, expiry: true, issuer: false },
    details: [],
    storesPhotos: true,
    hasBack: true,
    describe: "a Cambodian national ID card (អត្តសញ្ញាណប័ណ្ណសញ្ជាតិខ្មែរ)",
  },
  DRIVER_LICENSE: {
    fields: { holder: true, number: true, dob: true, gender: true, issued: true, expiry: true, issuer: false },
    details: ["license_class"],
    storesPhotos: true,
    hasBack: true,
    describe: "a Cambodian driving licence (ប័ណ្ណបើកបរ)",
  },
  VEHICLE_REG: {
    fields: { holder: true, number: true, dob: false, gender: false, issued: true, expiry: false, issuer: false },
    details: ["plate", "make", "model", "color", "year"],
    storesPhotos: true,
    hasBack: true,
    describe: "a Cambodian vehicle registration card (កាតគ្រីឡាន / ប័ណ្ណសម្គាល់យានយន្ត)",
  },
  INSURANCE: {
    fields: { holder: true, number: true, dob: true, gender: false, issued: false, expiry: true, issuer: true },
    details: ["plan"],
    storesPhotos: true,
    hasBack: true,
    describe: "an insurance card (កាតធានារ៉ាប់រង — health, life or vehicle insurance)",
  },
  BANK_CARD: {
    fields: { holder: true, number: false, dob: false, gender: false, issued: false, expiry: true, issuer: true },
    details: ["last4"],
    storesPhotos: false,
    hasBack: false,
    describe: "the FRONT of a bank card (debit or credit card)",
  },
}

export type IdCardRead = {
  holderKh: string | null
  holderEn: string | null
  number: string | null
  dob: string | null
  gender: "MALE" | "FEMALE" | null
  issued: string | null
  expiry: string | null
  issuer: string | null
  details: Partial<Record<DetailKey, string>>
  /** The model marked a character it couldn't read ("?"), or said it was unsure. */
  uncertain: boolean
}

const KH = /[ក-៿]/
const latinDigits = (s: string) => s.replace(/[០-៩]/g, (d) => String("០១២៣៤៥៦៧៨៩".indexOf(d)))
const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().replace(/\s+/g, " ").normalize("NFC").slice(0, max) : null)

/** A date as YYYY-MM-DD; "MM/YY" (a bank card's expiry) → that month's last day. */
export function cleanDate(v: unknown): string | null {
  const s = typeof v === "string" ? latinDigits(v.trim()) : ""
  if (/^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && s > "1900-01-01") return s
  const mmyy = s.match(/^(\d{2})\s*\/\s*(\d{2}|\d{4})$/)
  if (mmyy) {
    const month = Number(mmyy[1])
    const year = mmyy[2].length === 2 ? 2000 + Number(mmyy[2]) : Number(mmyy[2])
    if (month < 1 || month > 12) return null
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
    return `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`
  }
  return null
}

/** Any field still holding a "?" (an unread character) — saving waits until it is corrected. */
export const hasUnread = (...values: (string | null | undefined)[]) => values.some((v) => typeof v === "string" && v.includes("?"))

/** The vision model's JSON → the card's fields for its kind (fields the kind doesn't have are dropped). */
export function cleanIdCard(raw: unknown, kind: CardKind): IdCardRead | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  if (r.is_card === false) return null
  const spec = KIND_SPECS[kind]
  const kh = text(r.holder_kh, 80)
  const en = text(r.holder_en, 80)
  const g = String(r.gender ?? "").toUpperCase()
  const details: Partial<Record<DetailKey, string>> = {}
  const rawDetails = (r.details ?? {}) as Record<string, unknown>
  for (const key of spec.details) {
    const v = text(rawDetails[key], 60)
    if (!v) continue
    if (key === "last4") {
      // Only ever the last 4 digits of a card number.
      const digits = latinDigits(v).replace(/[^\d?]/g, "")
      if (digits.length >= 4) details.last4 = digits.slice(-4)
    } else details[key] = latinDigits(v)
  }
  const number = spec.fields.number ? text(r.number, 40) : null
  const card: IdCardRead = {
    holderKh: spec.fields.holder && kh && KH.test(kh) ? kh : null,
    holderEn: spec.fields.holder && en && /^[A-Za-z?][A-Za-z .'?-]*$/.test(en) ? en.toUpperCase() : null,
    number: number ? latinDigits(number).replace(/[^A-Za-z0-9ក-៿ ./?-]/g, "").trim() || null : null,
    dob: spec.fields.dob ? cleanDate(r.dob) : null,
    gender: spec.fields.gender ? (g === "MALE" || g === "M" ? "MALE" : g === "FEMALE" || g === "F" ? "FEMALE" : null) : null,
    issued: spec.fields.issued ? cleanDate(r.issued) : null,
    expiry: spec.fields.expiry ? cleanDate(r.expiry) : null,
    issuer: spec.fields.issuer ? text(r.issuer, 80) : null,
    details,
    uncertain: false,
  }
  card.uncertain = r.is_uncertain === true || hasUnread(card.holderKh, card.holderEn, card.number, card.issuer, ...Object.values(details))
  return card.holderKh || card.holderEn || card.number || card.issuer || Object.keys(details).length ? card : null
}

/** A government verification code (a *.gov.kh address) — trusted as the card's identity. */
export function isOfficialCode(text: string | null): boolean {
  if (!text) return false
  try {
    return /(^|\.)gov\.kh$/i.test(new URL(text.trim()).hostname)
  } catch {
    return false
  }
}

const DAYS_WARN = 30

/** Expiry state for the list: expired, or within 30 days. */
export function expiryState(expiry: string | null | undefined, today: string): "expired" | "soon" | null {
  if (!expiry) return null
  if (expiry < today) return "expired"
  const days = Math.round((Date.parse(`${expiry}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
  return days <= DAYS_WARN ? "soon" : null
}
