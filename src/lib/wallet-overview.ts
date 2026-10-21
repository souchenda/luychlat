/**
 * The wallets overview (founder, 21/10/2026 — the ACLEDA Mobile hierarchy, in the app's emerald / navy / gold): what kind
 * each wallet is (its accent bar), how many the hero's ring counts and in what mix, the All · Bank · Cash tabs and which
 * wallet is the primary one (ចម្បង). Pure — the cards are in components/wallets.
 */
import type { Wallet } from "@/lib/data/types"
import { isCard } from "@/lib/credit-card"
import { isGoal } from "@/lib/goals"
import { personalWallets } from "@/lib/pool-ledger"
import { walletInstitution } from "@/lib/wallets/providers"

export type WalletKindTag = "cash" | "bank" | "card" | "savings"

/** Savings goals are savings; cash in hand is cash; a credit card is a card; every bank and e-wallet is a bank. */
export function walletKind(w: Pick<Wallet, "icon" | "name" | "goal_target" | "kind">): WalletKindTag {
  if (isGoal(w)) return "savings"
  if (isCard(w)) return "card"
  return walletInstitution(w).key === "cash" ? "cash" : "bank"
}

/**
 * The accent of each kind — the bar on a wallet card, and its arc on the hero's ring (a lighter step of the same hue, to
 * read on the dark emerald card). One order for both.
 */
export const KIND_ORDER: WalletKindTag[] = ["cash", "bank", "savings", "card"]
export const KIND_ACCENT: Record<WalletKindTag, { bar: string; ring: string }> = {
  cash: { bar: "bg-emerald-500", ring: "#6ee7b7" },
  bank: { bar: "bg-sky-600", ring: "#7dd3fc" },
  savings: { bar: "bg-amber-400", ring: "#fcd34d" },
  card: { bar: "bg-violet-500", ring: "#c4b5fd" },
}

export type WalletMix = { total: number } & Record<WalletKindTag, number>

/**
 * What the hero's total counts, by kind: the active wallets and savings goals of this workspace that are the person's own
 * money (a shared pool's wallet is the group's — the same set as computeTotals in net-worth-card.tsx).
 */
export function walletMix(wallets: Wallet[]): WalletMix {
  const mix: WalletMix = { total: 0, cash: 0, bank: 0, card: 0, savings: 0 }
  for (const w of personalWallets(wallets)) {
    if (w.archived_at) continue
    mix[walletKind(w)]++
    mix.total++
  }
  return mix
}

/** The ring's arcs: each kind's share of the circle, in KIND_ORDER, with a small gap between arcs (none for one kind). */
export function ringArcs(mix: WalletMix, circumference: number, gap = 3): { kind: WalletKindTag; length: number; offset: number }[] {
  if (mix.total === 0) return []
  const kinds = KIND_ORDER.filter((k) => mix[k] > 0)
  const space = kinds.length > 1 ? gap : 0
  let at = 0
  return kinds.map((kind) => {
    const share = (mix[kind] / mix.total) * circumference
    const arc = { kind, length: Math.max(share - space, 0.5), offset: at }
    at += share
    return arc
  })
}

export type WalletTab = "all" | "bank" | "cash"

/** The tabs over the list: Bank holds the banks, e-wallets and their credit cards; Cash the cash in hand. */
export function filterByTab(wallets: Wallet[], tab: WalletTab): Wallet[] {
  if (tab === "all") return wallets
  return wallets.filter((w) => (tab === "cash" ? walletKind(w) === "cash" : walletKind(w) === "bank" || walletKind(w) === "card"))
}

/**
 * The primary wallet (ចម្បង): the first active wallet in the person's own order that they may spend from — the one a new
 * income or expense starts with (entry-form-sheet's `selectable[0]`). Moving another to the top makes it the primary.
 */
export function primaryWalletId(wallets: Wallet[], userId: string | undefined): string | null {
  const first = wallets.find(
    (w) => !w.archived_at && !isGoal(w) && (w.visibility !== "PERSONAL" || !w.owner_id || w.owner_id === userId),
  )
  return first?.id ?? null
}
