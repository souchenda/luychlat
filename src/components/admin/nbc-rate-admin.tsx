"use client"

import { useQueryClient } from "@tanstack/react-query"
import { BanknoteIcon, ExternalLinkIcon, Loader2Icon, RotateCcwIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { adminPost } from "@/components/admin/admin-api"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useT } from "@/lib/i18n/use-t"
import { marketKeys, useMarket } from "@/lib/market"
import { nextWorkingDay, type NbcRates } from "@/lib/market-calc"

const today = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10)

/**
 * /admin › NBC rate: when the automatic feed lags behind nbc.gov.kh (NBC posts
 * the next working day's rate at ~16:30), enter that rate and its "As of" day.
 * It stays until the feed has the same day; "Use automatic" goes back at once.
 * The same as Telegram /setrate.
 */
export function NbcRateAdmin() {
  const t = useT()
  const queryClient = useQueryClient()
  const nbc = useMarket().data?.nbc ?? null
  const [rate, setRate] = useState("")
  const [date, setDate] = useState(() => nextWorkingDay(today()))
  const [busy, setBusy] = useState<"save" | "clear" | null>(null)

  useEffect(() => {
    if (nbc) setRate(String(nbc.usd_khr))
  }, [nbc])

  const done = (saved: NbcRates | null) => {
    queryClient.setQueryData(marketKeys.live, (m: Record<string, unknown> | null | undefined) => (m ? { ...m, nbc: saved ?? undefined } : m))
    void queryClient.invalidateQueries({ queryKey: marketKeys.live })
  }
  const run = async (kind: "save" | "clear") => {
    setBusy(kind)
    try {
      done(await adminPost<NbcRates | null>("/api/admin/setrate", kind === "clear" ? { clear: true } : { usd_khr: Number(rate.replace(/[,\s៛]/g, "")), date }))
      toast.success(t(kind === "clear" ? "nbcAdmin.cleared" : "nbcAdmin.saved"))
    } catch (e) {
      toast.error(t((e as Error).message === "invalid" ? "nbcAdmin.invalid" : "common.error"))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 font-semibold [&_svg]:size-4 [&_svg]:text-primary">
        <BanknoteIcon />
        {t("nbcAdmin.title")}
      </h2>
      <Card className="gap-3 px-4 py-4">
        {nbc && (
          <p className="text-xs text-muted-foreground">
            {t("nbcAdmin.current", { rate: nbc.usd_khr.toLocaleString("en-US"), date: nbc.date, source: nbc.source === "manual" ? "admin" : nbc.source === "nbc" ? "nbc.gov.kh" : "Frankfurter" })}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Input inputMode="numeric" aria-label={t("nbcAdmin.rate")} value={rate} onChange={(e) => setRate(e.target.value)} placeholder="4057" />
            <p className="text-[11px] text-muted-foreground">{t("nbcAdmin.rate")}</p>
          </div>
          <div className="space-y-1">
            <Input type="date" aria-label={t("nbcAdmin.asOf")} value={date} onChange={(e) => setDate(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">{t("nbcAdmin.asOf")}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => void run("save")} disabled={busy !== null}>
            {busy === "save" && <Loader2Icon className="animate-spin" />}
            {t("common.save")}
          </Button>
          <Button variant="outline" onClick={() => void run("clear")} disabled={busy !== null || nbc?.source !== "manual"}>
            {busy === "clear" ? <Loader2Icon className="animate-spin" /> : <RotateCcwIcon />}
            {t("nbcAdmin.useAuto")}
          </Button>
        </div>
        <a
          href="https://www.nbc.gov.kh/english/economic_research/exchange_rate.php"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-primary [&_svg]:size-3"
        >
          nbc.gov.kh <ExternalLinkIcon />
        </a>
        <p className="text-[11px] text-muted-foreground">{t("nbcAdmin.hint")}</p>
      </Card>
    </section>
  )
}
