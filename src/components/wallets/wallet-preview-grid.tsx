"use client"

import { PlusIcon } from "lucide-react"
import { walletDisplayName } from "@/lib/wallet-name"
import Link from "next/link"

import { Amount } from "@/components/money/amount"
import type { Wallet } from "@/lib/data/types"
import { useT } from "@/lib/i18n/use-t"
import { convert } from "@/lib/money"
import { usePrefsStore } from "@/stores/prefs-store"

import { WalletAvatar } from "./wallet-avatar"

const usd2 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** The balance steps down a size as it grows, so it never truncates in a half-width card. */
const balanceSize = (w: Wallet) => (usd2.format(Math.abs(w.balance)).length <= 9 ? "text-lg" : "text-base")

/**
 * Home: the first two cash / bank wallets side by side (logo, name, balance,
 * ≈ the other currency), each opening its statement (/wallets/<id>). With fewer than two, the free
 * slot adds a wallet. Credit cards and the full list live on /wallets.
 */
export function WalletPreviewGrid({ wallets, onAdd }: { wallets: Wallet[]; onAdd?: () => void }) {
  const t = useT()
  const khrPerUsd = usePrefsStore((s) => s.khrPerUsd)

  return (
    <div className="grid grid-cols-2 gap-3">
      {wallets.map((w) => {
        const other = w.currency === "USD" ? "KHR" : "USD"
        return (
          <Link
            key={w.id}
            href={`/wallets/${w.id}`}
            className="flex min-w-0 flex-col gap-2.5 rounded-2xl border bg-card p-3 shadow-xs transition-colors hover:bg-muted/40 active:scale-[0.99]"
          >
            <span className="flex min-w-0 items-center gap-2">
              <WalletAvatar icon={w.icon} color={w.color} name={w.name} />
              <span className="min-w-0 truncate text-sm font-medium" title={w.name}>{walletDisplayName(w)}</span>
            </span>
            <span className="min-w-0">
              <Amount value={w.balance} currency={w.currency} className={`block font-bold tracking-tight whitespace-nowrap tabular-nums ${balanceSize(w)}`} />
              <span className="block text-xs whitespace-nowrap text-muted-foreground tabular-nums">
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
          className="flex min-h-24 flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed text-sm text-muted-foreground transition-colors hover:bg-muted/50"
        >
          <PlusIcon className="size-5" aria-hidden />
          {t("wallets.addShort")}
        </button>
      )}
    </div>
  )
}
