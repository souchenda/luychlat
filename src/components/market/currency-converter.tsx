"use client"

import { ArrowLeftRightIcon } from "lucide-react"
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
      <SelectTrigger size="sm" className="mt-1 w-full text-xs font-semibold" aria-label={label}>
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

  return (
    <section className="space-y-3 rounded-2xl border bg-card p-4 shadow-xs">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold">{t("market.converter")}</h2>
        <span className="text-[11px] text-muted-foreground">
          {t("market.nbcRate")}
          {asOf && ` · ${asOf}`}
        </span>
      </div>

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {PAIRS.map(([a, b]) => (
          <button
            key={`${a}${b}`}
            type="button"
            onClick={() => {
              setFrom(a)
              setTo(b)
            }}
            className={cn(
              "shrink-0 rounded-full border px-2.5 py-1 text-xs transition-colors",
              from === a && to === b ? "border-primary bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {a} ⇄ {b}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="rounded-xl border bg-muted/40 p-2.5">
          <label htmlFor="convert-amount" className="mb-1 block text-[10px] text-muted-foreground">
            {t("market.amount")}
          </label>
          <Input
            id="convert-amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}
            className="h-8 border-0 bg-transparent px-0 text-base font-bold shadow-none focus-visible:ring-0 dark:bg-transparent"
            placeholder="0"
          />
          {currencySelect(from, setFrom, t("market.from"))}
        </div>

        <button
          type="button"
          onClick={() => {
            setFrom(to)
            setTo(from)
          }}
          className="flex size-8 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary shadow-xs transition-transform active:rotate-180"
          aria-label={t("market.swap")}
          title={t("market.swap")}
        >
          <ArrowLeftRightIcon className="size-4" />
        </button>

        <div className="rounded-xl border border-primary/30 bg-primary/5 p-2.5">
          <p className="mb-1 text-[10px] text-primary">{t("market.youGet")}</p>
          <p className="flex h-8 items-center truncate text-base font-extrabold text-primary tabular-nums" aria-live="polite">
            {format(converted, to)}
          </p>
          {currencySelect(to, setTo, t("market.to"))}
        </div>
      </div>

      <p className="text-center text-[11px] text-muted-foreground tabular-nums">
        {one} {from} = {rate.toLocaleString("en-US", { maximumFractionDigits: rate >= 100 ? 2 : 4 })} {to}
      </p>
    </section>
  )
}
