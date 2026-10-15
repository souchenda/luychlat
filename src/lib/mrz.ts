// The Cambodian national ID card's machine-readable zone (ICAO 9303 TD1: 3 lines × 30) and its printed
// validity line — decoded here, in code, never by the vision model (founder, 15/10/2026: a scan read
// «០៨.១១.២០១៧ ដល់ថ្ងៃ ០៤.១១.២០២៧» as 2009 → 2019). The MRZ's check digits make it the trusted source
// for the date of birth, the card number and the Latin name; the printed dates win for validity.

const KHMER_DIGITS = "០១២៣៤៥៦៧៨៩"
const latin = (s: string) => s.replace(/[០-៩]/g, (d) => String(KHMER_DIGITS.indexOf(d)))

/** ICAO 9303 check digit: weights 7-3-1; digits as themselves, A–Z = 10–35, «<» = 0. */
export function checkDigit(s: string): number {
  let sum = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    const v = c >= "0" && c <= "9" ? Number(c) : c >= "A" && c <= "Z" ? c.charCodeAt(0) - 55 : 0
    sum += v * [7, 3, 1][i % 3]
  }
  return sum % 10
}

/** YYMMDD → YYYY-MM-DD; `future` (an expiry) reads 2000s, a birth date the most recent past century. */
function mrzDate(yymmdd: string, future: boolean, now = new Date()): string | null {
  if (!/^\d{6}$/.test(yymmdd)) return null
  const yy = Number(yymmdd.slice(0, 2))
  const mm = Number(yymmdd.slice(2, 4))
  const dd = Number(yymmdd.slice(4, 6))
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null
  const nowYy = now.getUTCFullYear() % 100
  const year = future ? 2000 + yy : yy > nowYy ? 1900 + yy : 2000 + yy
  const iso = `${year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`
  return Number.isNaN(Date.parse(`${iso}T00:00:00Z`)) ? null : iso
}

export type Mrz = {
  /** Only fields whose check digit passed. */
  dob: string | null
  expiry: string | null
  sex: "MALE" | "FEMALE" | null
  number: string | null
  nameEn: string | null
}

const norm = (line: string) => line.toUpperCase().replace(/[«‹]/g, "<").replace(/\s+/g, "").replace(/[^A-Z0-9<]/g, "")

/**
 * The TD1 zone from the lines the model copied (any order, spaces and stray characters tolerated).
 * Line 2 is found by its shape (YYMMDD c sex YYMMDD c NAT); line 1 starts «ID»/«I<»; line 3 holds
 * SURNAME<<GIVEN. A field is returned only when its check digit is right — otherwise null, never a guess.
 */
export function parseTd1(lines: readonly string[] | null | undefined, now = new Date()): Mrz | null {
  const ls = (lines ?? []).map(norm).filter(Boolean)
  const l2 = ls.find((l) => /^\d{7}[MF<]\d{7}[A-Z<]{3}/.test(l))
  if (!l2) return null
  const dobRaw = l2.slice(0, 6)
  const expRaw = l2.slice(8, 14)
  const dob = checkDigit(dobRaw) === Number(l2[6]) ? mrzDate(dobRaw, false, now) : null
  const expiry = checkDigit(expRaw) === Number(l2[14]) ? mrzDate(expRaw, true, now) : null
  const sex = l2[7] === "M" ? "MALE" : l2[7] === "F" ? "FEMALE" : null
  const l1 = ls.find((l) => /^I[A-Z<][A-Z<]{3}[A-Z0-9<]{10}/.test(l))
  let number: string | null = null
  if (l1) {
    const doc = l1.slice(5, 14)
    if (checkDigit(doc) === Number(l1[14])) number = doc.replace(/</g, "") || null
  }
  const l3 = ls.find((l) => l !== l1 && l !== l2 && /^[A-Z]+<<?[A-Z<]*$/.test(l))
  let nameEn: string | null = null
  if (l3) {
    const [surname, given = ""] = l3.split("<<")
    nameEn = [surname, given].map((p) => p.replace(/</g, " ").trim()).filter(Boolean).join(" ") || null
  }
  return { dob, expiry, sex, number, nameEn }
}

/** «សុពលភាព៖ ០៨.១១.២០១៧ ដល់ថ្ងៃ ០៤.១១.២០២៧» → issued / expiry (day first), from the printed text. */
export function parseValidity(text: string | null | undefined): { issued: string | null; expiry: string | null } {
  const dates = [...latin(text ?? "").matchAll(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/g)].map((m) => {
    const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])]
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
    const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`
    return Number.isNaN(Date.parse(`${iso}T00:00:00Z`)) ? null : iso
  })
  return { issued: dates[0] ?? null, expiry: dates[1] ?? null }
}

const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000)
const minusDay = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)

export type IdDates = { dob: string | null; issued: string | null; expiry: string | null; number: string | null; nameEn: string | null; uncertain: boolean }

/**
 * The national ID's dates and identity from every source, most trusted first:
 *   • date of birth, card number, Latin name — the MRZ (check digits) over the model's reading;
 *   • validity — the printed line, parsed in code; the MRZ expiry is one day after the printed «until»
 *     date on Cambodian cards (founder, 15/10/2026: 271105 → 04/11/2027). A printed expiry missing, or
 *     more than a day from the MRZ, becomes the MRZ date − 1 and is flagged for the person to check;
 *   • an issue date not ~10 years before the expiry (the card's term) is dropped and flagged.
 */
export function reconcileIdDates(o: {
  model: { dob: string | null; issued: string | null; expiry: string | null; number: string | null; nameEn: string | null }
  validityText?: string | null
  mrz?: Mrz | null
}): IdDates {
  const printed = parseValidity(o.validityText)
  const m = o.mrz ?? null
  let uncertain = false
  let issued = printed.issued ?? o.model.issued
  let expiry = printed.expiry ?? o.model.expiry
  if (m?.expiry && (!expiry || Math.abs(dayDiff(expiry, m.expiry)) > 1)) {
    expiry = minusDay(m.expiry)
    uncertain = true
  }
  if (issued && expiry) {
    const years = dayDiff(expiry, issued) / 365.25
    if (years < 9 || years > 10.5) {
      issued = null
      uncertain = true
    }
  }
  return {
    dob: m?.dob ?? o.model.dob,
    issued,
    expiry,
    number: m?.number ?? o.model.number,
    nameEn: m?.nameEn ?? o.model.nameEn,
    uncertain,
  }
}
