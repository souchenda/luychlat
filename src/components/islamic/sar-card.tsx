"use client"

import { BanknoteIcon } from "lucide-react"
import { useState } from "react"

import { Segmented } from "@/components/common/segmented"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { convertSar, khrPerSar, SAR_PER_USD, type SarFrom } from "@/lib/islamic/sar"
import { useMarket } from "@/lib/market"
import { parseAmount } from "@/lib/money"

const fmt = (n: number, digits = 2) => n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 })

/**
 * «🇸🇦 ហាងឆេងលុយអារ៉ាប់» (founder, 19/10/2026): the Saudi riyal for pilgrims — the NBC dollar rate ÷ 3.75 (the
 * official peg) and a small converter. On /islamic only (Islamic Mode), never the general rates (lib/islamic/sar.ts).
 */
export function SarCard() {
  const nbc = useMarket().data?.nbc
  const [from, setFrom] = useState<SarFrom>("USD")
  const [text, setText] = useState("100")
  const usdKhr = nbc?.usd_khr ?? 0
  const result = usdKhr > 0 ? convertSar(parseAmount(text), from, usdKhr) : null
  const outputs = result
    ? ([
        ["SAR", `${fmt(result.sar)} SAR`],
        ["USD", `$${fmt(result.usd)}`],
        ["KHR", `${fmt(result.khr, 0)} ៛`],
      ] as const).filter(([k]) => k !== from)
    : []

  return (
    <Card className="gap-3 px-4 py-4">
      <div>
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <BanknoteIcon className="size-4 shrink-0 text-amber-500" aria-hidden />
          ហាងឆេងលុយអារ៉ាប់ (SAR - Saudi Riyal)</h2>
        <p className="text-xs text-muted-foreground">សម្រាប់អ្នកធ្វើដំណើរទៅធ្វើរូកូន ហាជ និងអ៊ុំរ៉ោះ</p>
      </div>
      {usdKhr > 0 ? (
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-xl bg-emerald-500/10 px-2 py-2.5">
            <p className="text-[11px] text-muted-foreground">1 SAR ≈</p>
            <p className="text-base font-semibold tabular-nums">{fmt(khrPerSar(usdKhr), 0)} ៛</p>
          </div>
          <div className="rounded-xl bg-muted/60 px-2 py-2.5">
            <p className="text-[11px] text-muted-foreground">1 SAR ≈ ${(1 / SAR_PER_USD).toFixed(3)}</p>
            <p className="text-base font-semibold tabular-nums">$100 ≈ 375 SAR</p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">កំពុងទាញអត្រា NBC…</p>
      )}
      <div className="space-y-2">
        <Segmented
          aria-label="រូបិយប័ណ្ណ"
          value={from}
          onChange={setFrom}
          options={[
            { value: "USD", label: "$" },
            { value: "KHR", label: "៛" },
            { value: "SAR", label: "SAR" },
          ]}
        />
        <Input inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} className="h-12 text-lg font-semibold tabular-nums" aria-label="ចំនួនទឹកប្រាក់" />
        {outputs.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {outputs.map(([k, v]) => (
              <p key={k} className="rounded-lg border px-3 py-2 text-center text-sm font-semibold tabular-nums">
                ≈ {v}
              </p>
            ))}
          </div>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        ការប៉ាន់ស្មាន៖ អត្រា NBC {nbc?.date ?? "—"} ÷ 3.75 (ប្រាក់ SAR ភ្ជាប់នឹងដុល្លារជាផ្លូវការ៖ 1 USD = 3.75 SAR)។ អត្រាហាងប្ដូរប្រាក់អាចខុសគ្នាបន្តិច។
      </p>
    </Card>
  )
}
