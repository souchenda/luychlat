"use client"

import type { Wallet } from "@/lib/data/types"
import { useT } from "@/lib/i18n/use-t"
import { cn } from "@/lib/utils"
import { KIND_ACCENT, KIND_ORDER, ringArcs, walletMix } from "@/lib/wallet-overview"
import { useLocaleStore } from "@/stores/locale-store"

const KM_DIGITS = "០១២៣៤៥៦៧៨៩"
const R = 15.5
const C = 2 * Math.PI * R

/**
 * The hero's wallet ring (founder, 21/10/2026 — after ACLEDA Mobile): how many wallets the total counts, the count in the
 * middle and «N កាបូប» under it; each kind is an arc in its accent (cash · bank · savings · card), so the mix reads at a
 * glance. A count, never a balance: it shows with the balances hidden too.
 */
export function WalletRing({ wallets, size = "lg" }: { wallets: Wallet[]; size?: "sm" | "lg" }) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const mix = walletMix(wallets)
  const digits = (n: number) => (locale === "km" ? String(n).replace(/\d/g, (d) => KM_DIGITS[Number(d)]) : String(n))
  const parts = KIND_ORDER.filter((k) => mix[k] > 0).map((k) => `${digits(mix[k])} ${t(`walletKind.${k}`)}`)
  const label = `${t("netWorth.walletCount", { n: digits(mix.total) })}${parts.length ? ` · ${parts.join(", ")}` : ""}`

  return (
    <div role="img" aria-label={label} title={label} className="flex shrink-0 flex-col items-center gap-1">
      <span className={cn("relative grid place-items-center", size === "lg" ? "size-[4.25rem]" : "size-11")}>
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
        <span className={cn("font-bold tabular-nums", size === "lg" ? "text-xl" : "text-[15px]")}>{digits(mix.total)}</span>
      </span>
      {size === "lg" && <span className="text-[12px] leading-none font-medium whitespace-nowrap text-white/85">{t("netWorth.walletCount", { n: "" }).trim()}</span>}
    </div>
  )
}
