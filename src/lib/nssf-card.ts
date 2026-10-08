/**
 * NSSF (ប.ស.ស.) card OCR: what Vision read from the front of a card, checked, and
 * the form's smart guesses. Pure (unit-tested in nssf-card.test.ts).
 */

export type NssfCard = {
  nameKh: string | null
  nameEn: string | null
  idNumber: string | null
  /** YYYY-MM-DD */
  dob: string | null
  gender: "MALE" | "FEMALE" | null
}

const KH = /[ក-៿]/
const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().replace(/\s+/g, " ").slice(0, max) : null)

/** Latin and Khmer digits → Latin. */
const latin = (s: string) => s.replace(/[០-៩]/g, (d) => String("០១២៣៤៥៦៧៨៩".indexOf(d)))

/** The ID as the form accepts it: digits, Latin and Khmer letters, spaces . / - */
export function cleanNssfId(v: unknown): string | null {
  const s = text(v, 60)
  if (!s) return null
  const clean = latin(s).replace(/[^A-Za-z0-9ក-៿ ./-]/g, "").trim().slice(0, 40)
  return /\d{4,}/.test(clean) ? clean : null
}

/** What the vision model returned, checked field by field (anything doubtful → null). */
export function cleanNssfCard(raw: unknown): NssfCard | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  if (r.is_card === false) return null
  const kh = text(r.name_kh, 60)
  const en = text(r.name_en, 60)
  const dobRaw = typeof r.dob === "string" ? latin(r.dob.trim()) : ""
  const dob = /^\d{4}-\d{2}-\d{2}$/.test(dobRaw) && !Number.isNaN(Date.parse(`${dobRaw}T00:00:00Z`)) && dobRaw > "1900-01-01" ? dobRaw : null
  const g = String(r.gender ?? "").toUpperCase()
  const card: NssfCard = {
    nameKh: kh && KH.test(kh) ? kh : null,
    nameEn: en && /^[A-Za-z][A-Za-z .'-]*$/.test(en) ? en.toUpperCase() : null,
    idNumber: cleanNssfId(r.id_number),
    dob,
    gender: g === "MALE" || g === "M" ? "MALE" : g === "FEMALE" || g === "F" ? "FEMALE" : null,
  }
  return card.nameKh || card.nameEn || card.idNumber ? card : null
}

/** "ស៊ូ ចិន្តា (SOU CHENDA)" — both names when the card shows both. */
export const cardName = (c: NssfCard) => (c.nameKh && c.nameEn ? `${c.nameKh} (${c.nameEn})` : (c.nameKh ?? c.nameEn ?? ""))

/** Whole years from a date of birth to `today` (YYYY-MM-DD). */
export function ageOn(dob: string, today: string): number {
  const [by, bm, bd] = dob.split("-").map(Number)
  const [ty, tm, td] = today.split("-").map(Number)
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0)
}

// Subscript ដ and ត (្ដ / ្ត) are written interchangeably in names ("ចិន្ដា" = "ចិន្តា").
const norm = (s: string) => s.normalize("NFC").toLowerCase().replace(/[\s.'-]+/g, "").replace(/្ដ/g, "្ត")

/**
 * The relationship to pre-select: the account holder's own card (its name matches
 * the profile name, Khmer or Latin) → self; under 18 → a dependent child; another
 * adult → spouse (the remaining choice). Null when there is nothing to go on.
 */
export function guessRelationship(card: NssfCard, profileName: string | null | undefined, today: string): "self" | "spouse" | "child" | null {
  const me = profileName ? norm(profileName) : ""
  if (me && [card.nameKh, card.nameEn].some((n) => n && (norm(n) === me || norm(n).includes(me) || me.includes(norm(n))))) return "self"
  if (card.dob) return ageOn(card.dob, today) < 18 ? "child" : "spouse"
  return null
}

/** Does a QR's text on the card confirm the ID (all of the ID's digits appear in it)? */
export function qrConfirmsId(qr: string | null, id: string | null): boolean {
  if (!qr || !id) return false
  const digits = id.replace(/\D/g, "")
  return digits.length >= 6 && qr.replace(/\D/g, "").includes(digits)
}
