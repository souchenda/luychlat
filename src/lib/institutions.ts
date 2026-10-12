/**
 * Who a debt or a bill is with: a bank / MFI with its official logo (lib/wallets/providers, files in
 * public/banks — the same as the wallets and the Chip Mong goal), another institution as a clean
 * monogram tile (no official logo file yet), or a person — never a grey silhouette. Pure
 * (institutions.test.ts).
 */
import { providerForName } from "@/lib/wallets/providers"

/** Institutions without a logo file: a monogram tile until their official logo is added. */
const OTHER_INSTITUTIONS: { key: string; alias: RegExp; mark: string }[] = [
  { key: "clc", alias: /labou?r\s*care|\bCLC\b/i, mark: "CLC" },
  { key: "edc", alias: /\bEDC\b|អគ្គិសនីកម្ពុជា|electricit[ée]\s*du\s*cambodge/i, mark: "EDC" },
]

export type Party =
  | { kind: "logo"; key: string; logo: string; name: string }
  | { kind: "institution"; key: string; mark: string }
  | { kind: "person"; initial: string; hue: number }

/** The official logo for a bank / MFI named in `name`, or null. */
export function getInstitutionLogo(name: string | null | undefined): string | null {
  return providerForName(name)?.logo ?? null
}

const graphemes = new Intl.Segmenter("km", { granularity: "grapheme" })

/** A person's initial: the first letter (a whole Khmer cluster, e.g. «ប» from «បងហ៊ុយ», skipping «បង» honorifics is not attempted). */
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

export function resolveParty(name: string): Party {
  const p = providerForName(name)
  if (p?.logo) return { kind: "logo", key: p.key, logo: p.logo, name: p.name.en }
  const other = OTHER_INSTITUTIONS.find((i) => i.alias.test(name))
  if (other) return { kind: "institution", key: other.key, mark: other.mark }
  return { kind: "person", initial: initialOf(name), hue: hueOf(name) }
}
