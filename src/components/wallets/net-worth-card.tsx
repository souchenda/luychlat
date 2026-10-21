"use client"

import { EyeIcon, EyeOffIcon, HomeIcon, RotateCwIcon } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"

import { Amount } from "@/components/money/amount"
import { Skeleton } from "@/components/ui/skeleton"
import type { AssetGap } from "@/lib/asset-gaps"
import type { Wallet } from "@/lib/data/types"
import { useT } from "@/lib/i18n/use-t"
import { convert, roundMoney } from "@/lib/money"
import { personalWallets } from "@/lib/pool-ledger"
import { usePrefsStore } from "@/stores/prefs-store"

import { WalletRing } from "./wallet-ring"

/**
 * Wallet totals, plus assets (gold at market rate + land, house, vehicles…) in USD when given.
 * Shared pool wallets hold the group's money in custody: not the owner's net worth.
 */
export function computeTotals(wallets: Wallet[], khrPerUsd: number, assetsUsd = 0) {
  const active = personalWallets(wallets).filter((w) => !w.archived_at)
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

const usd2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 })

/** The headline total shrinks a step as it grows, so it never truncates beside the wallet ring. */
function totalSize(usd: number) {
  const len = usd2.format(usd).length
  return len <= 9 ? "text-3xl" : len <= 11 ? "text-2xl" : "text-xl"
}

/**
 * Total of the active workspace (wallets, savings goals and assets), in USD and KHR at the configured rate.
 * The ACLEDA layout (founder, 21/10/2026): the wallet ring on the left, the totals across the rest of the card, the
 * loans and the net after them, and on home the market ticker (`footer`) under a hairline. No buttons inside: the
 * actions are the quick-action grid below the card (tests/golden/layout-guards.test.ts).
 */
