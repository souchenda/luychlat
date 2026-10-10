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

/**
 * The member's name: the Khmer name as printed ("ស៊ូ ចិន្តា"), never with the Latin one appended (the
 * members table has no Latin-name field); the Latin name only when the card shows no Khmer one.
 */
export const cardName = (c: NssfCard) => c.nameKh ?? c.nameEn ?? ""

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

export type QrIdentity = { idNumber: string | null; nameKh: string | null; nameEn: string | null; dob: string | null }

const QR_KEYS = {
  id: /^(?:id|nssf_?id|card_?(?:no|number|id)|member_?(?:no|id)|no|number)$/i,
  nameKh: /^(?:name_?(?:kh|km)|khmer_?name|full_?name_?(?:kh|km))$/i,
  nameEn: /^(?:name_?en|latin_?name|english_?name|full_?name_?en)$/i,
  name: /^(?:name|full_?name)$/i,
  dob: /^(?:dob|birth_?date|date_?of_?birth)$/i,
}

/** "11609265297628" (+ an optional check digit) → "1160926-5297628(-7)", the card's printed form. */
const idFromDigits = (digits: string) => (digits.length === 14 || digits.length === 15 ? [digits.slice(0, 7), digits.slice(7, 14), digits.slice(14)].filter(Boolean).join("-") : null)

/**
 * The identity a card's own QR carries — read on the phone, before any AI. Whatever shape it has
 * (a verification URL with query parameters, JSON, or plain text), only what it states is taken:
 * named fields, else a 14–15 digit run as the ID. Nothing is guessed; null when it carries nothing.
 */
export function identityFromQr(qr: string | null): QrIdentity | null {
  if (!qr) return null
  const fields = new Map<string, string>()
  try {
    const json = JSON.parse(qr) as unknown
    if (json && typeof json === "object") for (const [k, v] of Object.entries(json)) if (typeof v === "string" || typeof v === "number") fields.set(k, String(v))
  } catch {
    try {
      const url = new URL(qr.trim())
      url.searchParams.forEach((v, k) => fields.set(k, v))
    } catch {
      // plain text
    }
  }
  const field = (re: RegExp) => [...fields].find(([k]) => re.test(k))?.[1]?.trim() || null
  const named = field(QR_KEYS.name)
  const nameKh = field(QR_KEYS.nameKh) ?? (named && KH.test(named) ? named : null)
  const nameEn = field(QR_KEYS.nameEn) ?? (named && !KH.test(named) ? named : null)
  const rawId = cleanNssfId(field(QR_KEYS.id))
  const idField = rawId && /^\d{14,15}$/.test(rawId) ? idFromDigits(rawId) : rawId
  const run = latin(qr).match(/(?<!\d)\d{14,15}(?!\d)/)?.[0] ?? null
  const dobField = field(QR_KEYS.dob)
  const identity: QrIdentity = {
    idNumber: idField ?? (run ? idFromDigits(run) : null),
    nameKh: nameKh && KH.test(nameKh) ? nameKh.normalize("NFC").slice(0, 80) : null,
    nameEn: nameEn && /^[A-Za-z][A-Za-z .'-]*$/.test(nameEn) ? nameEn.toUpperCase().slice(0, 80) : null,
    dob: dobField && /^\d{4}-\d{2}-\d{2}$/.test(latin(dobField)) ? latin(dobField) : null,
  }
  return identity.idNumber || identity.nameKh || identity.nameEn ? identity : null
}

const idDigits = (id: string | null) => (id ?? "").replace(/\D/g, "")

/**
 * The QR first, the AI second: every field the QR states replaces the AI's reading. An AI-read ID
 * whose digits agree with the QR's keeps its printed form (its last letter, e.g. "-ឈ"); when they
 * differ, the QR's ID is taken and `idCorrected` says so.
 */
export function mergeQrIdentity(card: NssfCard | null, qr: QrIdentity | null): { card: NssfCard | null; fromQr: boolean; idCorrected: boolean } {
  if (!qr) return { card, fromQr: false, idCorrected: false }
  const base: NssfCard = card ?? { nameKh: null, nameEn: null, idNumber: null, dob: null, gender: null }
  const agree = Boolean(qr.idNumber && base.idNumber && idDigits(base.idNumber).startsWith(idDigits(qr.idNumber).slice(0, 14)))
  const idNumber = qr.idNumber ? (agree ? base.idNumber : qr.idNumber) : base.idNumber
  return {
    card: { ...base, idNumber, nameKh: qr.nameKh ?? base.nameKh, nameEn: qr.nameEn ?? base.nameEn, dob: qr.dob ?? base.dob },
    fromQr: true,
    idCorrected: Boolean(qr.idNumber && base.idNumber && !agree),
  }
}
