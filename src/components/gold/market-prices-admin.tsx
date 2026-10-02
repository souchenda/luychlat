"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { CandlestickChartIcon, PlusIcon, XIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { MARKETS, normalizeSymbol, priceKey, type Market } from "@/lib/investments"
import { useMarketPrices } from "@/lib/investments-data"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

type Row = { market: Market; symbol: string; price: string }

/** /admin: daily prices for CSX stocks (riel), international stocks and crypto (USD), used for every holder of that symbol. */
export function MarketPricesAdmin() {
  const t = useT()
  const queryClient = useQueryClient()
  const { prices, updatedAt } = useMarketPrices()
  const [rows, setRows] = useState<Row[]>([])

  useEffect(() => {
    setRows(
      Object.entries(prices).map(([k, v]) => {
        const [market, symbol] = k.split(":") as [Market, string]
        return { market, symbol, price: String(v) }
      }),
    )
  }, [prices])

  const set = (i: number, patch: Partial<Row>) => setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)))
  const save = useMutation({
    mutationFn: async () => {
      const value: Record<string, string> = {}
      for (const r of rows) {
        const sym = normalizeSymbol(r.symbol)
        if (!sym && !r.price.trim()) continue
        if (!sym || !/^\d+(\.\d+)?$/.test(r.price.trim())) throw new Error("invalid")
        value[priceKey(r.market, sym)] = r.price.trim()
      }
      const { error } = await getSupabaseBrowserClient()!.rpc("admin_set_market_prices", { p_value: value })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success(t("admin.saved"))
      void queryClient.invalidateQueries({ queryKey: ["market-prices"] })
    },
    onError: () => toast.error(t("admin.islamicInvalid")),
  })

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <CandlestickChartIcon className="size-4 text-muted-foreground" aria-hidden />
        <h2 className="flex-1 text-sm font-medium text-muted-foreground">{t("invest.adminTitle")}</h2>
        {updatedAt && <span className="text-[11px] text-muted-foreground">{new Date(updatedAt).toLocaleString("en-GB")}</span>}
      </div>
      <Card className="gap-3 px-4 py-4">
        <p className="text-xs text-muted-foreground">{t("invest.adminHint")}</p>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[6.5rem_1fr_1fr_auto] items-center gap-1.5">
            <Select value={r.market} onValueChange={(v) => set(i, { market: v as Market })}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MARKETS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {t(`invest.market.${m}` as MessageKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input className="h-9 font-mono uppercase" placeholder="ABC" value={r.symbol} onChange={(e) => set(i, { symbol: e.target.value.toUpperCase() })} aria-label={t("invest.symbol")} />
            <Input className="h-9 tabular-nums" inputMode="decimal" placeholder={r.market === "STOCK_CSX" ? "៛" : "$"} value={r.price} onChange={(e) => set(i, { price: e.target.value })} aria-label={t("invest.currentPrice")} />
            <Button type="button" size="icon-sm" variant="ghost" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} aria-label={t("common.delete")}>
              <XIcon />
            </Button>
          </div>
        ))}
        <Button type="button" size="sm" variant="outline" onClick={() => setRows((r) => [...r, { market: "STOCK_CSX", symbol: "", price: "" }])}>
          <PlusIcon />
          {t("invest.addPrice")}
        </Button>
        <Button type="button" onClick={() => save.mutate()} disabled={save.isPending}>
          {t("common.save")}
        </Button>
      </Card>
    </section>
  )
}
