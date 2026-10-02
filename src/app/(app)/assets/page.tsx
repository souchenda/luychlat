"use client"

import { format, parseISO } from "date-fns"
import { CoinsIcon, HouseIcon, LandmarkIcon, PlusIcon, TrendingDownIcon, TrendingUpIcon } from "lucide-react"
import { useMemo, useState } from "react"

import { AssetFormSheet } from "@/components/gold/asset-form-sheet"
import { GoldFormSheet } from "@/components/gold/gold-form-sheet"
import { DiamondsSection } from "@/components/gold/diamonds-section"
import { InvestmentsTab } from "@/components/gold/investments-tab"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ASSET_EMOJI, assetEquity, type PhysicalAsset } from "@/lib/assets"
import { usePhysicalAssets } from "@/lib/assets-data"
import { canWrite, useActiveWorkspace, useDebts } from "@/lib/data/hooks"
import { formatWeight, HUN_PER_CHI, HUN_PER_DAMLUNG, holdingPnl, hunToGrams, PLATINUM_GRADES, portfolio, rateFor, type GoldKind, type PlatinumGrade } from "@/lib/gold"
import { useGoldHoldings, useGoldRates, type GoldHolding } from "@/lib/gold-data"
import { useAssetsTotal } from "@/lib/assets-total"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney } from "@/lib/money"
import { cn } from "@/lib/utils"
import { useLocaleStore } from "@/stores/locale-store"
import { usePrefsStore } from "@/stores/prefs-store"

type TabKey = "gold" | "invest" | "property"
/** Rows of the daily-rates table: the gold kinds, then each platinum grade. */
const RATE_ROWS: { kind: GoldKind; grade: PlatinumGrade | null }[] = [
  { kind: "GOLD_BAR", grade: null },
  { kind: "GOLD_24K", grade: null },
  { kind: "GOLD_18K", grade: null },
  ...PLATINUM_GRADES.map((grade) => ({ kind: "PLATINUM" as GoldKind, grade })),
]
const TABS: { key: TabKey; label: MessageKey; emoji: string }[] = [
  { key: "gold", label: "assets.tab.gold", emoji: "🪙" },
  { key: "invest", label: "assets.tab.invest", emoji: "📈" },
  { key: "property", label: "assets.tab.property", emoji: "🏠" },
]

