"use client"

import { formatDistanceToNowStrict } from "date-fns"
import { BitcoinIcon, CandlestickChartIcon, PlusIcon, TrendingDownIcon, TrendingUpIcon } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { currentPrice, formatQuantity, investmentPnl, investmentTotals, type Investment, type Market } from "@/lib/investments"
import { useInvestments, useMarketPrices } from "@/lib/investments-data"
import { formatMoney } from "@/lib/money"
import { cn } from "@/lib/utils"
import { usePrefsStore } from "@/stores/prefs-store"

import { InvestmentFormSheet } from "./investment-form-sheet"

function Change({ profit, percent, currency, hidden }: { profit: number; percent: number | null; currency: "USD" | "KHR"; hidden: boolean }) {
  const up = profit >= 0
  const Icon = up ? TrendingUpIcon : TrendingDownIcon
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-semibold tabular-nums", up ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
      <Icon className="size-3.5" aria-hidden />
      {formatMoney(profit, currency, { hidden, signed: true })}
      {percent !== null && !hidden && ` (${percent > 0 ? "+" : ""}${percent}%)`}
    </span>
  )
}

/** Tab 2 of Assets: stocks (CSX, international) and crypto with value and unrealized gain / loss. */
export function InvestmentsTab({ workspaceId, editable }: { workspaceId: string | undefined; editable: boolean }) {
  const t = useT()
  const { khrPerUsd, hideBalances } = usePrefsStore()
  const query = useInvestments(workspaceId)
  const holdings = useMemo(() => query.data ?? [], [query.data])
  const { prices, updatedAt } = useMarketPrices()
  const totals = useMemo(() => investmentTotals(holdings, prices, khrPerUsd), [holdings, prices, khrPerUsd])
  const stocks = holdings.filter((h) => h.market !== "CRYPTO")
  const crypto = holdings.filter((h) => h.market === "CRYPTO")
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Investment | null>(null)
  const [market, setMarket] = useState<Market>("STOCK_CSX")
  const open = (h: Investment | null, m: Market = "STOCK_CSX") => {
    setEditing(h)
    setMarket(m)
    setFormOpen(true)
  }

  const row = (h: Investment) => {
    const p = investmentPnl(h, prices, khrPerUsd)
    const { price } = currentPrice(h, prices, khrPerUsd)
    const money = (n: number) => formatMoney(n, h.currency, { hidden: hideBalances })
    return (
      <li key={h.id}>
        <button type="button" onClick={() => editable && open(h, h.market)} disabled={!editable} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40">
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-xl font-mono text-[10px] font-bold",
              h.market === "CRYPTO" ? "bg-orange-500/15 text-orange-700 dark:text-orange-400" : h.market === "STOCK_CSX" ? "bg-sky-500/15 text-sky-700 dark:text-sky-400" : "bg-violet-500/15 text-violet-700 dark:text-violet-400",
            )}
            aria-hidden
          >
            {h.symbol.slice(0, 5)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">
              {h.symbol}
              {h.name && <span className="font-normal text-muted-foreground"> · {h.name}</span>}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {formatQuantity(h.quantity)} × {price !== null ? formatMoney(price, h.currency) : "—"}
              {p.source === "OWN" && h.price_updated_at && ` · ${formatDistanceToNowStrict(new Date(h.price_updated_at))}`}
            </span>
          </span>
          <span className="shrink-0 text-right">
            <span className="block font-semibold tabular-nums">{p.value !== null ? money(p.value) : <span className="text-xs font-normal text-muted-foreground">{t("invest.noPrice")}</span>}</span>
            {p.profit !== null && <Change profit={p.profit} percent={p.percent} currency={h.currency} hidden={hideBalances} />}
          </span>
        </button>
      </li>
    )
  }

  const section = (title: MessageKey, Icon: typeof BitcoinIcon, list: Investment[], addMarket: Market) => (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <h3 className="flex items-center gap-1.5 font-semibold">
          <Icon className="size-4 text-primary" aria-hidden />
          {t(title)}
        </h3>
        {editable && (
          <Button size="sm" variant="outline" onClick={() => open(null, addMarket)}>
            <PlusIcon />
            {t("invest.add")}
          </Button>
        )}
      </div>
      {list.length === 0 ? (
        <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">{t(addMarket === "CRYPTO" ? "invest.emptyCrypto" : "invest.emptyStocks")}</p>
      ) : (
        <Card className="gap-0 py-0">
          <ul className="divide-y">{list.map(row)}</ul>
        </Card>
      )}
    </section>
  )

  return (
    <div className="space-y-4">
      <Card className="gap-2 border-violet-500/30 bg-linear-to-br from-violet-600 to-indigo-700 px-4 py-4 text-white">
        <p className="text-sm text-white/85">{t("invest.portfolioValue")}</p>
        <p className="text-3xl font-bold tabular-nums">{formatMoney(totals.valueUsd, "USD", { hidden: hideBalances })}</p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-white/80">{t("invest.invested", { amount: formatMoney(totals.costUsd, "USD", { hidden: hideBalances }) })}</span>
          {totals.costUsd > 0 && (
            <span className={cn("rounded-full px-2 py-0.5 font-semibold tabular-nums", totals.profitUsd >= 0 ? "bg-emerald-500/80" : "bg-rose-500/85")}>
              {formatMoney(totals.profitUsd, "USD", { hidden: hideBalances, signed: true })}
              {totals.percent !== null && !hideBalances && ` (${totals.percent > 0 ? "+" : ""}${totals.percent}%)`}
            </span>
          )}
        </div>
        {totals.unpriced > 0 && <p className="text-[11px] text-white/85">{t("invest.unpriced", { count: totals.unpriced })}</p>}
      </Card>

      {query.isLoading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : (
        <>
          {section("invest.stocks", CandlestickChartIcon, stocks, "STOCK_CSX")}
          {section("invest.crypto", BitcoinIcon, crypto, "CRYPTO")}
        </>
      )}
      <p className="px-1 text-[11px] text-muted-foreground">
        {t("invest.pricesNote")}
        {updatedAt && ` ${t("gold.updated", { date: new Date(updatedAt).toLocaleDateString("en-GB") })}`}
      </p>

      <InvestmentFormSheet open={formOpen} onOpenChange={setFormOpen} workspaceId={workspaceId} holding={editing} prices={prices} defaultMarket={market} />
    </div>
  )
}
