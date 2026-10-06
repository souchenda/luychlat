"use client"

import { EyeIcon, EyeOffIcon, HomeIcon, type LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { Amount } from "@/components/money/amount"
import { Skeleton } from "@/components/ui/skeleton"
import type { Wallet } from "@/lib/data/types"
import { useT } from "@/lib/i18n/use-t"
import { convert, roundMoney } from "@/lib/money"
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
    usdWallets: usd,
    khrWallets: khr,
    assets: assetsUsd,
    totalUsd: roundMoney(usd + assetsUsd + convert(khr, "KHR", "USD", khrPerUsd), "USD"),
    totalKhr: roundMoney(khr + convert(usd + assetsUsd, "USD", "KHR", khrPerUsd), "KHR"),
  }
}

/**
 * Total of the active workspace (wallets, savings goals and assets), in USD and KHR at the configured rate.
 * `actions` (Home): quick-entry buttons sitting inside the bottom of the card.
 */
export function NetWorthCard({
  wallets,
  loading,
  assetsUsd = 0,
  actions,
}: {
  wallets: Wallet[] | undefined
  loading?: boolean
  assetsUsd?: number
  actions?: ReactNode
}) {
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
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/30 px-2.5 py-1 ring-1 ring-amber-200/40 backdrop-blur-sm" title={t("assets.pageTitle")}>
            <HomeIcon className="size-3" aria-hidden />
            <Amount value={totals.assets} currency="USD" />
          </span>
        )}
      </div>

      {actions && <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/15 pt-4">{actions}</div>}
    </section>
  )
}

/** Quick entry inside the hero card: dark frosted glass on the emerald gradient (keeps white text readable), a white icon disc, 48px tall. */
export function HeroAction({
  icon: Icon,
  tone,
  label,
  onClick,
  disabled,
}: {
  icon: LucideIcon
  tone: string
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-12 items-center justify-center gap-1.5 rounded-2xl border border-white/20 bg-emerald-950/25 px-2 text-sm font-medium text-white shadow-inner shadow-white/5 backdrop-blur-sm transition-all hover:bg-emerald-950/35 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none active:scale-[0.97] disabled:opacity-50"
    >
      <span className={`grid size-6 shrink-0 place-items-center rounded-full bg-white shadow-sm ${tone}`}>
        <Icon className="size-3.5" strokeWidth={2.75} aria-hidden />
      </span>
      <span className="truncate">{label}</span>
    </button>
  )
}
