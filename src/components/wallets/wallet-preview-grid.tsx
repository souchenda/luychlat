"use client"

import { PlusIcon } from "lucide-react"
import { walletDisplayName } from "@/lib/wallet-name"
import Link from "next/link"

import { Amount } from "@/components/money/amount"
import type { Wallet } from "@/lib/data/types"
import { useT } from "@/lib/i18n/use-t"
import { convert } from "@/lib/money"
import { walletInstitution } from "@/lib/wallets/providers"
import { usePrefsStore } from "@/stores/prefs-store"

import { WalletAvatar } from "./wallet-avatar"

const usd2 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** The balance steps down a size as it grows, so it never truncates in a half-width card. */
const balanceSize = (w: Wallet) => (usd2.format(Math.abs(w.balance)).length <= 9 ? "text-lg" : "text-base")

/** «•••• 6222»: the account's last four digits when known (from the account number, else the name). */
function lastFour(w: Wallet): string | null {
  const digits = (w.account_no ?? "").replace(/\D/g, "")
  if (digits.length >= 4) return digits.slice(-4)
  return /(\d{3,4})\D*$/.exec(w.name)?.[1] ?? null
}

/**
 * Home: the first two cash / bank wallets side by side, drawn as bank cards (founder, 17/10/2026 — the
 * infographic dashboard): the bank's colour, its logo, the full name (up to three lines, never «…» at
 * once), the last four digits, the balance and ≈ the other currency. Each opens its statement
 * (/wallets/<id>). With fewer than two, the free slot adds a wallet. Credit cards and the full list live
 * on /wallets.
 */
export function WalletPreviewGrid({ wallets, onAdd }: { wallets: Wallet[]; onAdd?: () => void }) {
  const t = useT()
  const khrPerUsd = usePrefsStore((s) => s.khrPerUsd)

  return (
    <div className="grid grid-cols-2 gap-3">
      {wallets.map((w) => {
        const other = w.currency === "USD" ? "KHR" : "USD"
        const brand = w.color || walletInstitution(w).color
        const last4 = lastFour(w)
        return (
          <Link
            key={w.id}
            href={`/wallets/${w.id}`}
            className="relative isolate flex min-h-40 min-w-0 flex-col gap-2 overflow-hidden rounded-2xl p-3.5 text-white shadow-md ring-1 ring-black/5 transition-transform active:scale-[0.99]"
            // Darkened from the brand colour so white text reads on any bank (Wing's light green included).
            style={{ background: `linear-gradient(135deg, color-mix(in oklab, ${brand} 72%, black) 0%, color-mix(in oklab, ${brand} 48%, black) 100%)` }}
          >
            {/* A soft card sheen, purely decorative. */}
            <span aria-hidden className="pointer-events-none absolute -top-10 -right-10 -z-10 size-28 rounded-full bg-white/15 blur-2xl" />
            <span className="flex items-center justify-between gap-2">
              <span className="rounded-full bg-white p-0.5 shadow-sm">
                <WalletAvatar icon={w.icon} color={w.color} name={w.name} />
              </span>
              {last4 && <span className="text-[13px] font-medium tracking-wider text-white/85 tabular-nums">•••• {last4}</span>}
            </span>
            {/* The full name, up to three lines: readable on a phone. */}
            <span className="line-clamp-3 min-w-0 text-sm leading-snug font-medium break-words text-white/95" title={w.name}>
              {walletDisplayName(w)}
            </span>
            <span className="mt-auto min-w-0">
              <Amount value={w.balance} currency={w.currency} className={`block font-bold tracking-tight whitespace-nowrap tabular-nums ${balanceSize(w)}`} />
              <span className="block text-[13px] whitespace-nowrap text-white/75 tabular-nums">
                ≈ <Amount value={convert(w.balance, w.currency, other, khrPerUsd)} currency={other} />
              </span>
            </span>
          </Link>
        )
      })}
      {onAdd && wallets.length < 2 && (
        <button
          type="button"
          onClick={onAdd}
          className="flex min-h-40 flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed text-sm text-muted-foreground transition-colors hover:bg-muted/50"
        >
          <PlusIcon className="size-5" aria-hidden />
          {t("wallets.addShort")}
        </button>
      )}
    </div>
  )
}
