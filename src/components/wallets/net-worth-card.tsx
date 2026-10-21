"use client"

import { EyeIcon, EyeOffIcon, RotateCwIcon, ShieldCheckIcon, TrendingDownIcon } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"

import { Amount } from "@/components/money/amount"
import { Skeleton } from "@/components/ui/skeleton"
import type { AssetGap } from "@/lib/asset-gaps"
import type { Wallet } from "@/lib/data/types"
import { useT } from "@/lib/i18n/use-t"
import { heroTotals } from "@/lib/wallet-overview"
import { usePrefsStore } from "@/stores/prefs-store"

import { WalletRing } from "./wallet-ring"

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
  const totals = heroTotals(wallets ?? [], khrPerUsd, assetsUsd, liabilitiesUsd)

  return (
    // Emerald into navy with a thread of gold along the top (founder, 21/10/2026 — the ACLEDA-style hero in the app's colours).
    <section className="relative isolate overflow-hidden rounded-3xl bg-linear-to-br from-emerald-600 via-emerald-700 to-[#0b2545] p-5 text-white shadow-lg shadow-emerald-900/25 ring-1 ring-white/15">
      {/* Glass sheen: soft light blooms and a top highlight, purely decorative. */}
      <span aria-hidden className="pointer-events-none absolute -top-20 -right-12 -z-10 size-56 rounded-full bg-white/20 blur-3xl" />
      <span aria-hidden className="pointer-events-none absolute -bottom-24 -left-10 -z-10 size-56 rounded-full bg-teal-300/25 blur-3xl" />
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-1/2 bg-linear-to-b from-white/12 to-transparent" />
      <span aria-hidden className="pointer-events-none absolute inset-x-8 top-0 h-px bg-linear-to-r from-transparent via-amber-300/80 to-transparent" />

      {/* Top: the wallet ring and, beside it, ONE three-line stack (founder, 21/10/2026 — no repeated USD / KHR pills):
          the title with the eye, the total in dollars, the same total in riel. */}
      <div className="flex items-center gap-4">
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
                className={`mt-0.5 block font-bold tracking-tight whitespace-nowrap tabular-nums drop-shadow-sm ${totalSize(totals.totalUsd)}`}
              />
              {/* The same total in riel — «≈»: converted at the rate, not the riel held. */}
              <p className="text-[15px] whitespace-nowrap text-white/85 tabular-nums">
                ≈ <Amount value={totals.totalKhr} currency="KHR" />
              </p>
            </>
          )}
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
        </div>
      </div>

      {/* Loans: a full-width row of two halves under the top (founder, 21/10/2026) — what is owed (opens the loans with the
          CBC K-Score) and the net after it; the headline stays the total held. */}
      {!loading && totals.liabilities > 0 && (
        <div className="mt-4 grid grid-cols-2 divide-x divide-white/15 rounded-2xl bg-white/10 py-2.5 ring-1 ring-white/15 backdrop-blur-sm tabular-nums">
          <Link href="/debts?tab=PAYABLE#credit-health" className="min-w-0 px-3 transition-opacity hover:opacity-90">
            <span className="flex items-center gap-1 text-[12px] text-white/75">
              <TrendingDownIcon className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{t("netWorth.loans")} ›</span>
            </span>
            <span className="block truncate text-[15px] font-semibold">
              −<Amount value={totals.liabilities} currency="USD" />
            </span>
          </Link>
          <div className="min-w-0 px-3" title={t("netWorth.net")}>
            <span className="flex items-center gap-1 text-[12px] text-white/75">
              <ShieldCheckIcon className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{t("netWorth.netShort")}</span>
            </span>
            <Amount value={totals.net} currency="USD" className="block truncate text-[15px] font-semibold" />
          </div>
        </div>
      )}

      {footer && <div className="mt-3 border-t border-white/15 pt-2 -mb-1 empty:hidden">{footer}</div>}
    </section>
  )
}
