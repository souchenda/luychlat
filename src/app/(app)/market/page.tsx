"use client"

import { format } from "date-fns"
import { ChevronDownIcon, Loader2Icon, RefreshCwIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { CurrencyConverter } from "@/components/market/currency-converter"
import { nbcShortDate, NbcStamp } from "@/components/market/nbc-stamp"
import { SettingsGroup, SettingsSubHeader } from "@/components/settings/settings-ui"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { HUN_PER_CHI, HUN_PER_DAMLUNG } from "@/lib/gold"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { useMarket, useRefreshMarket } from "@/lib/market"
import { NBC_CURRENCIES } from "@/lib/market-calc"
import { cn } from "@/lib/utils"
import { useLocaleStore } from "@/stores/locale-store"

/** Shown before "Show more": the currencies most used in Cambodia. */
const POPULAR = 5

const KINDS = ["GOLD_BAR", "GOLD_24K", "GOLD_18K", "GOLD_14K", "PLATINUM"] as const
type Kind = (typeof KINDS)[number]

const money = (n: number, digits = 2) => new Intl.NumberFormat("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n)
const kmDigits = (s: string) => s.replace(/\d/g, (d) => "០១២៣៤៥៦៧៨៩"[Number(d)])

/** Market rates: NBC official exchange rates, gold / platinum reference prices per damlung, and a calculator. */
export default function MarketPage() {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const { data: market, isLoading } = useMarket()
  const refresh = useRefreshMarket()
  const [kind, setKind] = useState<Kind>("GOLD_24K")
  const [weight, setWeight] = useState({ damlung: "1", chi: "", hun: "" })
  const [allCurrencies, setAllCurrencies] = useState(false)

  const usdKhr = market?.nbc?.usd_khr ?? 0
  const reference = market?.gold?.reference ?? {}
  const when = (iso?: string) => {
    if (!iso) return ""
    const text = format(new Date(iso), "HH:mm · dd/MM/yyyy")
    return locale === "km" ? kmDigits(text) : text
  }
  const num = (v: string) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0)
  const hun = num(weight.damlung) * HUN_PER_DAMLUNG + num(weight.chi) * HUN_PER_CHI + num(weight.hun)
  const rate = reference[kind] ?? 0
  const value = (hun / HUN_PER_DAMLUNG) * rate

  return (
    <div className="space-y-6 pb-10">
      <SettingsSubHeader title={t("market.title")} back="/home" />

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{market?.fetched_at ? t("market.updated", { time: when(market.fetched_at) }) : t("market.unavailable")}</p>
        <Button
          size="sm"
          variant="outline"
          className="rounded-full"
          disabled={refresh.isPending}
          onClick={() => refresh.mutate(undefined, { onSuccess: () => toast.success(t("market.refreshed")), onError: () => toast.error(t("common.error")) })}
        >
          {refresh.isPending ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
          {t("market.refresh")}
        </Button>
      </div>

      {isLoading && <Loader2Icon className="mx-auto size-6 animate-spin text-muted-foreground" />}

      {/* Any pair, converted through riel on today's NBC rates. */}
      {market?.nbc && <CurrencyConverter khrPer={market.nbc.khr_per} locale={locale} asOf={nbcShortDate(market.nbc, locale)} />}

      {market?.nbc && (
        <SettingsGroup title={t("market.nbc")}>
          <div className="px-4 pt-3">
            <NbcStamp nbc={market.nbc} fetchedAt={market.fetched_at} locale={locale} />
          </div>
          <div className="flex items-center px-4 py-2 text-xs text-muted-foreground">
            <span className="flex-1">{t("market.currency")}</span>
            <span>{t("market.khrPerUnit")}</span>
          </div>
          {NBC_CURRENCIES.filter((c) => market.nbc!.khr_per[c])
            .filter((_, i) => allCurrencies || i < POPULAR)
            .map((c) => (
            <div key={c} className={cn("flex items-center px-4 py-2.5 text-sm", c === "USD" && "bg-primary/5")}>
              <span className={cn("flex-1", c === "USD" && "font-semibold")}>1 {c}</span>
              <span className="font-semibold tabular-nums">{money(market.nbc!.khr_per[c], market.nbc!.khr_per[c] >= 100 ? 0 : market.nbc!.khr_per[c] >= 1 ? 2 : 3)}៛</span>
            </div>
          ))}
          {NBC_CURRENCIES.filter((c) => market.nbc!.khr_per[c]).length > POPULAR && (
            <button
              type="button"
              onClick={() => setAllCurrencies((v) => !v)}
              aria-expanded={allCurrencies}
              className="flex w-full items-center justify-center gap-1 px-4 py-2.5 text-xs font-medium text-primary transition-colors hover:bg-muted/60"
            >
              {t(allCurrencies ? "market.showLess" : "market.showMore")}
              <ChevronDownIcon className={cn("size-4 transition-transform", allCurrencies && "rotate-180")} aria-hidden />
            </button>
          )}
        </SettingsGroup>
      )}

      {market?.local_gold && (
        <SettingsGroup title={t("market.localTitle")}>
          <div className="flex items-center px-4 py-2 text-xs text-muted-foreground">
            <span className="flex-1">{t("market.perDamlungHeader")}</span>
            <span className="w-24 text-right">{t("market.sell")}</span>
            <span className="w-24 text-right">{t("market.buy")}</span>
          </div>
          {(
            [
              ["market.kiloGold", market.local_gold.kilo],
              ["market.jewelryGold", market.local_gold.jewelry],
            ] as const
          ).map(([label, p]) =>
            p ? (
              <div key={label} className="flex items-center px-4 py-2.5 text-sm">
                <span className="flex-1 font-medium">{t(label)}</span>
                <span className="w-24 text-right font-semibold tabular-nums">${money(p.sell, 0)}</span>
                <span className="w-24 text-right font-semibold tabular-nums">${money(p.buy, 0)}</span>
              </div>
            ) : null,
          )}
          <p className="px-4 py-2.5 text-xs text-muted-foreground">
            {t("market.localDate", { date: locale === "km" ? kmDigits(market.local_gold.date.split("-").reverse().join("/")) : market.local_gold.date })} ·{" "}
            {market.local_gold.source === "csnj" && market.local_gold.url ? (
              <a href={market.local_gold.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">
                {t("market.localSourceCsnj")}
              </a>
            ) : (
              t("market.localSourceManual")
            )}
          </p>
        </SettingsGroup>
      )}

      {market?.gold && (
        <SettingsGroup title={t("market.calculator")}>
          <div className="space-y-3 px-4 py-3">
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("market.purity")}>
              {KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={kind === k}
                  onClick={() => setKind(k)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    kind === k ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {t(`market.kind.${k}` as MessageKey).split(" (")[0]}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(["damlung", "chi", "hun"] as const).map((unit) => (
                <label key={unit} className="space-y-1">
                  <span className="block text-xs text-muted-foreground">{t(`gold.unit.${unit}` as MessageKey)}</span>
                  <Input
                    inputMode="decimal"
                    className="h-10 text-right tabular-nums"
                    value={weight[unit]}
                    placeholder="0"
                    onChange={(e) => setWeight((w) => ({ ...w, [unit]: e.target.value.replace(/[^\d.]/g, "") }))}
                  />
                </label>
              ))}
            </div>
            <div className="flex items-baseline justify-between rounded-xl bg-muted/60 px-3 py-2.5">
              <span className="text-xs text-muted-foreground">{t("market.value")}</span>
              <span className="text-right">
                <span className="block text-lg font-bold tabular-nums">${money(value)}</span>
                {usdKhr > 0 && <span className="block text-xs text-muted-foreground tabular-nums">≈ {money(value * usdKhr, 0)}៛</span>}
              </span>
            </div>
          </div>
        </SettingsGroup>
      )}

      {market?.gold && (
        <SettingsGroup title={t("market.reference")}>
          <div className="grid grid-cols-2 gap-3 px-4 py-3">
            <div>
              <p className="text-xs text-muted-foreground">
                {t("market.gold")} · {t("market.spot")}
              </p>
              <p className="text-base font-bold tabular-nums">${money(market.gold.gold_spot)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                {t("market.platinum")} · {t("market.spot")}
              </p>
              <p className="text-base font-bold tabular-nums">${money(market.gold.platinum_spot)}</p>
            </div>
          </div>
          {KINDS.map((k) => {
            const usd = reference[k]
            if (!usd) return null
            return (
              <div key={k} className="flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1 text-sm">{t(`market.kind.${k}` as MessageKey)}</span>
                <span className="text-right">
                  <span className="block text-sm font-semibold tabular-nums">
                    ${money(usd)}
                    <span className="text-xs font-normal text-muted-foreground">{t("market.perDamlung")}</span>
                  </span>
                  {usdKhr > 0 && <span className="block text-xs text-muted-foreground tabular-nums">≈ {money(usd * usdKhr, 0)}៛</span>}
                </span>
              </div>
            )
          })}
          <p className="px-4 py-2.5 text-xs text-muted-foreground">
            {t("market.referenceHint")}
          </p>
        </SettingsGroup>
      )}

      <p className="text-center text-xs text-muted-foreground">{t("market.source")}</p>
    </div>
  )
}
