"use client"

import type { Wallet } from "@/lib/data/types"
import { useT } from "@/lib/i18n/use-t"
import { KIND_ACCENT, KIND_ORDER, ringArcs, walletMix } from "@/lib/wallet-overview"

const R = 15.5
const C = 2 * Math.PI * R

/**
 * The hero's wallet ring (founder, 21/10/2026 — after ACLEDA Mobile): how many wallets the total counts, the count in the
 * middle and «N កាបូប» under it; each kind is an arc in its accent (cash · bank · savings · card), so the mix reads at a
 * glance. A count, never a balance: it shows with the balances hidden too.
 */
export function WalletRing({ wallets }: { wallets: Wallet[] }) {
  const t = useT()
  const mix = walletMix(wallets)
  // International digits («13», never Khmer digits — founder, 21/10/2026).
  const digits = (n: number) => String(n)
  const parts = KIND_ORDER.filter((k) => mix[k] > 0).map((k) => `${digits(mix[k])} ${t(`walletKind.${k}`)}`)
  const label = `${t("netWorth.walletCount", { n: digits(mix.total) })}${parts.length ? ` · ${parts.join(", ")}` : ""}`

  return (
    <div role="img" aria-label={label} title={label} className="flex shrink-0 flex-col items-center gap-1">
      <span className="relative grid size-[4.25rem] place-items-center">
        <svg viewBox="0 0 36 36" className="absolute inset-0 size-full -rotate-90" aria-hidden>
          <circle cx="18" cy="18" r={R} fill="none" stroke="currentColor" strokeWidth="3" className="text-white/20" />
          {ringArcs(mix, C).map((arc) => (
            <circle
              key={arc.kind}
              cx="18"
              cy="18"
              r={R}
              fill="none"
              stroke={KIND_ACCENT[arc.kind].ring}
              strokeWidth="3"
              strokeDasharray={`${arc.length} ${C - arc.length}`}
              strokeDashoffset={-arc.offset}
            />
          ))}
        </svg>
        <span className="text-xl font-bold tabular-nums">{digits(mix.total)}</span>
      </span>
      <span className="text-[12px] leading-none font-medium whitespace-nowrap text-white/85">{t("netWorth.walletCount", { n: "" }).trim()}</span>
    </div>
  )
}
