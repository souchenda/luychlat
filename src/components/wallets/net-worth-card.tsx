"use client"

import { EyeIcon, EyeOffIcon } from "lucide-react"

import { Amount } from "@/components/money/amount"
import { Skeleton } from "@/components/ui/skeleton"
import type { Wallet } from "@/lib/data/types"
import { useT } from "@/lib/i18n/use-t"
import { convert, roundMoney } from "@/lib/money"
import { isGoal } from "@/lib/goals"
import { usePrefsStore } from "@/stores/prefs-store"

/** Wallet totals, plus assets (gold at market rate + land, house, vehicles…) in USD when given. */
export function computeTotals(wallets: Wallet[], khrPerUsd: number, assetsUsd = 0) {
  const active = wallets.filter((w) => !w.archived_at)
  const sum = (currency: "USD" | "KHR") =>
    roundMoney(
      active.filter((w) => w.currency === currency).reduce((acc, w) => acc + w.balance, 0),
      currency,
    )
  const usd = sum("USD")
  const khr = sum("KHR")
  return {
    // Savings goals count in the totals (they are assets) but not as wallets.
    count: active.filter((w) => !isGoal(w)).length,
    usdWallets: usd,
    khrWallets: khr,
    assets: assetsUsd,
    totalUsd: roundMoney(usd + assetsUsd + convert(khr, "KHR", "USD", khrPerUsd), "USD"),
    totalKhr: roundMoney(khr + convert(usd + assetsUsd, "USD", "KHR", khrPerUsd), "KHR"),
  }
}

/** Total of the active workspace (wallets, savings goals and assets), in USD and KHR at the configured rate. */
export function NetWorthCard({ wallets, loading, assetsUsd = 0 }: { wallets: Wallet[] | undefined; loading?: boolean; assetsUsd?: number }) {
  const t = useT()
  const { hideBalances, toggleHideBalances, khrPerUsd } = usePrefsStore()
  const totals = computeTotals(wallets ?? [], khrPerUsd, assetsUsd)

  return (
    <section className="relative isolate overflow-hidden rounded-3xl bg-linear-to-br from-emerald-600 via-emerald-500 to-teal-700 p-5 text-white shadow-lg shadow-emerald-900/25 ring-1 ring-white/15">
      {/* Glass sheen: soft light blooms and a top highlight, purely decorative. */}
      <span aria-hidden className="pointer-events-none absolute -top-20 -right-12 -z-10 size-56 rounded-full bg-white/20 blur-3xl" />
      <span aria-hidden className="pointer-events-none absolute -bottom-24 -left-10 -z-10 size-56 rounded-full bg-teal-300/25 blur-3xl" />
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-1/2 bg-linear-to-b from-white/12 to-transparent" />
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium tracking-wide text-white/80">{t("netWorth.title")}</p>
        <button
          type="button"
          onClick={toggleHideBalances}
          className="-m-2 rounded-full p-2 text-white/80 transition-colors hover:bg-white/15 hover:text-white"
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
          <Amount value={totals.totalUsd} currency="USD" className="mt-1 block text-3xl font-bold tracking-tight drop-shadow-sm" />
          <p className="text-base text-white/85">
            ≈ <Amount value={totals.totalKhr} currency="KHR" />
          </p>
        </>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-white/15 px-2.5 py-1 ring-1 ring-white/20 backdrop-blur-sm">
          <Amount value={totals.usdWallets} currency="USD" />
        </span>
        <span className="rounded-full bg-white/15 px-2.5 py-1 ring-1 ring-white/20 backdrop-blur-sm">
          <Amount value={totals.khrWallets} currency="KHR" />
        </span>
        {totals.assets > 0 && (
          <span className="rounded-full bg-amber-400/30 px-2.5 py-1 ring-1 ring-amber-200/40 backdrop-blur-sm" title={t("assets.pageTitle")}>
            🏠 <Amount value={totals.assets} currency="USD" />
          </span>
        )}
        <span className="ml-auto text-white/75">
          {t("netWorth.walletCount", { count: totals.count })} · {t("netWorth.rate", { rate: khrPerUsd.toLocaleString("en-US") })}
        </span>
      </div>
    </section>
  )
}
