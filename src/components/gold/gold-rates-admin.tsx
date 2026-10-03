"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { CalculatorIcon, CoinsIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { isWhiteGold, RATE_KEYS, rateFromSpot, type GoldKind, type PlatinumGrade, type RateKey } from "@/lib/gold"
import { goldKeys, useGoldRates } from "@/lib/gold-data"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

/** /admin › ហាងឆេងមាស: USD per damlung for each kind, typed in or worked out from the world spot price. */
export function GoldRatesAdmin() {
  const t = useT()
  const queryClient = useQueryClient()
  // Only the admin's own (manual override) rates; the live reference fills the rest.
  const { adminRates: rates, updatedAt } = useGoldRates()
  const [form, setForm] = useState<Record<string, string>>({})
  const [goldSpot, setGoldSpot] = useState("")
  const [platinumSpot, setPlatinumSpot] = useState("")

  const ratesKey = JSON.stringify(rates)
  useEffect(() => {
    // An older single "PLATINUM" rate shows as Pt950 until saved again.
    const withLegacy: Partial<Record<RateKey, number>> = { PLATINUM_PT950: rates.PLATINUM, ...rates }
    setForm(Object.fromEntries(RATE_KEYS.map((k) => [k, withLegacy[k] ? String(withLegacy[k]) : ""])))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when the saved rates change
  }, [ratesKey])
  const gradeOf = (k: RateKey) => (k.startsWith("PLATINUM_") ? (k.slice(9) as PlatinumGrade) : null)
  const label = (k: RateKey) => {
    const g = gradeOf(k)
    return g ? `${t("gold.kind.PLATINUM")} ${t(`gold.grade.${g}` as MessageKey)}` : t(`gold.kind.${k as GoldKind}` as MessageKey)
  }

  const fromSpot = () => {
    const gold = Number(goldSpot)
    const platinum = Number(platinumSpot)
    setForm((f) =>
      Object.fromEntries(
        RATE_KEYS.map((k) => {
          const g = gradeOf(k)
          // White gold (ទឹក 75 / 70 / 58.5) follows the gold price; Pt950 / Pt900 the platinum price.
          const spot = g ? (isWhiteGold(g) ? gold : platinum) : gold
          return [k, spot > 0 ? String(rateFromSpot(spot, g ? "PLATINUM" : (k as GoldKind), g ?? undefined)) : f[k]]
        }),
      ),
    )
  }

  const save = useMutation({
    mutationFn: async () => {
      const value = Object.fromEntries(RATE_KEYS.map((k) => [k, form[k]?.trim() || null]))
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
            {RATE_KEYS.map((k) => (
              <div key={k} className="space-y-1">
                <Label htmlFor={`rate-${k}`} className="text-xs">
                  {label(k)}
                </Label>
                <Input id={`rate-${k}`} inputMode="decimal" placeholder="$ / តម្លឹង" value={form[k] ?? ""} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} />
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