/** "+$200.00 (+5%)" in green, "-$200.00 (-6.7%)" in red. */
function Pnl({ profit, percent, hidden, className }: { profit: number; percent: number | null; hidden: boolean; className?: string }) {
  const up = profit >= 0
  const Icon = up ? TrendingUpIcon : TrendingDownIcon
  return (
    <span className={cn("inline-flex items-center gap-1 font-semibold tabular-nums", up ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400", className)}>
      <Icon className="size-4" aria-hidden />
      {formatMoney(profit, "USD", { hidden, signed: true })}
      {percent !== null && !hidden && ` (${percent > 0 ? "+" : ""}${percent}%)`}
    </span>
  )
}

/** Assets: gold & platinum (value, unrealized profit / loss, today's rates) and land, houses, vehicles… with net equity. */
export default function AssetsPage() {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const { khrPerUsd, hideBalances } = usePrefsStore()
  const { workspace } = useActiveWorkspace()
  const ws = workspace?.id
  const editable = canWrite(workspace)
  const holdingsQuery = useGoldHoldings(ws)
  const holdings = useMemo(() => holdingsQuery.data ?? [], [holdingsQuery.data])
  const { rates, updatedAt } = useGoldRates()
  const total = useMemo(() => portfolio(holdings, rates, khrPerUsd), [holdings, rates, khrPerUsd])
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<GoldHolding | null>(null)
  const assetsQuery = usePhysicalAssets(ws)
  const assets = useMemo(() => assetsQuery.data ?? [], [assetsQuery.data])
  const debts = useDebts(ws).data ?? []
  // Same total as net worth on Home (gold, diamonds at resale value, investments, property).
  const all = useAssetsTotal(ws)
  const [active, setActive] = useState<TabKey>(() => {
    if (typeof window === "undefined") return "gold"
    const hash = window.location.hash.slice(1)
    return hash === "invest" || hash === "property" ? hash : "gold"
  })
  const [assetOpen, setAssetOpen] = useState(false)
  const [editingAsset, setEditingAsset] = useState<PhysicalAsset | null>(null)
  const openAsset = (a: PhysicalAsset | null) => {
    setEditingAsset(a)
    setAssetOpen(true)
  }
  const money = (n: number) => formatMoney(n, "USD", { hidden: hideBalances })

  const open = (h: GoldHolding | null) => {
    setEditing(h)
    setFormOpen(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <LandmarkIcon className="size-5 text-primary" aria-hidden />
          {t("assets.pageTitle")}
        </h1>
      </div>

      <Card className="gap-1 px-4 py-4">
        <p className="text-sm text-muted-foreground">{t("assets.total")}</p>
        <p className="text-3xl font-bold tabular-nums">{money(all.totalUsd)}</p>
        <p className="text-xs text-muted-foreground">
          🪙 {money(all.goldUsd)} · 💎 {money(all.diamondUsd)} · 📈 {money(all.investUsd)} · 🏠 {money(all.propertyUsd)} — {t("assets.inNetWorth")}
        </p>
      </Card>

      {/* Tabs: gold · stocks & crypto · real estate & vehicles */}
      <div role="tablist" aria-label={t("assets.pageTitle")} className="grid grid-cols-3 gap-1 rounded-2xl bg-muted p-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active === tab.key}
            onClick={() => setActive(tab.key)}
            className={cn(
              "flex flex-col items-center gap-0.5 rounded-xl px-1 py-2 text-[11px] font-medium leading-tight transition-colors",
              active === tab.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
            )}
          >
            <span className="text-base" aria-hidden>
              {tab.emoji}
            </span>
            <span className="text-center">{t(tab.label)}</span>
          </button>
        ))}
      </div>

      {active === "gold" && (
        <>
          <div className="flex items-center justify-between gap-2 px-1 pt-1">
            <h2 className="flex items-center gap-1.5 font-semibold">
              <CoinsIcon className="size-4 text-amber-500" aria-hidden />
              {t("gold.pageTitle")}
            </h2>
            {editable && (
              <Button size="sm" variant="outline" onClick={() => open(null)}>
                <PlusIcon />
                {t("gold.add")}
              </Button>
            )}
          </div>

          {/* Portfolio */}
          <Card className="gap-3 border-amber-500/30 bg-linear-to-br from-amber-500 via-amber-500 to-yellow-600 px-4 py-4 text-white">
            <div>
              <p className="text-sm text-white/85">{t("gold.currentValue")}</p>
              <p className="text-3xl font-bold tabular-nums">{money(total.value)}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-white/80">{t("gold.totalWeight")}</p>
                <p className="font-semibold">{formatWeight(total.totalHun, locale)}</p>
                <p className="text-xs text-white/80">{total.grams} g</p>
              </div>
              <div>
                <p className="text-xs text-white/80">{t("gold.unrealized")}</p>
                {total.cost > 0 ? (
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2 py-0.5 font-semibold tabular-nums",
                      total.profit >= 0 ? "bg-emerald-600/80" : "bg-rose-600/85",
                    )}
                  >
                    {formatMoney(total.profit, "USD", { hidden: hideBalances, signed: true })}
                    {total.percent !== null && !hideBalances && ` (${total.percent > 0 ? "+" : ""}${total.percent}%)`}
                  </span>
                ) : (
                  <p className="text-xs text-white/80">—</p>
                )}
              </div>
            </div>
            {total.unpriced > 0 && <p className="text-[11px] text-white/85">{t("gold.unpriced", { count: total.unpriced })}</p>}
          </Card>

          {/* Market rates */}
          <section className="space-y-2">
            <div className="flex items-baseline justify-between px-1">
              <h2 className="text-sm font-medium text-muted-foreground">{t("gold.rates")}</h2>
              {updatedAt && <span className="text-[11px] text-muted-foreground">{t("gold.updated", { date: format(new Date(updatedAt), "dd/MM/yyyy HH:mm") })}</span>}
            </div>
            <Card className="gap-0 py-0">
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 border-b px-4 py-2 text-[11px] font-medium text-muted-foreground">
                <span />
                <span className="text-right">{t("gold.perDamlung")}</span>
                <span className="text-right">{t("gold.perChi")}</span>
              </div>
              {RATE_ROWS.map(({ kind, grade }) => {
                const rate = rateFor(kind, grade, rates)
                return (
                  <div key={`${kind}-${grade ?? ""}`} className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 border-b px-4 py-2 text-sm last:border-b-0">
                    <span>{grade ? `${t("gold.kind.PLATINUM")} ${t(`gold.grade.${grade}` as MessageKey)}` : t(`gold.kind.${kind}` as MessageKey)}</span>
                    <span className="text-right font-semibold tabular-nums">{rate ? formatMoney(rate, "USD") : "—"}</span>
                    <span className="text-right text-muted-foreground tabular-nums">{rate ? formatMoney((rate * HUN_PER_CHI) / HUN_PER_DAMLUNG, "USD") : "—"}</span>
                  </div>
                )
              })}
            </Card>
            {!Object.keys(rates).length && <p className="px-1 text-xs text-muted-foreground">{t("gold.noRates")}</p>}
          </section>

          {/* Holdings */}
          <section className="space-y-2">
            <h2 className="px-1 text-sm font-medium text-muted-foreground">{t("gold.holdings")}</h2>
            {holdingsQuery.isLoading ? (
              <Skeleton className="h-32 w-full rounded-xl" />
            ) : holdings.length === 0 ? (
              <Card className="items-center gap-2 px-6 py-8 text-center">
                <span className="text-4xl" aria-hidden>
                  🪙
                </span>
                <p className="font-medium">{t("gold.empty")}</p>
                <p className="text-sm text-muted-foreground">{t("gold.emptyHint")}</p>
                {editable && (
                  <Button onClick={() => open(null)}>
                    <PlusIcon />
                    {t("gold.add")}
                  </Button>
                )}
              </Card>
            ) : (
              <ul className="space-y-2">
                {holdings.map((h) => {
                  const p = holdingPnl(h, rates, khrPerUsd)
                  return (
                    <li key={h.id}>
                      <button type="button" onClick={() => editable && open(h)} disabled={!editable} className="block w-full text-left">
                        <Card className="gap-2 px-4 py-3 transition-colors hover:bg-muted/40">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-semibold">{h.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {t(`gold.kind.${h.kind}` as MessageKey)}
                                {h.grade && ` ${t(`gold.grade.${h.grade}` as MessageKey)}`}
                                {h.jewelry_type && ` · ${t(`gold.jewelry.${h.jewelry_type}` as MessageKey)}`} · {formatWeight(h.weight_hun, locale)} ·{" "}
                                {hunToGrams(h.weight_hun)} g
                              </p>
                            </div>
                            <span className="shrink-0 text-right">
                              <span className="block font-semibold tabular-nums">{p.value !== null ? money(p.value) : "—"}</span>
                              <span className="block text-[11px] text-muted-foreground">{t("gold.now")}</span>
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-3 border-t pt-2 text-xs">
                            <span className="text-muted-foreground">
                              {p.cost !== null ? t("gold.boughtFor", { amount: money(p.cost) }) : t("gold.noCost")}
                              {h.purchase_date ? ` · ${format(parseISO(h.purchase_date), "dd/MM/yyyy")}` : ""}
                            </span>
                            {p.profit !== null && <Pnl profit={p.profit} percent={p.percent} hidden={hideBalances} className="text-xs" />}
                          </div>
                        </Card>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <p className="px-1 text-[11px] text-muted-foreground">{t("gold.unitsNote")}</p>

          <DiamondsSection workspaceId={ws} editable={editable} />
        </>
      )}

      {active === "invest" && <InvestmentsTab workspaceId={ws} editable={editable} />}

      {active === "property" && (
        <>
          {/* Land, houses, vehicles, machinery */}
          <div className="flex items-center justify-between gap-2 px-1 pt-2">
            <h2 className="flex items-center gap-1.5 font-semibold">
              <HouseIcon className="size-4 text-primary" aria-hidden />
              {t("assets.physical")}
            </h2>
            {editable && (
              <Button size="sm" variant="outline" onClick={() => openAsset(null)}>
                <PlusIcon />
                {t("assets.add")}
              </Button>
            )}
          </div>
          {assetsQuery.isLoading ? (
            <Skeleton className="h-24 w-full rounded-xl" />
          ) : assets.length === 0 ? (
            <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">{t("assets.empty")}</p>
          ) : (
            <ul className="space-y-2">
              {assets.map((a) => {
                const loan = debts.find((d) => d.id === a.debt_id)
                const eq = assetEquity(a, loan, khrPerUsd)
                const fmt = (n: number) => formatMoney(n, a.currency, { hidden: hideBalances })
                return (
                  <li key={a.id}>
                    <button type="button" onClick={() => editable && openAsset(a)} disabled={!editable} className="block w-full text-left">
                      <Card className="gap-2 px-4 py-3 transition-colors hover:bg-muted/40">
                        <div className="flex items-start gap-3">
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-xl" aria-hidden>
                            {ASSET_EMOJI[a.kind]}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold">{a.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {t(`assets.kind.${a.kind}` as MessageKey)}
                              {a.purchase_date ? ` · ${format(parseISO(a.purchase_date), "yyyy")}` : ""}
                            </p>
                          </div>
                          <span className="shrink-0 text-right">
                            <span className="block font-semibold tabular-nums">{fmt(a.estimated_value)}</span>
                            <span className="block text-[11px] text-muted-foreground">{t("assets.estimated")}</span>
                          </span>
                        </div>
                        {loan && (
                          <div className="space-y-1.5 border-t pt-2 text-xs">
                            <div className="flex justify-between gap-2 text-muted-foreground">
                              <span className="truncate">{t("assets.loanLeft", { name: loan.party_name })}</span>
                              <span className="shrink-0 tabular-nums text-rose-600 dark:text-rose-400">−{fmt(eq.owed)}</span>
                            </div>
                            <div className="flex justify-between gap-2 font-semibold">
                              <span>{t("assets.equity")}</span>
                              <span className={cn("tabular-nums", eq.equity < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400")}>
                                {fmt(eq.equity)}
                              </span>
                            </div>
                            <div
                              className="h-1.5 overflow-hidden rounded-full bg-muted"
                              role="progressbar"
                              aria-valuenow={eq.ownedPercent}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-label={t("assets.owned", { percent: eq.ownedPercent })}
                            >
                              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${eq.ownedPercent}%` }} />
                            </div>
                            <p className="text-[11px] text-muted-foreground">{t("assets.owned", { percent: eq.ownedPercent })}</p>
                          </div>
                        )}
                      </Card>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}

      <GoldFormSheet open={formOpen} onOpenChange={setFormOpen} workspaceId={ws} holding={editing} rates={rates} />
      <AssetFormSheet open={assetOpen} onOpenChange={setAssetOpen} workspaceId={ws} asset={editingAsset} debts={debts} />
    </div>
  )
}
