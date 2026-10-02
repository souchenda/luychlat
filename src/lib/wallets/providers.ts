import type { Currency } from "@/lib/data/types"

export type WalletProvider = {
  key: string
  name: { km: string; en: string }
  /** Short mark shown in the avatar (no trademarked logos are bundled). */
  mark: string
  color: string
  defaultCurrency: Currency
}

/**
 * Cambodian banks and e-wallets. Colours approximate each brand. Banks that
 * are usually written in English keep their English name in Khmer too.
 */
export const WALLET_PROVIDERS: WalletProvider[] = [
  { key: "cash", name: { km: "សាច់ប្រាក់សុទ្ធ", en: "Cash in Hand" }, mark: "", color: "#16a34a", defaultCurrency: "USD" },
  { key: "aba", name: { km: "ABA Bank", en: "ABA Bank" }, mark: "ABA", color: "#0b4f6c", defaultCurrency: "USD" },
  { key: "acleda", name: { km: "អេស៊ីលីដា", en: "ACLEDA" }, mark: "AC", color: "#1d3c8f", defaultCurrency: "USD" },
  { key: "wing", name: { km: "វីង", en: "Wing" }, mark: "W", color: "#8cc63f", defaultCurrency: "USD" },
  { key: "bakong", name: { km: "បាគង", en: "Bakong" }, mark: "BK", color: "#b91c1c", defaultCurrency: "KHR" },
  { key: "truemoney", name: { km: "TrueMoney", en: "TrueMoney" }, mark: "TM", color: "#f26f21", defaultCurrency: "KHR" },
  { key: "canadia", name: { km: "កាណាឌីយ៉ា", en: "Canadia Bank" }, mark: "CB", color: "#c8102e", defaultCurrency: "USD" },
  { key: "prince", name: { km: "Prince Bank", en: "Prince Bank" }, mark: "PB", color: "#1e2a4a", defaultCurrency: "USD" },
  { key: "sathapana", name: { km: "Sathapana Bank", en: "Sathapana Bank" }, mark: "SBK", color: "#0057a8", defaultCurrency: "USD" },
  { key: "hattha", name: { km: "Hattha Bank", en: "Hattha Bank" }, mark: "HB", color: "#00539b", defaultCurrency: "USD" },
  { key: "ppcbank", name: { km: "PPCBank", en: "PPCBank" }, mark: "PPC", color: "#d71920", defaultCurrency: "USD" },
  { key: "chipmong", name: { km: "Chip Mong Bank", en: "Chip Mong Bank" }, mark: "CM", color: "#00857c", defaultCurrency: "USD" },
  { key: "amk", name: { km: "AMK", en: "AMK" }, mark: "AMK", color: "#00843d", defaultCurrency: "KHR" },
  { key: "vattanac", name: { km: "Vattanac Bank", en: "Vattanac Bank" }, mark: "VB", color: "#8a1538", defaultCurrency: "USD" },
  { key: "ftb", name: { km: "FTB Bank", en: "FTB Bank" }, mark: "FTB", color: "#003d7c", defaultCurrency: "USD" },
  { key: "maybank", name: { km: "Maybank", en: "Maybank" }, mark: "MB", color: "#ffc72c", defaultCurrency: "USD" },
  { key: "cimb", name: { km: "CIMB", en: "CIMB" }, mark: "CIMB", color: "#ec1c24", defaultCurrency: "USD" },
  { key: "jtrust", name: { km: "J Trust Royal", en: "J Trust Royal" }, mark: "JTR", color: "#0a4595", defaultCurrency: "USD" },
  { key: "phillip", name: { km: "Phillip Bank", en: "Phillip Bank" }, mark: "PHB", color: "#c4161c", defaultCurrency: "USD" },
  { key: "lolc", name: { km: "LOLC", en: "LOLC" }, mark: "LOLC", color: "#0072bc", defaultCurrency: "KHR" },
  { key: "pipay", name: { km: "Pi Pay", en: "Pi Pay" }, mark: "Pi", color: "#d6006f", defaultCurrency: "USD" },
  { key: "emoney", name: { km: "eMoney", en: "eMoney" }, mark: "eM", color: "#f59e0b", defaultCurrency: "KHR" },
  { key: "other", name: { km: "ផ្សេងៗ", en: "Other" }, mark: "", color: "#64748b", defaultCurrency: "USD" },
]

/** Shown first in the picker; the rest are one tap away under "More". */
export const POPULAR_PROVIDERS = ["cash", "aba", "acleda", "wing", "bakong", "truemoney", "canadia"]

const BY_KEY = new Map(WALLET_PROVIDERS.map((p) => [p.key, p]))

export function getProvider(key: string | null | undefined): WalletProvider {
  return BY_KEY.get(key ?? "") ?? BY_KEY.get("other")!
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
