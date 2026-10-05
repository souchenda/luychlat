import type { Currency } from "@/lib/data/types"

export type WalletProvider = {
  key: string
  name: { km: string; en: string }
  /** Short mark shown in the avatar when there is no logo. */
  mark: string
  /** The bank's own logo (public/banks; sources and licences in public/banks/README.md). */
  logo?: string
  /** Recognises the institution in a wallet name or a statement ("ABA Savings", "ស្ថាបនា"). */
  alias?: RegExp
  color: string
  defaultCurrency: Currency
}

/**
 * Cambodian banks and e-wallets. Colours approximate each brand. Banks that
 * are usually written in English keep their English name in Khmer too.
 */
export const WALLET_PROVIDERS: WalletProvider[] = [
  { key: "cash", name: { km: "សាច់ប្រាក់សុទ្ធ", en: "Cash in Hand" }, mark: "", color: "#16a34a", defaultCurrency: "USD", alias: /^(cash|សាច់ប្រាក់|លុយសុទ្ធ|សាច់ប្រាក់សុទ្ធ)$/i },
  { key: "aba", name: { km: "ABA Bank", en: "ABA Bank" }, mark: "ABA", color: "#0b4f6c", defaultCurrency: "USD", logo: "/banks/aba.png", alias: /\bABA\b/i },
  { key: "acleda", name: { km: "អេស៊ីលីដា", en: "ACLEDA" }, mark: "AC", color: "#1d3c8f", defaultCurrency: "USD", logo: "/banks/acleda.png", alias: /ACLEDA|អេស៊ីលីដា/i },
  { key: "wing", name: { km: "វីង", en: "Wing" }, mark: "W", color: "#8cc63f", defaultCurrency: "USD", logo: "/banks/wing.png", alias: /\bWING\b|វីង/i },
  { key: "bakong", name: { km: "បាគង", en: "Bakong" }, mark: "BK", color: "#b91c1c", defaultCurrency: "KHR", logo: "/banks/bakong.svg", alias: /BAKONG|បាគង/i },
  { key: "truemoney", name: { km: "TrueMoney", en: "TrueMoney" }, mark: "TM", color: "#f26f21", defaultCurrency: "KHR", logo: "/banks/truemoney.webp", alias: /TRUE\s*MONEY/i },
  { key: "canadia", name: { km: "កាណាឌីយ៉ា", en: "Canadia Bank" }, mark: "CB", color: "#c8102e", defaultCurrency: "USD", logo: "/banks/canadia.png", alias: /CANADIA|កាណាឌីយ៉ា/i },
  { key: "prince", name: { km: "Prince Bank", en: "Prince Bank" }, mark: "PB", color: "#1e2a4a", defaultCurrency: "USD", alias: /\bPRINCE\b/i },
  { key: "sathapana", name: { km: "Sathapana Bank", en: "Sathapana Bank" }, mark: "SBK", color: "#0057a8", defaultCurrency: "USD", logo: "/banks/sathapana.png", alias: /SATHAPANA|ស្ថាបនា/i },
  { key: "hattha", name: { km: "Hattha Bank", en: "Hattha Bank" }, mark: "HB", color: "#00539b", defaultCurrency: "USD", alias: /HATTHA|ហត្ថា/i },
  { key: "ppcbank", name: { km: "PPCBank", en: "PPCBank" }, mark: "PPC", color: "#d71920", defaultCurrency: "USD", logo: "/banks/ppcbank.png", alias: /PPC\s*BANK|\bPPCB\b/i },
  { key: "chipmong", name: { km: "Chip Mong Bank", en: "Chip Mong Bank" }, mark: "CM", color: "#00857c", defaultCurrency: "USD", logo: "/banks/chipmong.png", alias: /CHIP\s*MONG/i },
  { key: "amk", name: { km: "AMK", en: "AMK" }, mark: "AMK", color: "#00843d", defaultCurrency: "KHR", alias: /\bAMK\b/i },
  { key: "prasac", name: { km: "KB PRASAC Bank", en: "KB PRASAC Bank" }, mark: "KB", color: "#ffc72c", defaultCurrency: "KHR", logo: "/banks/prasac.png", alias: /PRASAC|ប្រាសាក់/i },
  { key: "amret", name: { km: "អំរ៉ែត", en: "Amret" }, mark: "AM", color: "#00843d", defaultCurrency: "KHR", logo: "/banks/amret.png", alias: /AMRET|អំរ៉ែត/i },
  { key: "vattanac", name: { km: "Vattanac Bank", en: "Vattanac Bank" }, mark: "VB", color: "#8a1538", defaultCurrency: "USD", alias: /VATTANAC/i },
  { key: "ftb", name: { km: "FTB Bank", en: "FTB Bank" }, mark: "FTB", color: "#003d7c", defaultCurrency: "USD", alias: /\bFTB\b|FOREIGN\s+TRADE\s+BANK/i },
  { key: "maybank", name: { km: "Maybank", en: "Maybank" }, mark: "MB", color: "#ffc72c", defaultCurrency: "USD", alias: /MAYBANK/i },
  { key: "cimb", name: { km: "CIMB", en: "CIMB" }, mark: "CIMB", color: "#ec1c24", defaultCurrency: "USD", alias: /\bCIMB\b/i },
  { key: "jtrust", name: { km: "J Trust Royal", en: "J Trust Royal" }, mark: "JTR", color: "#0a4595", defaultCurrency: "USD", logo: "/banks/jtrust.svg", alias: /J\s*-?\s*TRUST/i },
  { key: "phillip", name: { km: "Phillip Bank", en: "Phillip Bank" }, mark: "PHB", color: "#c4161c", defaultCurrency: "USD", alias: /PHILLIP\s*BANK/i },
  { key: "lolc", name: { km: "LOLC", en: "LOLC" }, mark: "LOLC", color: "#0072bc", defaultCurrency: "KHR", logo: "/banks/lolc.png", alias: /\bLOLC\b/i },
  { key: "pipay", name: { km: "Pi Pay", en: "Pi Pay" }, mark: "Pi", color: "#d6006f", defaultCurrency: "USD", alias: /\bPI\s*PAY\b/i },
  { key: "emoney", name: { km: "eMoney", en: "eMoney" }, mark: "eM", color: "#f59e0b", defaultCurrency: "KHR", alias: /\bE-?MONEY\b/i },
  { key: "other", name: { km: "ផ្សេងៗ", en: "Other" }, mark: "", color: "#64748b", defaultCurrency: "USD" },
]

