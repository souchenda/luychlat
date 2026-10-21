"use client"

import { WalletIcon } from "lucide-react"
import Link from "next/link"

import type { Wallet } from "@/lib/data/types"
import { useT } from "@/lib/i18n/use-t"
import { KIND_ORDER, walletArcs, walletMix } from "@/lib/wallet-overview"
import { usePrefsStore } from "@/stores/prefs-store"

const R = 15.5
const C = 2 * Math.PI * R

/**
 * The hero's wallet ring (founder, 21/10/2026 — after ACLEDA Mobile; Tasks #444 / #450): 76 px, as tall as the balance
 * stack beside it, with one large wallet icon centred inside (the count of wallets is its accessible label, not drawn); each wallet is a segment (Task #438), its length its
 * share of the money, its colour its kind (cash · bank · savings · card), the shades alternating within a kind. With the
 * balances hidden the segments are equal — no share of the money shows (lib/wallet-overview.ts › walletArcs). A tap opens
 * the wallets. A count, never a balance: it shows with the balances hidden too.
 */
export function WalletRing({ wallets }: { wallets: Wallet[] }) {
  const t = useT()
  const mix = walletMix(wallets)
  const hidden = usePrefsStore((s) => s.hideBalances)
  const khrPerUsd = usePrefsStore((s) => s.khrPerUsd)
  // International digits («13», never Khmer digits — founder, 21/10/2026).
  const digits = (n: number) => String(n)
  const parts = KIND_ORDER.filter((k) => mix[k] > 0).map((k) => `${digits(mix[k])} ${t(`walletKind.${k}`)}`)
  const label = `${t("netWorth.walletCount", { n: digits(mix.total) })}${parts.length ? ` · ${parts.join(", ")}` : ""}`

  return (
    <Link href="/wallets" aria-label={label} title={label} className="relative grid size-[76px] shrink-0 place-items-center rounded-full transition-transform active:scale-95">
      <svg viewBox="0 0 36 36" className="absolute inset-0 size-full -rotate-90" aria-hidden>
        <circle cx="18" cy="18" r={R} fill="none" stroke="currentColor" strokeWidth="3" className="text-white/20" />
        {walletArcs(wallets, khrPerUsd, C, { byBalance: !hidden }).map((arc) => (
          <circle
            key={arc.id}
            cx="18"
            cy="18"
            r={R}
            fill="none"
            stroke={arc.color}
            strokeWidth="3"
            strokeDasharray={`${arc.length} ${C - arc.length}`}
            strokeDashoffset={-arc.offset}
          />
        ))}
      </svg>
      {/* Inside the ring: one large wallet, centred (Task #450 — the count is in the label, read aloud, not drawn). */}
      <WalletIcon className="size-9 text-white drop-shadow-sm" strokeWidth={1.75} aria-hidden />
    </Link>
  )
}
