"use client"

import { useQueryClient } from "@tanstack/react-query"
import { CoinsIcon, ExternalLinkIcon, Loader2Icon, RotateCcwIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { adminPost } from "@/components/admin/admin-api"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useT } from "@/lib/i18n/use-t"
import type { LocalGold } from "@/lib/local-gold"
import { marketKeys, useMarket } from "@/lib/market"

type Form = { kiloSell: string; kiloBuy: string; jewelrySell: string; jewelryBuy: string }
const str = (n?: number | null) => (n ? String(n) : "")

/**
 * /admin › Gold prices: today's Phnom Penh counter prices per damlung, filled
 * in from CSNJ (Oknha News). Saving sets the daily override — the same as
 * Telegram /setgold; "Use CSNJ" goes back to the automatic prices.
 */
export function LocalGoldAdmin() {
  const t = useT()
  const queryClient = useQueryClient()
  const local = useMarket().data?.local_gold ?? null
  const [form, setForm] = useState<Form>({ kiloSell: "", kiloBuy: "", jewelrySell: "", jewelryBuy: "" })
  const [busy, setBusy] = useState<"save" | "clear" | null>(null)

  useEffect(() => {
    setForm({ kiloSell: str(local?.kilo.sell), kiloBuy: str(local?.kilo.buy), jewelrySell: str(local?.jewelry?.sell), jewelryBuy: str(local?.jewelry?.buy) })
  }, [local])

  const done = (saved: LocalGold | null) => {
    queryClient.setQueryData(marketKeys.live, (m: Record<string, unknown> | null | undefined) => (m ? { ...m, local_gold: saved ?? undefined } : m))
    void queryClient.invalidateQueries({ queryKey: marketKeys.live })
    void queryClient.invalidateQueries({ queryKey: ["gold-rates"] })
  }
  const num = (v: string) => Number(v.replace(/[$,\s]/g, ""))

  const save = async () => {
    const kilo = { sell: num(form.kiloSell), buy: num(form.kiloBuy) }
    const jewelry = form.jewelrySell || form.jewelryBuy ? { sell: num(form.jewelrySell), buy: num(form.jewelryBuy) } : undefined
    setBusy("save")
    try {
      done(await adminPost<LocalGold | null>("/api/admin/setgold", { kilo, jewelry }))
      toast.success(t("goldAdmin.saved"))
    } catch (e) {
      toast.error(t((e as Error).message === "implausible" ? "goldAdmin.implausible" : "common.error"))
    } finally {
      setBusy(null)
    }
  }
  const clear = async () => {
    setBusy("clear")
    try {
      done(await adminPost<LocalGold | null>("/api/admin/setgold", { clear: true }))
      toast.success(t("goldAdmin.cleared"))
    } catch {
      toast.error(t("common.error"))
    } finally {
      setBusy(null)
    }
  }

  const field = (key: keyof Form, label: string) => (
    <label className="space-y-1">
      <span className="block text-xs text-muted-foreground">{label}</span>
      <Input inputMode="decimal" className="h-10 text-right tabular-nums" value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} placeholder="$" />
    </label>
  )

  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-1.5 px-1 text-sm font-medium text-muted-foreground">
        <CoinsIcon className="size-4" aria-hidden />
        {t("goldAdmin.title")}
      </h2>
      <Card className="gap-4 px-4 py-4">
        <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
          {local ? (
            <>
              {t(local.source === "manual" ? "goldAdmin.nowManual" : "goldAdmin.nowCsnj", { date: local.date })}
              {local.url && (
                <a href={local.url} target="_blank" rel="noopener noreferrer" className="ml-1 inline-flex items-center gap-0.5 text-primary hover:underline">
                  Oknha News <ExternalLinkIcon className="size-3" aria-hidden />
                </a>
              )}
            </>
          ) : (
            t("goldAdmin.none")
          )}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">{t("market.kiloGold")}</p>
          <div className="grid grid-cols-2 gap-3">
            {field("kiloSell", t("market.sell"))}
            {field("kiloBuy", t("market.buy"))}
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("market.jewelryGold")}</p>
          <div className="grid grid-cols-2 gap-3">
            {field("jewelrySell", t("market.sell"))}
            {field("jewelryBuy", t("market.buy"))}
          </div>
        </div>

        <div className="flex gap-2">
          <Button className="flex-1" onClick={save} disabled={busy !== null || !form.kiloSell || !form.kiloBuy}>
            {busy === "save" && <Loader2Icon className="animate-spin" />}
            {t("goldAdmin.save")}
          </Button>
          {local?.source === "manual" && (
            <Button variant="outline" onClick={clear} disabled={busy !== null}>
              {busy === "clear" ? <Loader2Icon className="animate-spin" /> : <RotateCcwIcon />}
              {t("goldAdmin.useCsnj")}
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{t("goldAdmin.hint")}</p>
      </Card>
    </section>
  )
}
