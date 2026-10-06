"use client"

import { ArrowUpDownIcon } from "lucide-react"
import { useState } from "react"

import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useT } from "@/lib/i18n/use-t"
import { cn } from "@/lib/utils"
import { type Locale } from "@/lib/i18n/dictionaries"

const PAIRS: [string, string][] = [
  ["USD", "KHR"],
  ["KHR", "USD"],
  ["MYR", "KHR"],
  ["THB", "KHR"],
]

/**
 * Quick currency converter on today's NBC official rates (KHR per 1 unit of
 * each currency, from the market sync). Any pair converts through riel.
 */
export function CurrencyConverter({ khrPer, locale, asOf }: { khrPer: Record<string, number>; locale: Locale; asOf?: string }) {
  const t = useT()
  const rates: Record<string, number> = { ...khrPer, KHR: 1 }
  const codes = Object.keys(rates)
  const [amount, setAmount] = useState("100")
  const [from, setFrom] = useState("USD")
  const [to, setTo] = useState("KHR")

  const value = Number(amount.replace(/,/g, "")) || 0
  const rate = (rates[from] ?? 1) / (rates[to] ?? 1)
  const converted = value * rate
  const digits = (code: string, n: number) => (code === "KHR" || n >= 1000 ? 0 : n >= 1 ? 2 : 4)
  const format = (n: number, code: string) => n.toLocaleString("en-US", { maximumFractionDigits: digits(code, n) })
  const one = locale === "km" ? "១" : "1"

  const currencySelect = (current: string, set: (code: string) => void, label: string) => (
    <Select value={current} onValueChange={set}>
      <SelectTrigger size="sm" className="h-9 w-[5.5rem] shrink-0 border-0 bg-background text-xs font-semibold shadow-xs" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {codes.map((code) => (
          <SelectItem key={code} value={code}>
            {code}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  // Compact: two rows (amount + currency, result + currency) with the swap between them.
  return (
    <section className="space-y-2.5 rounded-2xl border bg-card p-3.5 shadow-xs">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="shrink-0 text-sm font-bold">{t("market.converter")}</h2>
        <span className="min-w-0 truncate text-right text-[11px] text-muted-foreground tabular-nums">
          {one} {from} = {rate.toLocaleString("en-US", { maximumFractionDigits: rate >= 100 ? 2 : 4 })} {to}
          {asOf && ` · ${t("market.nbcRate")} ${asOf}`}
        </span>
      </div>

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1">
        {PAIRS.map(([a, b]) => (
          <button
            key={`${a}${b}`}
            type="button"
            onClick={() => {
              setFrom(a)
              setTo(b)
            }}
            className={cn(
              "shrink-0 rounded-full border px-2.5 py-0.5 text-xs transition-colors",
              from === a && to === b ? "border-primary bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {a} ⇄ {b}
          </button>
        ))}
      </div>

      <div className="relative overflow-hidden rounded-xl border">
        <div className="flex items-center gap-2 bg-muted/40 py-1.5 pr-1.5 pl-3">
          <label htmlFor="convert-amount" className="sr-only">
            {t("market.amount")}
          </label>
          <Input
            id="convert-amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}
            className="h-9 min-w-0 flex-1 border-0 bg-transparent px-0 text-lg font-bold shadow-none focus-visible:ring-0 dark:bg-transparent"
            placeholder="0"
          />
          {currencySelect(from, setFrom, t("market.from"))}
        </div>
        <div className="flex items-center gap-2 border-t bg-primary/5 py-1.5 pr-1.5 pl-3">
          <p className="min-w-0 flex-1 truncate text-lg font-extrabold text-primary tabular-nums" aria-live="polite">
            <span className="sr-only">{t("market.youGet")} </span>
            {format(converted, to)}
          </p>
          {currencySelect(to, setTo, t("market.to"))}
        </div>
        <button
          type="button"
          onClick={() => {
            setFrom(to)
            setTo(from)
          }}
          className="absolute top-1/2 right-[6.75rem] flex size-7 -translate-y-1/2 items-center justify-center rounded-full border border-primary/30 bg-background text-primary shadow-sm transition-transform active:rotate-180"
          aria-label={t("market.swap")}
          title={t("market.swap")}
        >
          <ArrowUpDownIcon className="size-3.5" />
        </button>
      </div>
    </section>
  )
}
