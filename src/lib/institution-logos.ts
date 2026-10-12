/**
 * The institutions of daily Cambodian life — banks and MFIs, water, electricity, waste, tax and
 * government, telcos, insurers and car makers — matched by their Khmer and English names, each
 * shown by its official logo when its file is in public/ (sources in public/banks/README.md and
 * public/logos/README.md), else by a crisp badge in its category's colour: never a grey silhouette
 * or a bare emoji. Pure (institution-logos.test.ts).
 */
import { providerForName } from "@/lib/wallets/providers"

export type InstitutionCategory = "BANK" | "WATER" | "ELECTRICITY" | "WASTE" | "GOVERNMENT" | "TELCO" | "INSURANCE" | "VEHICLE" | "RENT" | "OTHER"

/** Each category's badge: its colour and its Khmer letter (ទ water, អ power, ស trash…). */
export const CATEGORY_BADGE: Record<InstitutionCategory, { bg: string; text: string }> = {
  BANK: { bg: "#0F766E", text: "ធ" },
  WATER: { bg: "#0284C7", text: "ទ" },
  ELECTRICITY: { bg: "#D97706", text: "អ" },
  WASTE: { bg: "#16A34A", text: "ស" },
  GOVERNMENT: { bg: "#475569", text: "រ" },
  TELCO: { bg: "#7C3AED", text: "អ៊" },
  INSURANCE: { bg: "#BE123C", text: "ធ" },
  VEHICLE: { bg: "#334155", text: "ឡ" },
  RENT: { bg: "#B45309", text: "ផ" },
  OTHER: { bg: "#64748B", text: "វ" },
}

type Entry = { key: string; category: InstitutionCategory; name: string; mark: string; alias: RegExp; logo?: string }

/**
 * Institutions beyond the wallet providers (lib/wallets/providers holds the banks with their logos).
 * Order matters: the more specific name first (SRWSA before the generic «រដ្ឋាករទឹក»).
 * `logo` is set only once the official file is in public/logos.
 */
export const INSTITUTIONS: Entry[] = [
  // Banks & MFIs (accounts the providers' names miss)
  { key: "ppcbank", category: "BANK", name: "PPCBank", mark: "PPC", alias: /\b1-22\d-\d{8}-\d\b/, logo: "/banks/ppcbank.png" },
  { key: "clc", category: "BANK", name: "Cambodian Labor Care", mark: "CLC", alias: /labou?r\s*care|\bCLC\b/i },
  // Electricity
  { key: "edc", category: "ELECTRICITY", name: "EDC", mark: "EDC", alias: /\bEDC\b|អគ្គិសនីកម្ពុជា|electricit[ée]\s*du\s*cambodge/i, logo: "/logos/edc.png" },
  { key: "kour-srov", category: "ELECTRICITY", name: "Kour Srov Electricity", mark: "KS", alias: /អគ្គិសនី\s*[គក]ួរ\s*ស្រូវ|k[ou]+r\s*srov/i },
  // Water
  { key: "srwsa", category: "WATER", name: "SRWSA", mark: "SR", alias: /\bSRWSA\b|រដ្ឋាករទឹកសៀមរាប/i },
  { key: "ppwsa", category: "WATER", name: "PPWSA", mark: "PP", alias: /\bPPWSA\b|រដ្ឋាករទឹក/i },
  { key: "anco", category: "WATER", name: "Anco Water", mark: "AN", alias: /\bANCO\b|អានកូ/i },
  { key: "cww", category: "WATER", name: "CWW", mark: "CWW", alias: /\bCWW\b/i },
  // Waste
  { key: "cintri", category: "WASTE", name: "Cintri", mark: "CT", alias: /CINTRI|ស៊[ីិ]នទ្រី/i },
  { key: "800super", category: "WASTE", name: "800 Super", mark: "800", alias: /800\s*SUPER/i },
  { key: "mizuda", category: "WASTE", name: "Mizuda", mark: "MZ", alias: /MIZUDA|មីហ្ស៊ូដា/i },
  { key: "gaea", category: "WASTE", name: "GAEA", mark: "GA", alias: /\bGAEA\b/i },
  // Tax & government
  { key: "gdt", category: "GOVERNMENT", name: "GDT", mark: "GDT", alias: /\bGDT\b|ពន្ធដារ/i, logo: "/logos/gdt.png" },
  { key: "nssf", category: "GOVERNMENT", name: "NSSF", mark: "NSSF", alias: /\bNSSF\b|ប\.\s*ស\.\s*ស|បេឡាជាតិ/i },
  { key: "mpwt", category: "GOVERNMENT", name: "MPWT", mark: "MPWT", alias: /\bMPWT\b|សាធារណការ|ពន្ធផ្លូវ|ឆៀក/i },
  { key: "moc", category: "GOVERNMENT", name: "MoC", mark: "MoC", alias: /\bMoC\b|ក្រសួងពាណិជ្ជកម្ម/, logo: "/logos/moc.png" },
  // Telco & internet
  { key: "smart", category: "TELCO", name: "Smart", mark: "S", alias: /\bSMART\b(?!\s*luy)|ស្មាត/i, logo: "/logos/smart.png" },
  { key: "cellcard", category: "TELCO", name: "Cellcard", mark: "CC", alias: /CELLCARD|សែលកាត/i, logo: "/logos/cellcard.png" },
  { key: "metfone", category: "TELCO", name: "Metfone", mark: "MF", alias: /METFONE|មេតហ្វូន/i, logo: "/logos/metfone.png" },
  { key: "ezecom", category: "TELCO", name: "EZECOM", mark: "EZ", alias: /EZECOM/i, logo: "/logos/ezecom.png" },
  { key: "sinet", category: "TELCO", name: "SINET", mark: "SI", alias: /\bSINET\b/i },
  // Insurance
  { key: "forte", category: "INSURANCE", name: "Forte", mark: "F", alias: /\bFORTE\b|ហ្វតេ/i },
  { key: "prudential", category: "INSURANCE", name: "Prudential", mark: "PRU", alias: /PRUDENTIAL|ព្រូដិនសលល៍/i, logo: "/logos/prudential.png" },
  { key: "aia", category: "INSURANCE", name: "AIA", mark: "AIA", alias: /\bAIA\b/i, logo: "/logos/aia.png" },
  { key: "manulife", category: "INSURANCE", name: "Manulife", mark: "M", alias: /MANULIFE/i },
  // Car makers
  { key: "mg", category: "VEHICLE", name: "MG", mark: "MG", alias: /\bMG\b|morris\s*garages/i, logo: "/logos/mg.png" },
  { key: "toyota", category: "VEHICLE", name: "Toyota", mark: "T", alias: /TOYOTA|តូយ៉ូតា|\bPRIUS\b|\bCAMRY\b|\bHILUX\b|\bFORTUNER\b/i, logo: "/logos/toyota.png" },
  { key: "lexus", category: "VEHICLE", name: "Lexus", mark: "L", alias: /LEXUS|ឡិចស៊ីស/i, logo: "/logos/lexus.png" },
  { key: "ford", category: "VEHICLE", name: "Ford", mark: "F", alias: /\bFORD\b|\bRANGER\b|\bEVEREST\b/i, logo: "/logos/ford.png" },
  { key: "hyundai", category: "VEHICLE", name: "Hyundai", mark: "H", alias: /HYUNDAI|ហ៊ីយ៉ាន់ដាយ/i, logo: "/logos/hyundai.png" },
  { key: "kia", category: "VEHICLE", name: "Kia", mark: "KIA", alias: /\bKIA\b/i },
  { key: "mazda", category: "VEHICLE", name: "Mazda", mark: "MZ", alias: /MAZDA/i, logo: "/logos/mazda.png" },
  { key: "honda", category: "VEHICLE", name: "Honda", mark: "H", alias: /HONDA|ហុងដា/i },
  { key: "byd", category: "VEHICLE", name: "BYD", mark: "BYD", alias: /\bBYD\b/i },
  { key: "tesla", category: "VEHICLE", name: "Tesla", mark: "T", alias: /TESLA/i },
]

