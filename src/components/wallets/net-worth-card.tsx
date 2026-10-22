"use client"

import { EyeIcon, EyeOffIcon, GemIcon, RotateCwIcon, ShieldCheckIcon, TrendingDownIcon } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"

import { Amount } from "@/components/money/amount"
import { Skeleton } from "@/components/ui/skeleton"
import type { AssetGap } from "@/lib/asset-gaps"
import type { Wallet } from "@/lib/data/types"
import { useT } from "@/lib/i18n/use-t"
import { heroTotals } from "@/lib/wallet-overview"
import { usePrefsStore } from "@/stores/prefs-store"

import { askMotionOnce } from "@/components/privacy/flip-to-hide"

import { WalletRing } from "./wallet-ring"

/** A balance line steps down a size as it grows, so it never truncates beside the ring (riel runs longer than dollars). */
function balanceSize(value: number, currency: "USD" | "KHR") {
  const len = Math.abs(Math.round(value)).toLocaleString("en-US").length + (currency === "USD" ? 4 : 1)
  return len <= 11 ? "text-[22px]" : len <= 14 ? "text-lg" : "text-base"
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
  const { hideBalances, toggleHideBalances, khrPerUsd, flipToHide } = usePrefsStore()
  const totals = heroTotals(wallets ?? [], khrPerUsd, assetsUsd, liabilitiesUsd)

  return (
    // Emerald into navy with a thread of gold along the top, a hairline border and a soft elevation (founder, 21/10/2026).
    <section className="relative isolate overflow-hidden rounded-3xl bg-linear-to-br from-emerald-600 via-emerald-700 to-[#0b2545] p-5 text-white border border-emerald-400/25 shadow-md shadow-emerald-950/10 dark:border-emerald-500/30 dark:shadow-none">
      {/* Glass sheen: soft light blooms and a top highlight, purely decorative. */}
      <span aria-hidden className="pointer-events-none absolute -top-20 -right-12 -z-10 size-56 rounded-full bg-white/20 blur-3xl" />
      <span aria-hidden className="pointer-events-none absolute -bottom-24 -left-10 -z-10 size-56 rounded-full bg-teal-300/25 blur-3xl" />
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-1/2 bg-linear-to-b from-white/12 to-transparent" />
      <span aria-hidden className="pointer-events-none absolute inset-x-8 top-0 h-px bg-linear-to-r from-transparent via-amber-300/80 to-transparent" />

      {/* Top (founder, 21/10/2026 — the ACLEDA layout, compact): the wallet ring pinned left and, level with it, every
          figure flush RIGHT (Task #443 — no dead space on the right): the title with the eye, then what is held in each
          currency — riel on top, dollars below — each with its currency badge at the right end. No converted headline. */}
      <div className="flex w-full items-center justify-between gap-4">
        {!loading && <WalletRing wallets={wallets ?? []} />}
        <div className="flex min-w-0 flex-1 flex-col items-end text-right">
          <div className="flex items-center justify-end gap-1">
            <p className="text-[15px] font-medium text-white/85">{t("netWorth.balanceTitle")}</p>
            <button
              type="button"
              onClick={() => {
                // Showing the balances on an iPhone: the tap that lets «flip to hide» read the tilt (Task #461).
                if (hideBalances && flipToHide) askMotionOnce()
                toggleHideBalances()
              }}
              className="-my-1.5 rounded-full p-1.5 text-white/75 transition-colors hover:bg-white/15 hover:text-white"
              aria-label={t("netWorth.toggle")}
              aria-pressed={hideBalances}
            >
              {hideBalances ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
            </button>
          </div>

          {loading ? (
            <div className="mt-2 flex flex-col items-end space-y-2">
              <Skeleton className="h-7 w-40 bg-white/20" />
              <Skeleton className="h-7 w-32 bg-white/20" />
            </div>
          ) : (
            <div className="mt-1.5 flex w-full flex-col items-end space-y-1">
              {(["KHR", "USD"] as const).map((c) => {
                const held = c === "KHR" ? totals.khrWallets : totals.usdWallets
                return (
                  <p key={c} className="flex w-full min-w-0 items-center justify-end gap-2" title={t(c === "KHR" ? "netWorth.inKhr" : "netWorth.inUsd")}>
                    <Amount value={held} currency={c} className={`truncate font-bold tracking-tight whitespace-nowrap tabular-nums drop-shadow-sm ${balanceSize(held, c)}`} />
                    {/* The currency as its symbol in a round badge (Task #449, after ACLEDA): gold «៛», blue «$» — not «KHR» / «USD». */}
                    <span aria-hidden className={`grid size-6 shrink-0 place-items-center rounded-full text-[13px] leading-none font-bold shadow-sm ${c === "KHR" ? "bg-amber-300 text-amber-950" : "bg-sky-300 text-sky-950"}`}>{c === "KHR" ? "៛" : "$"}</span>
                  </p>
                )
              })}
              {totals.assets > 0 && (
                <Link href="/assets" className="flex items-center justify-end gap-1 pt-0.5 text-[13px] text-white/80 hover:text-white" title={t("assets.pageTitle")}>
                  <GemIcon className="size-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{t("netWorth.assetsShort")}</span>
                  <Amount value={totals.assets} currency="USD" className="font-semibold whitespace-nowrap tabular-nums" /> ›
                </Link>
              )}
            </div>
          )}
          {!loading && gaps.length > 0 && (
            <button
              type="button"
              onClick={onRetryGaps}
              className="mt-2 inline-flex min-h-8 items-center gap-1.5 rounded-full bg-amber-400/25 px-2.5 py-1 text-right text-[13px] font-medium text-white ring-1 ring-amber-200/40"
            >
              <span>{t("netWorth.notCounted", { items: gaps.map((g) => t(`assetGap.${g}`)).join(", ") })}</span>
              {onRetryGaps && <RotateCwIcon className="size-3.5 shrink-0" aria-label={t("widget.retry")} />}
            </button>
          )}
        </div>
      </div>

      {/* A full-width row under the top (founder, 21/10/2026): what is owed (opens the loans with the CBC K-Score) on the
          left, the net worth on the right — the balances and the assets at the rate, minus the loans. With assets and no
          loans, the net worth alone. */}
      {!loading && (totals.liabilities > 0 || totals.assets > 0) && (
        <div className={`mt-4 grid ${totals.liabilities > 0 ? "grid-cols-2" : "grid-cols-1"} divide-x divide-white/15 rounded-2xl bg-white/10 py-2.5 ring-1 ring-white/15 backdrop-blur-sm tabular-nums`}>
          {totals.liabilities > 0 && (
            <Link href="/debts?tab=PAYABLE#credit-health" className="min-w-0 px-3 transition-opacity hover:opacity-90">
              <span className="flex items-center gap-1 text-[12px] text-white/75">
                <TrendingDownIcon className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{t("netWorth.loans")} ›</span>
              </span>
              <span className="block truncate text-[15px] font-semibold">
                −<Amount value={totals.liabilities} currency="USD" />
              </span>
            </Link>
          )}
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
