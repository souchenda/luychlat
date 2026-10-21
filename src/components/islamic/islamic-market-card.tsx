"use client"

import { CalculatorIcon } from "lucide-react"
import { useState } from "react"

import { Segmented } from "@/components/common/segmented"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { goldReference, goldUnitsLine, islamicMarket, khmerGoldWeight, nisabCheck, riel, usd, zakatNote, type IslamicMarket } from "@/lib/islamic/market"
import { NISAB_GOLD_GRAMS } from "@/lib/islamic"
import { useMarket } from "@/lib/market"
import { parseAmount } from "@/lib/money"
import { latinDigits } from "@/lib/dates"

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
              🥇 ហាងឆេងមាស 24K{m.gold.date ? ` · ${ddmm(m.gold.date)}` : ""}
            </p>
            {/* Cambodian units first, the gram in brackets (founder, 21/10/2026). */}
            <p className="font-medium tabular-nums">{latinDigits(goldUnitsLine(m.gold))}</p>
            <p className="text-[11px] text-muted-foreground">{latinDigits(goldReference(m.gold.source))}</p>
          </div>
          <div className="rounded-xl bg-emerald-500/10 px-3 py-3 text-center">
            <p className="text-[11px] text-muted-foreground">
              កម្រិតនីស៊បហ្សាកាត់ (Zakat Nisab · មាស 85 ក្រាម ≈ {latinDigits(khmerGoldWeight(NISAB_GOLD_GRAMS))})
            </p>
            <p className="text-lg font-semibold tabular-nums" data-testid="islamic-nisab">
              {usd(m.nisab.usd)}
              {m.nisab.khr ? <span className="text-sm font-normal text-muted-foreground"> (~{riel(m.nisab.khr)})</span> : null}
            </p>
          </div>
          <NisabQuickCheck m={m} />
          <p className="text-xs text-muted-foreground">ℹ️ {latinDigits(zakatNote("app"))}</p>
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

/**
 * The quick check (founder, 21/10/2026): type your net savings in $ or ៛ — does it reach today's Nisab, and the 2.5%
 * Zakat due (lib/islamic/market.ts nisabCheck). Nothing is saved; the full calculator below uses your wallets.
 */
function NisabQuickCheck({ m }: { m: IslamicMarket }) {
  const [text, setText] = useState("")
  const [currency, setCurrency] = useState<"USD" | "KHR">("USD")
  const amount = parseAmount(text)
  const r = text.trim() && amount > 0 ? nisabCheck(m, amount, currency) : null
  return (
    <div className="space-y-2 rounded-xl border px-3 py-3" data-testid="nisab-quick-check">
      <p className="text-sm font-medium">🧮 ពិនិត្យរហ័ស៖ ទ្រព្យសន្សំសុទ្ធរបស់លោកអ្នក</p>
      <div className="flex gap-2">
        <Input
          inputMode="decimal"
          className="h-11 flex-1 tabular-nums"
          placeholder={currency === "USD" ? "ឧ. 12,000" : "ឧ. 48,000,000"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="ទ្រព្យសន្សំសុទ្ធ"
        />
        <Segmented
          value={currency}
          onChange={setCurrency}
          options={[
            { value: "USD", label: "$" },
            { value: "KHR", label: "៛" },
          ]}
          aria-label="រូបិយប័ណ្ណ"
        />
      </div>
      {r ? (
        r.meets ? (
          <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm" data-testid="nisab-result">
            ✅ ដល់កម្រិតនីស៊ប — ហ្សាកាត់ 2.5% ≈{" "}
            <b className="tabular-nums">
              {currency === "KHR" && r.zakatKhr !== null ? riel(r.zakatKhr) : usd(r.zakatUsd, 2)}
            </b>
            {currency === "KHR" ? <span className="text-muted-foreground"> (~{usd(r.zakatUsd, 2)})</span> : r.zakatKhr ? <span className="text-muted-foreground"> (~{riel(r.zakatKhr)})</span> : null}
          </p>
        ) : (
          <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm" data-testid="nisab-result">
            មិនទាន់ដល់កម្រិតនីស៊បទេ — ខ្វះប្រហែល <b className="tabular-nums">{usd(Math.max(0, m.nisab!.usd - r.usd))}</b>
          </p>
        )
      ) : null}
    </div>
  )
}
