"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { CalculatorIcon, CoinsIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { GOLD_KINDS, rateFromSpot, type GoldKind } from "@/lib/gold"
import { goldKeys, useGoldRates } from "@/lib/gold-data"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

/** /admin › ហាងឆេងមាស: USD per damlung for each kind, typed in or worked out from the world spot price. */
export function GoldRatesAdmin() {
  const t = useT()
  const queryClient = useQueryClient()
  const { rates, updatedAt } = useGoldRates()
  const [form, setForm] = useState<Record<GoldKind, string>>({ GOLD_BAR: "", GOLD_24K: "", GOLD_18K: "", PLATINUM: "" })
  const [goldSpot, setGoldSpot] = useState("")
  const [platinumSpot, setPlatinumSpot] = useState("")

  useEffect(() => {
    setForm({
      GOLD_BAR: rates.GOLD_BAR ? String(rates.GOLD_BAR) : "",
      GOLD_24K: rates.GOLD_24K ? String(rates.GOLD_24K) : "",
      GOLD_18K: rates.GOLD_18K ? String(rates.GOLD_18K) : "",
      PLATINUM: rates.PLATINUM ? String(rates.PLATINUM) : "",
    })
  }, [rates.GOLD_BAR, rates.GOLD_24K, rates.GOLD_18K, rates.PLATINUM])

  const fromSpot = () => {
    const gold = Number(goldSpot)
    const platinum = Number(platinumSpot)
    setForm((f) => ({
      GOLD_BAR: gold > 0 ? String(rateFromSpot(gold, "GOLD_BAR")) : f.GOLD_BAR,
      GOLD_24K: gold > 0 ? String(rateFromSpot(gold, "GOLD_24K")) : f.GOLD_24K,
      GOLD_18K: gold > 0 ? String(rateFromSpot(gold, "GOLD_18K")) : f.GOLD_18K,
      PLATINUM: platinum > 0 ? String(rateFromSpot(platinum, "PLATINUM")) : f.PLATINUM,
    }))
  }

  const save = useMutation({
    mutationFn: async () => {
      const value = Object.fromEntries(GOLD_KINDS.map((k) => [k, form[k].trim() || null]))
      const { error } = await getSupabaseBrowserClient()!.rpc("admin_set_gold_rates", { p_value: value })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success(t("admin.saved"))
      void queryClient.invalidateQueries({ queryKey: goldKeys.rates })
    },
    onError: () => toast.error(t("admin.islamicInvalid")),
  })

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <CoinsIcon className="size-4 text-muted-foreground" aria-hidden />
        <h2 className="flex-1 text-sm font-medium text-muted-foreground">{t("gold.adminTitle")}</h2>
        {updatedAt && <span className="text-[11px] text-muted-foreground">{new Date(updatedAt).toLocaleString("en-GB")}</span>}
      </div>
      <Card className="px-4 py-4">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate()
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            {GOLD_KINDS.map((k) => (
              <div key={k} className="space-y-1">
                <Label htmlFor={`rate-${k}`} className="text-xs">
                  {t(`gold.kind.${k}` as MessageKey)}
                </Label>
                <Input id={`rate-${k}`} inputMode="decimal" placeholder="$ / តម្លឹង" value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} />
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{t("gold.adminHint")}</p>

          <div className="space-y-2 rounded-xl bg-muted/50 p-3">
            <p className="text-xs font-medium">{t("gold.fromSpot")}</p>
            <div className="grid grid-cols-2 gap-2">
              <Input inputMode="decimal" placeholder={t("gold.goldSpot")} value={goldSpot} onChange={(e) => setGoldSpot(e.target.value)} aria-label={t("gold.goldSpot")} />
              <Input inputMode="decimal" placeholder={t("gold.platinumSpot")} value={platinumSpot} onChange={(e) => setPlatinumSpot(e.target.value)} aria-label={t("gold.platinumSpot")} />
            </div>
            <Button type="button" size="sm" variant="outline" className="w-full" onClick={fromSpot}>
              <CalculatorIcon />
              {t("gold.fill")}
            </Button>
            <p className="text-[11px] text-muted-foreground">{t("gold.spotHint")}</p>
          </div>

          <Button type="submit" className="w-full" disabled={save.isPending}>
            {t("common.save")}
          </Button>
        </form>
      </Card>
    </section>
  )
}
