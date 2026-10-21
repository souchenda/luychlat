/**
 * The wallets overview (founder, 21/10/2026 — the ACLEDA Mobile hierarchy, in the app's emerald / navy / gold): what kind
 * each wallet is (its accent bar), how many the hero's ring counts and in what mix, the All · Bank · Cash tabs and which
 * wallet is the primary one (ចម្បង). Pure — the cards are in components/wallets.
 */
import type { Wallet } from "@/lib/data/types"
import { isCard } from "@/lib/credit-card"
import { isGoal } from "@/lib/goals"
import { convert, roundMoney, roundRiel } from "@/lib/money"
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

/** The second shade of each kind on the ring: two wallets of one kind side by side alternate, so each reads as its own. */
export const KIND_RING_ALT: Record<WalletKindTag, string> = { cash: "#34d399", bank: "#38bdf8", savings: "#fbbf24", card: "#a78bfa" }

export type WalletArc = { id: string; kind: WalletKindTag; color: string; length: number; offset: number }

/**
 * The hero ring, one segment per wallet (founder, 21/10/2026 — Task #438): in kind order (cash · bank · savings · card),
 * each wallet's arc its share of the money in dollars at `khrPerUsd`, in its kind's colour — the shades alternating within
 * a kind. Every wallet keeps a visible sliver (a card or an empty wallet holds no money but is still counted), with a
 * small gap between segments. With the balances hidden (`byBalance: false`) the segments are equal: the ring never
 * gives away how the money is split.
 */
export function walletArcs(wallets: Wallet[], khrPerUsd: number, circumference: number, opts: { byBalance?: boolean } = {}): WalletArc[] {
  const set = personalWallets(wallets)
    .filter((w) => !w.archived_at)
    .map((w, i) => ({ w, kind: walletKind(w), i }))
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.i - b.i)
  const n = set.length
  if (n === 0) return []
  const weights = set.map(({ w }) => (opts.byBalance === false ? 1 : Math.max(0, convert(w.balance, w.currency, "USD", khrPerUsd))))
  const total = weights.reduce((a, b) => a + b, 0)
  const share = total > 0 ? weights.map((x) => x / total) : weights.map(() => 1 / n)
  // A floor of 4% each (never more than an equal split), the rest by share.
  const floor = Math.min(circumference * 0.04, circumference / n)
  const free = circumference - floor * n
  const gap = n > 1 ? Math.min(1.5, (circumference / n) * 0.25) : 0
  let at = 0
  const seen: Partial<Record<WalletKindTag, number>> = {}
  return set.map(({ w, kind }, i) => {
    const slot = floor + free * share[i]
    const nth = (seen[kind] = (seen[kind] ?? -1) + 1)
    const arc = { id: w.id, kind, color: nth % 2 === 0 ? KIND_ACCENT[kind].ring : KIND_RING_ALT[kind], length: Math.max(slot - gap, 0.3), offset: at }
    at += slot
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

/**
 * The hero card's figures (founder, 21/10/2026 — one clean stack, no repeated pills): the total in dollars, the same total
 * in riel, and with loans what is owed and the net after them. Wallets and savings goals of the person's own money (a
 * shared pool's wallet is the group's), plus assets in USD. The riel line converts the dollars at the configured rate, so
 * it is rounded to 100 ៛ (founder guardrail 2); held only in riel, it is the exact sum.
 */
export function heroTotals(wallets: Wallet[], khrPerUsd: number, assetsUsd = 0, liabilitiesUsd = 0) {
  const active = personalWallets(wallets).filter((w) => !w.archived_at)
  const sum = (currency: "USD" | "KHR") =>
    roundMoney(
      active.filter((w) => w.currency === currency).reduce((acc, w) => acc + w.balance, 0),
      currency,
    )
  const usdWallets = sum("USD")
  const khrWallets = sum("KHR")
  const dollars = usdWallets + assetsUsd
  const totalUsd = roundMoney(dollars + convert(khrWallets, "KHR", "USD", khrPerUsd), "USD")
  const totalKhr = dollars === 0 ? khrWallets : roundRiel(khrWallets + convert(dollars, "USD", "KHR", khrPerUsd))
  return {
    usdWallets,
    khrWallets,
    assets: assetsUsd,
    totalUsd,
    totalKhr,
    liabilities: liabilitiesUsd,
    net: roundMoney(totalUsd - liabilitiesUsd, "USD"),
  }
}
