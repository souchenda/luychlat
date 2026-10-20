"use client"

import { CalculatorIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { islamicMarket, riel, usd, zakatNote } from "@/lib/islamic/market"
import { useMarket } from "@/lib/market"

const cambodiaToday = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10)
const ddmm = (iso: string) => iso.split("-").reverse().join("/")

/**
 * «ហាងឆេង និងនីស៊បមាសហ្សាកាត់» (founder, 20/10/2026), above the Zakat calculator on /islamic: the NBC dollar rate,
 * the Saudi riyal, gold per gram / chi / damlung and the Zakat Nisab of 85 g of gold — and one tap to use today's gold
 * price in the calculator below (lib/islamic/market.ts; the same figures as the @LuyChlatIslamic bulletin).
 */
export function IslamicMarketCard({ onUseGoldPrice, busy }: { onUseGoldPrice: (perGram: number) => void; busy?: boolean }) {
  const m = islamicMarket(useMarket().data ?? null, cambodiaToday())

  return (
    <Card className="gap-3 px-4 py-4" data-testid="islamic-market-card">
      <div>
        <h2 className="text-sm font-semibold">🌙 ហាងឆេង និងនីស៊បមាសហ្សាកាត់</h2>
        <p className="text-xs text-muted-foreground">អត្រាផ្លូវការ NBC ប្រាក់អារ៉ាប់ និងតម្លៃមាស សម្រាប់គណនាហ្សាកាត់</p>
      </div>

      {m.usdKhr ? (
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-xl bg-muted/60 px-2 py-2.5">
            <p className="text-[11px] text-muted-foreground">💵 NBC{m.rateDate ? ` · ${ddmm(m.rateDate)}` : ""}</p>
            <p className="text-base font-semibold tabular-nums">1 USD = {riel(m.usdKhr)}</p>
          </div>
          <div className="rounded-xl bg-muted/60 px-2 py-2.5">
            <p className="text-[11px] text-muted-foreground">🇸🇦 1 USD = 3.75 SAR</p>
            <p className="text-base font-semibold tabular-nums">1 SAR ≈ {riel(m.sarKhr!)}</p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">កំពុងទាញអត្រា NBC…</p>
      )}

      {m.gold && m.nisab ? (
        <>
          <div className="space-y-1 rounded-xl bg-amber-500/10 px-3 py-2.5 text-sm">
            <p className="text-[11px] text-muted-foreground">
              🥇 {m.gold.source === "local" ? "មាសគីឡូ ភ្នំពេញ" : "តម្លៃមាសអន្តរជាតិ"}
              {m.gold.date ? ` · ${ddmm(m.gold.date)}` : ""}
            </p>
            <p className="tabular-nums">
              ១ ក្រាម ≈ <b>{usd(m.gold.perGram, 2)}</b> · ១ ជី ≈ {usd(m.gold.perChi)} · ១ តម្លឹង ≈ {usd(m.gold.perDamlung)}
            </p>
          </div>
          <div className="rounded-xl bg-emerald-500/10 px-3 py-3 text-center">
            <p className="text-[11px] text-muted-foreground">កម្រិតនីស៊បហ្សាកាត់ (Zakat Nisab · មាស ៨៥ ក្រាម)</p>
            <p className="text-lg font-semibold tabular-nums" data-testid="islamic-nisab">
              {usd(m.nisab.usd)}
              {m.nisab.khr ? <span className="text-sm font-normal text-muted-foreground"> (~{riel(m.nisab.khr)})</span> : null}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">ℹ️ {zakatNote("app")}</p>
          <Button type="button" variant="outline" className="h-11 w-full" disabled={busy} onClick={() => onUseGoldPrice(m.gold!.perGram)}>
            <CalculatorIcon />
            យកតម្លៃនីស៊បនេះទៅគណនាហ្សាកាត់
          </Button>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">កំពុងទាញតម្លៃមាស…</p>
      )}
    </Card>
  )
}
