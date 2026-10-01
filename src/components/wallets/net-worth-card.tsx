"use client"

import { EyeIcon, EyeOffIcon } from "lucide-react"

import { Amount } from "@/components/money/amount"
import { Skeleton } from "@/components/ui/skeleton"
import type { Wallet } from "@/lib/data/types"
import { useT } from "@/lib/i18n/use-t"
import { convert, roundMoney } from "@/lib/money"
import { usePrefsStore } from "@/stores/prefs-store"

export function computeTotals(wallets: Wallet[], khrPerUsd: number) {
  const active = wallets.filter((w) => !w.archived_at)
  const sum = (currency: "USD" | "KHR") =>
    roundMoney(
      active.filter((w) => w.currency === currency).reduce((acc, w) => acc + w.balance, 0),
      currency,
    )
  const usd = sum("USD")
  const khr = sum("KHR")
  return {
    count: active.length,
    usdWallets: usd,
    khrWallets: khr,
    totalUsd: roundMoney(usd + convert(khr, "KHR", "USD", khrPerUsd), "USD"),
    totalKhr: roundMoney(khr + convert(usd, "USD", "KHR", khrPerUsd), "KHR"),
  }
}

/** Total balance of the active workspace, in USD and KHR at the configured rate. */
export function NetWorthCard({ wallets, loading }: { wallets: Wallet[] | undefined; loading?: boolean }) {
  const t = useT()
  const { hideBalances, toggleHideBalances, khrPerUsd } = usePrefsStore()
  const totals = computeTotals(wallets ?? [], khrPerUsd)

  return (
    <section className="rounded-3xl bg-primary p-5 text-primary-foreground shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm opacity-85">{t("netWorth.title")}</p>
        <button
          type="button"
          onClick={toggleHideBalances}
          className="-m-2 rounded-full p-2 opacity-85 hover:bg-white/10 hover:opacity-100"
          aria-label={t("netWorth.toggle")}
          aria-pressed={hideBalances}
        >
          {hideBalances ? <EyeOffIcon className="size-5" /> : <EyeIcon className="size-5" />}
        </button>
      </div>

      {loading ? (
        <div className="mt-2 space-y-2">
          <Skeleton className="h-9 w-40 bg-white/20" />
          <Skeleton className="h-5 w-32 bg-white/20" />
        </div>
      ) : (
        <>
          <Amount value={totals.totalUsd} currency="USD" className="mt-1 block text-3xl font-bold" />
          <p className="text-base opacity-90">
            ≈ <Amount value={totals.totalKhr} currency="KHR" />
          </p>
        </>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-white/15 px-2.5 py-1">
          <Amount value={totals.usdWallets} currency="USD" />
        </span>
        <span className="rounded-full bg-white/15 px-2.5 py-1">
          <Amount value={totals.khrWallets} currency="KHR" />
        </span>
        <span className="ml-auto opacity-80">
          {t("netWorth.walletCount", { count: totals.count })} · {t("netWorth.rate", { rate: khrPerUsd.toLocaleString("en-US") })}
        </span>
      </div>
    </section>
  )
}