/** Shown first in the picker; the rest are one tap away under "More". */
export const POPULAR_PROVIDERS = ["cash", "aba", "acleda", "wing", "bakong", "truemoney", "canadia"]

const BY_KEY = new Map(WALLET_PROVIDERS.map((p) => [p.key, p]))

export function getProvider(key: string | null | undefined): WalletProvider {
  return BY_KEY.get(key ?? "") ?? BY_KEY.get("other")!
}

/** The bank / e-wallet a name mentions ("ABA Savings", "កាបូប ACLEDA", "ស្ថាបនា"), or null. */
export function providerForName(name: string | null | undefined): WalletProvider | null {
  if (!name?.trim()) return null
  return WALLET_PROVIDERS.find((p) => p.alias?.test(name)) ?? null
}

/** Providers whose Khmer or English name contains the query (case-insensitive). */
export function searchProviders(query: string): WalletProvider[] {
  const q = query.trim().toLowerCase()
  const list = WALLET_PROVIDERS.filter((p) => p.key !== "other")
  if (!q) return list
  return list.filter((p) => p.name.km.toLowerCase().includes(q) || p.name.en.toLowerCase().includes(q) || p.key.includes(q))
}

/** Avatar text for a wallet the user named themselves: up to two letters ("ធនាគារ XYZ" → "ធX"). */
export function nameMark(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean).slice(0, 2)
  const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" })
  return words.map((w) => seg.segment(w)[Symbol.iterator]().next().value?.segment ?? "").join("").toUpperCase()
}
