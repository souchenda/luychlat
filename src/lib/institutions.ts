/**
 * Who a debt, a bill or a vehicle document is with: an institution from the registry
 * (lib/institution-logos) — its official logo, else its badge in the category's colour — or a
 * person's coloured initial. Never a grey silhouette. Pure (institutions.test.ts).
 */
import { CATEGORY_BADGE, getInstitutionLogo, matchInstitution, type InstitutionCategory } from "@/lib/institution-logos"

export { getInstitutionLogo }

export type Party =
  | { kind: "logo"; key: string; logo: string; name: string }
  | { kind: "institution"; key?: string; mark: string; bg: string }
  | { kind: "person"; initial: string; hue: number }

const graphemes = new Intl.Segmenter("km", { granularity: "grapheme" })

/** A person's initial: the first letter (a whole Khmer cluster, e.g. «ប» from «បងហ៊ុយ»). */
export function initialOf(name: string): string {
  const first = graphemes.segment(name.trim()).containing(0)?.segment ?? "?"
  return first.toLocaleUpperCase()
}

/** A stable colour per name (the same person keeps the same colour). */
export function hueOf(name: string): number {
  let h = 0
  for (const ch of name.trim()) h = (h * 31 + ch.codePointAt(0)!) % 360
  return h
}

/**
 * `category` given (a bill's kind): an unknown vendor gets that category's badge. Without it
 * (a debt's party), an unknown name is a person.
 */
export function resolveParty(name: string, category?: InstitutionCategory): Party {
  const m = matchInstitution(name)
  if (m?.logoUrl) return { kind: "logo", key: m.key, logo: m.logoUrl, name: m.name }
  if (m) return { kind: "institution", key: m.key, mark: m.fallbackBadge.text, bg: m.fallbackBadge.bg }
  if (category) return { kind: "institution", mark: CATEGORY_BADGE[category].text, bg: CATEGORY_BADGE[category].bg }
  return { kind: "person", initial: initialOf(name), hue: hueOf(name) }
}