export function NetWorthCard({
  wallets,
  loading,
  assetsUsd = 0,
  liabilitiesUsd = 0,
  footer,
  gaps = [],
  onRetryGaps,
}: {
  wallets: Wallet[] | undefined
  loading?: boolean
  assetsUsd?: number
  /** Loans and other money owed (liabilitiesUsd in lib/debts): a line under the totals, never subtracted from the headline. */
  liabilitiesUsd?: number
  footer?: ReactNode
  /** Assets that could not be counted (useAssetsTotal().gaps): said under the total, never a silent $0. */
  gaps?: AssetGap[]
  onRetryGaps?: () => void
}) {
  const t = useT()
  const { hideBalances, toggleHideBalances, khrPerUsd } = usePrefsStore()
  const totals = computeTotals(wallets ?? [], khrPerUsd, assetsUsd)

  return (
    // Emerald into navy with a thread of gold along the top (founder, 21/10/2026 — the ACLEDA-style hero in the app's colours).
    <section className="relative isolate overflow-hidden rounded-3xl bg-linear-to-br from-emerald-600 via-emerald-700 to-[#0b2545] p-5 text-white shadow-lg shadow-emerald-900/25 ring-1 ring-white/15">
      {/* Glass sheen: soft light blooms and a top highlight, purely decorative. */}
      <span aria-hidden className="pointer-events-none absolute -top-20 -right-12 -z-10 size-56 rounded-full bg-white/20 blur-3xl" />
      <span aria-hidden className="pointer-events-none absolute -bottom-24 -left-10 -z-10 size-56 rounded-full bg-teal-300/25 blur-3xl" />
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-1/2 bg-linear-to-b from-white/12 to-transparent" />
      <span aria-hidden className="pointer-events-none absolute inset-x-8 top-0 h-px bg-linear-to-r from-transparent via-amber-300/80 to-transparent" />

      <div className="flex gap-3">
        {/* The wallet ring on the left: how many wallets the total counts. */}
        {!loading && <WalletRing wallets={wallets ?? []} />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            {/* «សមតុល្យសរុប» while the total is the wallets; «ទ្រព្យសកម្មសរុប» once gold, land or a vehicle is counted in it. */}
            <p className="text-[15px] font-medium text-white/85">{t(totals.assets > 0 ? "netWorth.title" : "netWorth.balanceTitle")}</p>
            <button
              type="button"
              onClick={toggleHideBalances}
              className="-my-1.5 rounded-full p-1.5 text-white/75 transition-colors hover:bg-white/15 hover:text-white"
              aria-label={t("netWorth.toggle")}
              aria-pressed={hideBalances}
            >
              {hideBalances ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
            </button>
          </div>

          {loading ? (
            <div className="mt-2 space-y-2">
              <Skeleton className="h-9 w-36 bg-white/20" />
              <Skeleton className="h-5 w-28 bg-white/20" />
            </div>
          ) : (
            <>
              <Amount
                value={totals.totalUsd}
                currency="USD"
                className={`mt-1 block font-bold tracking-tight whitespace-nowrap tabular-nums drop-shadow-sm ${totalSize(totals.totalUsd)}`}
              />
              <p className="text-[15px] whitespace-nowrap text-white/90 tabular-nums">
                ≈ <Amount value={totals.totalKhr} currency="KHR" />
              </p>
            </>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[13px] tabular-nums">
            {/* The two currencies apart, each with its own badge: what is held in dollars and in riel (never mixed by a rate). */}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 py-1 pr-2.5 pl-1 whitespace-nowrap ring-1 ring-white/20 backdrop-blur-sm" title={t("netWorth.inUsd")}>
              <span className="rounded-full bg-white px-1.5 text-[11px] leading-[18px] font-bold text-emerald-800">USD</span>
              <Amount value={totals.usdWallets} currency="USD" />
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 py-1 pr-2.5 pl-1 whitespace-nowrap ring-1 ring-white/20 backdrop-blur-sm" title={t("netWorth.inKhr")}>
              <span className="rounded-full bg-amber-300 px-1.5 text-[11px] leading-[18px] font-bold text-amber-950">KHR</span>
              <Amount value={totals.khrWallets} currency="KHR" />
            </span>
            {totals.assets > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/30 px-2.5 py-1 whitespace-nowrap ring-1 ring-amber-200/40 backdrop-blur-sm" title={t("assets.pageTitle")}>
                <HomeIcon className="size-3" aria-hidden />
                <Amount value={totals.assets} currency="USD" />
              </span>
            )}
          </div>
          {!loading && gaps.length > 0 && (
            <button
              type="button"
              onClick={onRetryGaps}
              className="mt-2 inline-flex min-h-8 items-center gap-1.5 rounded-full bg-amber-400/25 px-2.5 py-1 text-left text-[13px] font-medium text-white ring-1 ring-amber-200/40"
            >
              <span>{t("netWorth.notCounted", { items: gaps.map((g) => t(`assetGap.${g}`)).join(", ") })}</span>
              {onRetryGaps && <RotateCwIcon className="size-3.5 shrink-0" aria-label={t("widget.retry")} />}
            </button>
          )}
          {/* Loans: their own line — what is owed, and what is left after it (the headline stays the total held). */}
          {!loading && liabilitiesUsd > 0 && (
            <div className="mt-2.5 space-y-0.5 text-[13px] tabular-nums text-white/90">
              {/* Opens the loans owed with the CBC K-Score at the top. */}
              <Link href="/debts?tab=PAYABLE#credit-health" className="flex justify-between gap-2 rounded-md underline-offset-4 hover:underline">
                <span>{t("netWorth.loans")} ›</span>
                <span className="font-semibold whitespace-nowrap">
                  −<Amount value={liabilitiesUsd} currency="USD" />
                </span>
              </Link>
              <p className="flex justify-between gap-2">
                <span>{t("netWorth.net")}</span>
                <Amount value={roundMoney(totals.totalUsd - liabilitiesUsd, "USD")} currency="USD" className="font-semibold whitespace-nowrap" />
              </p>
            </div>
          )}
        </div>
      </div>

      {footer && <div className="mt-3 border-t border-white/15 pt-2 -mb-1 empty:hidden">{footer}</div>}
    </section>
  )
}
