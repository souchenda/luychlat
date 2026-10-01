import type { Currency } from "@/lib/data/types"

export type WalletProvider = {
  key: string
  name: { km: string; en: string }
  /** Short mark shown in the avatar (no trademarked logos are bundled). */
  mark: string
  color: string
  defaultCurrency: Currency
}

/** Common Cambodian banks and e-wallets. Colours approximate each brand. */
export const WALLET_PROVIDERS: WalletProvider[] = [
  { key: "cash", name: { km: "សាច់ប្រាក់សុទ្ធ", en: "Cash in Hand" }, mark: "💵", color: "#16a34a", defaultCurrency: "USD" },
  { key: "aba", name: { km: "ABA Bank", en: "ABA Bank" }, mark: "ABA", color: "#0b4f6c", defaultCurrency: "USD" },
  { key: "acleda", name: { km: "អេស៊ីលីដា", en: "ACLEDA" }, mark: "AC", color: "#1d3c8f", defaultCurrency: "USD" },
  { key: "wing", name: { km: "វីង", en: "Wing" }, mark: "W", color: "#8cc63f", defaultCurrency: "USD" },
  { key: "canadia", name: { km: "កាណាឌីយ៉ា", en: "Canadia Bank" }, mark: "CB", color: "#c8102e", defaultCurrency: "USD" },
  { key: "truemoney", name: { km: "TrueMoney", en: "TrueMoney" }, mark: "TM", color: "#f26f21", defaultCurrency: "KHR" },
  { key: "other", name: { km: "ផ្សេងៗ", en: "Other" }, mark: "", color: "#64748b", defaultCurrency: "USD" },
]

const BY_KEY = new Map(WALLET_PROVIDERS.map((p) => [p.key, p]))

export function getProvider(key: string | null | undefined): WalletProvider {
  return BY_KEY.get(key ?? "") ?? BY_KEY.get("other")!
}
