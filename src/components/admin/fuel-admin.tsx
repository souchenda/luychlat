"use client"

import { useQueryClient } from "@tanstack/react-query"
import { FuelIcon, Loader2Icon } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { adminPost } from "@/components/admin/admin-api"
import { Segmented } from "@/components/common/segmented"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useT } from "@/lib/i18n/use-t"
import { marketKeys, useMarket } from "@/lib/market"
import { fuelCycle, type FuelPrices } from "@/lib/market-calc"

const today = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10)
const str = (n?: number | null) => (n ? String(n) : "")

/**
 * /admin › Fuel prices (MoC): the Ministry of Commerce's retail prices for a
 * 10-day cycle, entered by hand (no automatic source). Shown in /fuel, the
 * community bulletin and /market. The same as Telegram /setfuel.
 */
export function FuelAdmin() {
  const t = useT()
  const queryClient = useQueryClient()
  const fuel = useMarket().data?.fuel ?? null
  const cycle = fuelCycle(today())
  const [form, setForm] = useState({ regular: "", super: "", diesel: "", lpg: "", lpgUnit: "kg" as "kg" | "L", from: cycle.from, to: cycle.to })
  const [busy, setBusy] = useState(false)
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }))

  useEffect(() => {
    if (!fuel) return
    // Start from the last prices, for the current cycle.
    setForm((f) => ({ ...f, regular: str(fuel.regular), super: str(fuel.super), diesel: str(fuel.diesel), lpg: str(fuel.lpg), lpgUnit: fuel.lpg_unit }))
  }, [fuel])

  const save = async () => {
    const n = (v: string) => Number(v.replace(/[,\s៛]/g, ""))
    setBusy(true)
    try {
      const saved = await adminPost<FuelPrices | null>("/api/admin/setfuel", {
        regular: n(form.regular),
        super: n(form.super),
        diesel: n(form.diesel),
        lpg: form.lpg.trim() ? n(form.lpg) : null,
        lpg_unit: form.lpgUnit,
        from: form.from,
        to: form.to,
      })
      queryClient.setQueryData(marketKeys.live, (m: Record<string, unknown> | null | undefined) => (m ? { ...m, fuel: saved ?? undefined } : m))
      void queryClient.invalidateQueries({ queryKey: marketKeys.live })
      toast.success(t("fuelAdmin.saved"))
    } catch (e) {
      toast.error(t((e as Error).message === "invalid" ? "fuelAdmin.invalid" : "common.error"))
    } finally {
      setBusy(false)
    }
  }

  const field = (key: "regular" | "super" | "diesel" | "lpg", label: string) => (
    <div className="space-y-1">
      <Input inputMode="numeric" aria-label={label} value={form[key]} onChange={(e) => set({ [key]: e.target.value })} placeholder="៛" />
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  )

  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 font-semibold [&_svg]:size-4 [&_svg]:text-primary">
        <FuelIcon />
        {t("fuelAdmin.title")}
      </h2>
      <Card className="gap-3 px-4 py-4">
        {fuel && <p className="text-xs text-muted-foreground">{t("fuelAdmin.current", { from: fuel.from, to: fuel.to })}</p>}
        <div className="grid grid-cols-2 gap-2">
          {field("regular", t("fuel.regular"))}
          {field("super", t("fuel.super"))}
          {field("diesel", t("fuel.diesel"))}
          {field("lpg", t("fuel.lpg"))}
        </div>
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{t("fuelAdmin.lpgUnit")}</span>
          <div className="w-32">
            <Segmented value={form.lpgUnit} onChange={(v) => set({ lpgUnit: v })} options={[{ value: "kg", label: "kg" }, { value: "L", label: "L" }]} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Input type="date" aria-label={t("fuelAdmin.from")} value={form.from} onChange={(e) => set({ from: e.target.value })} />
            <p className="text-[11px] text-muted-foreground">{t("fuelAdmin.from")}</p>
          </div>
          <div className="space-y-1">
            <Input type="date" aria-label={t("fuelAdmin.to")} value={form.to} onChange={(e) => set({ to: e.target.value })} />
            <p className="text-[11px] text-muted-foreground">{t("fuelAdmin.to")}</p>
          </div>
        </div>
        <Button onClick={() => void save()} disabled={busy}>
          {busy && <Loader2Icon className="animate-spin" />}
          {t("common.save")}
        </Button>
        <p className="text-[11px] text-muted-foreground">{t("fuelAdmin.hint")}</p>
      </Card>
    </section>
  )
}
