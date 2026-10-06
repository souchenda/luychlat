"use client"

import { PlusIcon } from "lucide-react"
import Link from "next/link"

import { Amount } from "@/components/money/amount"
import { isCard } from "@/lib/credit-card"
import type { Wallet } from "@/lib/data/types"
import { pick } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { convert } from "@/lib/money"
import { getProvider } from "@/lib/wallets/providers"
import { useLocaleStore } from "@/stores/locale-store"
import { usePrefsStore } from "@/stores/prefs-store"

import { WalletAvatar } from "./wallet-avatar"

/**
 * Home: cash and bank wallets side by side, swiped horizontally (snaps per card),
 * instead of a tall list — logo, name, kind, balance (≈ the other currency).
 * Credit cards stay on /wallets only, so Home shows just money you own.
 * Each opens /wallets; the last tile adds one.
 */
export function WalletCarousel({ wallets, onAdd }: { wallets: Wallet[]; onAdd?: () => void }) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const khrPerUsd = usePrefsStore((s) => s.khrPerUsd)

  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {wallets.filter((w) => !isCard(w)).map((w) => {
        const other = w.currency === "USD" ? "KHR" : "USD"
        return (
          <Link
            key={w.id}
            href="/wallets"
            className="flex w-[260px] shrink-0 snap-start flex-col gap-3 rounded-2xl border bg-card p-3.5 shadow-xs transition-colors hover:bg-muted/40 active:scale-[0.99]"
          >
            <span className="flex items-center gap-2.5">
              <WalletAvatar icon={w.icon} color={w.color} name={w.name} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{w.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {pick(getProvider(w.icon).name, locale)} · {w.currency}
                </span>
              </span>
            </span>
            <span>
              <Amount value={w.balance} currency={w.currency} className="block text-xl font-bold tracking-tight" />
              <span className="block text-xs text-muted-foreground">
                ≈ <Amount value={convert(w.balance, w.currency, other, khrPerUsd)} currency={other} />
              </span>
            </span>
          </Link>
        )
      })}
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="flex w-[120px] shrink-0 snap-start flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed text-sm text-muted-foreground transition-colors hover:bg-muted/50"
        >
          <PlusIcon className="size-5" aria-hidden />
          {t("wallets.addShort")}
        </button>
      )}
    </div>
  )
}
