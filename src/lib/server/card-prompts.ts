// Server only: the vision prompts for card photos (NSSF in /api/nssf/ocr, the rest in /api/cards/ocr).
// One anti-hallucination rule for every Khmer name and number on every card.
import { KIND_SPECS, type CardKind, type DetailKey } from "@/lib/id-card"

/** Khmer is copied, never reconstructed; an unclear character is "?" with is_uncertain: true. */
export const KHMER_VERBATIM = [
  "KHMER TEXT IS TRANSCRIBED VERBATIM, character by character, from the Khmer line itself (e.g. after \"គោត្តនាម និងនាម :\"): every consonant, subscript consonant (្ + consonant, e.g. ន្ត in ចិន្តា), vowel and sign (៉ ៊ ់ ិ ា …) exactly as printed.",
  "NEVER guess, transliterate or rebuild a Khmer name from the Latin name on the card — Khmer spellings are not phonetic (CHENDA is printed ចិន្តា, never ឈិនដា).",
  "If ANY character (Khmer, Latin or digit) is blurred, covered or ambiguous, write \"?\" in its place — never a guess — and answer \"is_uncertain\": true. Otherwise \"is_uncertain\": false.",
].join("\n")

/** For the auto-crop: where the physical card is in the photo. */
export const CORNERS = [
  "box_2d: the bounding box of the physical card itself (its outer edges, not the photo, not the table) as [ymin, xmin, ymax, xmax] on a 0–1000 scale of the image height and width.",
  "corners: the card's 4 outer corners — top-left, top-right, bottom-right, bottom-left as they appear in the image — each as [y, x] on the same 0–1000 scale; null if a corner is hidden or unclear (box_2d is still given).",
].join("\n")

const DETAIL_HELP: Record<DetailKey, string> = {
  plate: "plate: the registration plate as printed (e.g. \"ភ្នំពេញ 2AB-1234\")",
  make: "make: the vehicle make (e.g. \"Toyota\")",
  model: "model: the model (e.g. \"Prius\")",
  color: "color: the colour as printed",
  year: "year: the year of manufacture",
  license_class: "license_class: the licence categories (e.g. \"A1, B\")",
  plan: "plan: the insurance plan / product name",
  last4: "last4: ONLY the last 4 digits of the card number — never the full number",
}

/** The front of a card of this kind: its fields (only those it has), and where it is for the crop. */
export function cardPrompt(kind: CardKind): string {
  const spec = KIND_SPECS[kind]
  const f = spec.fields
  const shape = [
    '"is_card": boolean',
    ...(f.holder ? ['"holder_kh": string | null', '"holder_en": string | null'] : []),
    ...(f.number ? ['"number": string | null'] : []),
    ...(f.dob ? ['"dob": "YYYY-MM-DD" | null'] : []),
    ...(f.gender ? ['"gender": "MALE" | "FEMALE" | null'] : []),
    ...(f.issued ? ['"issued": "YYYY-MM-DD" | null'] : []),
    ...(f.expiry ? [`"expiry": ${kind === "BANK_CARD" ? '"MM/YY"' : '"YYYY-MM-DD"'} | null`] : []),
    ...(f.issuer ? ['"issuer": string | null'] : []),
    ...(spec.details.length ? [`"details": { ${spec.details.map((d) => `"${d}": string | null`).join(", ")} }`] : []),
    '"is_uncertain": boolean',
    '"box_2d": [ymin, xmin, ymax, xmax] | null',
    '"corners": [[y, x], [y, x], [y, x], [y, x]] | null',
  ]
  return [
    `This image should be ${spec.describe}, possibly photographed on a table.`,
    `Answer JSON only: { ${shape.join(", ")} }`,
    ...(f.holder ? ["holder_kh: the holder's full name in Khmer script; holder_en: the name in Latin letters as printed, on its own."] : []),
    ...(f.number ? ["number: the card / document / policy number as printed, keeping dashes and letters."] : []),
    ...(f.issuer ? [kind === "BANK_CARD" ? "issuer: the bank's name." : "issuer: the insurer's name."] : []),
    "Dates: Khmer digits ០-៩ → 0-9; dd/mm/yyyy is day first. gender: ប្រុស = MALE, ស្រី = FEMALE.",
    ...spec.details.map((d) => DETAIL_HELP[d]),
    KHMER_VERBATIM,
    CORNERS,
    'Use null for a field that is not on the card. If it is not such a card, answer {"is_card": false}.',
  ].join("\n")
}