export type InstitutionLogo = {
  /** The institution matched, if any. */
  key?: string
  name?: string
  category?: InstitutionCategory
  logoUrl?: string
  /** What to show without a logo file: the institution's mark (or the category's letter) on the category's colour. */
  fallbackBadge: { bg: string; text: string }
}

/** The institution named in `name` (bank, utility, agency, brand…) with its logo or badge; null when none matches. */
export function matchInstitution(name: string | null | undefined): Required<Pick<InstitutionLogo, "key" | "name" | "category">> & InstitutionLogo | null {
  if (!name?.trim()) return null
  const p = providerForName(name)
  if (p && p.key !== "other" && p.key !== "cash")
    return { key: p.key, name: p.name.en, category: "BANK", logoUrl: p.logo, fallbackBadge: { bg: p.color, text: p.mark || CATEGORY_BADGE.BANK.text } }
  const e = INSTITUTIONS.find((i) => i.alias.test(name))
  if (!e) return null
  return { key: e.key, name: e.name, category: e.category, logoUrl: e.logo, fallbackBadge: { bg: CATEGORY_BADGE[e.category].bg, text: e.mark } }
}

/**
 * The logo for `name`, or — for a vendor not in the registry (a borey's water, a local licensee) —
 * the badge of `category` (blue «ទ» water, gold «អ» power, green «ស» trash…).
 */
export function getInstitutionLogo(name: string | null | undefined, category?: InstitutionCategory): InstitutionLogo {
  return matchInstitution(name) ?? { category, fallbackBadge: CATEGORY_BADGE[category ?? "OTHER"] }
}

/** A bill's kind → its institution category. */
export function billCategory(kind: string): InstitutionCategory {
  switch (kind) {
    case "ELECTRICITY":
    case "WATER":
    case "WASTE":
    case "RENT":
      return kind
    case "INTERNET":
      return "TELCO"
    case "LOAN":
    case "DEPOSIT":
      return "BANK"
    case "NSSF":
      return "GOVERNMENT"
    default:
      return "OTHER"
  }
}
