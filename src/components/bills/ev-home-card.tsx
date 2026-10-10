"use client"

import { format } from "date-fns"
import { Loader2Icon, PlusIcon, XIcon, ZapIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Segmented } from "@/components/common/segmented"
import { useCarMonth, useEvLogs, useEvMutations, useLogDistance } from "@/lib/bills"
import { benchmarkPetrol, evEconomics, PETROL_L_PER_100KM } from "@/lib/ev-economics"
import { useMarket } from "@/lib/market"
import { formatMoney } from "@/lib/money"
import { useT } from "@/lib/i18n/use-t"

/**
 * /bills › EV home charging: a usage log (kWh), never a wallet expense — the
 * cost is already in the electricity bill. Logged here or from Telegram
 * ("សាកឡាននៅផ្ទះ 30kwh"). Public-station charging is a normal expense.
 */
export function EvHomeCard({ workspaceId, editable }: { workspaceId: string; editable: boolean }) {
  const t = useT()
  const logs = useEvLogs(workspaceId).data ?? []
  const { add, remove } = useEvMutations(workspaceId)
  const [kwh, setKwh] = useState("")
  // The car's distance: the odometer reading, or one trip — for cost per km and the petrol comparison.
  const [kmText, setKmText] = useState("")
  const [kmKind, setKmKind] = useState<"ODOMETER" | "TRIP">("ODOMETER")
  const car = useCarMonth(workspaceId).data
  const logDistance = useLogDistance(workspaceId)
  const petrol = benchmarkPetrol(useMarket().data?.fuel)
  const econ = car ? evEconomics({ homeKwh: car.home_kwh, rate: car.rate, publicUsd: car.public_usd, khrPerUsd: car.khr_per_usd, km: car.month_km, petrolPerLitre: petrol }) : null
  const riel = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n))
  const addDistance = async () => {
    const km = Number(kmText.replace(/,/g, ""))
    if (!(km > 0 && km < 2_000_000)) return void toast.error(t("ev.invalid"))
    try {
      await logDistance.mutateAsync({ kind: kmKind, km })
      setKmText("")
      toast.success(t("ev.distanceLogged"))
    } catch {
      toast.error(t("common.error"))
    }
  }
  const monthStart = format(new Date(), "yyyy-MM")
  const thisMonth = logs.filter((l) => format(new Date(l.charged_at), "yyyy-MM") === monthStart)
  const monthKwh = Math.round(thisMonth.reduce((s, l) => s + (l.kwh ?? 0), 0) * 100) / 100

  const submit = async () => {
    const value = kwh.trim() ? Number(kwh.replace(",", ".")) : null
    if (value !== null && !(value > 0 && value <= 500)) return void toast.error(t("ev.invalid"))
    try {
      await add.mutateAsync(value)
      setKwh("")
      toast.success(t("ev.logged"))
    } catch {
      toast.error(t("common.error"))
    }
  }

  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-1.5 px-1 text-sm font-medium text-muted-foreground">
        <ZapIcon className="size-4" aria-hidden />
        {t("ev.title")}
      </h2>
      <Card className="gap-3 px-4 py-3">
        <p className="text-sm">
          <span className="font-semibold tabular-nums">{t("ev.month", { count: thisMonth.length, kwh: monthKwh })}</span>
        </p>
        <p className="text-xs text-muted-foreground">{t("ev.hint")}</p>
        {editable && (
          <div className="flex gap-2">
            <Input inputMode="decimal" placeholder={t("ev.kwhPlaceholder")} value={kwh} onChange={(e) => setKwh(e.target.value)} className="h-10 flex-1" aria-label="kWh" />
            <Button onClick={() => void submit()} disabled={add.isPending}>
              {add.isPending ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
              {t("ev.log")}
            </Button>
          </div>
        )}
        {editable && (
          <div className="space-y-2 border-t pt-3">
            <Segmented
              aria-label={t("ev.distance")}
              value={kmKind}
              onChange={(v) => setKmKind(v)}
              options={[
                { value: "ODOMETER", label: t("ev.odometer") },
                { value: "TRIP", label: t("ev.trip") },
              ]}
            />
            <div className="flex gap-2">
              <Input inputMode="decimal" placeholder={t(kmKind === "ODOMETER" ? "ev.odometerPlaceholder" : "ev.tripPlaceholder")} value={kmText} onChange={(e) => setKmText(e.target.value)} className="h-10 flex-1" aria-label="km" />
              <Button variant="outline" onClick={() => void addDistance()} disabled={logDistance.isPending}>
                {logDistance.isPending ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
                km
              </Button>
            </div>
          </div>
        )}
        {econ && car && (
          <dl className="space-y-1 rounded-xl border px-3 py-2 text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">{t("ev.monthKm")}</dt>
              <dd className="font-medium tabular-nums">{car.month_km > 0 ? `${riel(car.month_km)} km` : "—"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">{t("ev.monthCost")}</dt>
              <dd className="font-medium tabular-nums">{riel(econ.totalKhr)} ៛ (≈ {formatMoney(econ.totalUsd, "USD")})</dd>
            </div>
            {econ.perKmKhr !== null && econ.perKmUsd !== null && (
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{t("ev.perKm")}</dt>
                <dd className="font-medium tabular-nums">{econ.perKmKhr.toFixed(1)} ៛/km (≈ ${econ.perKmUsd.toFixed(3)})</dd>
              </div>
            )}
            {econ.savingsUsd !== null && petrol && (
              <>
                <div className="flex justify-between gap-2 text-emerald-700 dark:text-emerald-400">
                  <dt>{t("ev.vsPetrol")}</dt>
                  <dd className="font-semibold tabular-nums">{formatMoney(econ.savingsUsd, "USD")}</dd>
                </div>
                <p className="text-[11px] text-muted-foreground">{t("ev.petrolBasis", { price: riel(petrol), lper: PETROL_L_PER_100KM })}</p>
              </>
            )}
            {car.month_km <= 0 && <p className="text-[11px] text-muted-foreground">{t("ev.addDistanceHint")}</p>}
          </dl>
        )}
        {thisMonth.length > 0 && (
          <ul className="divide-y text-sm">
            {thisMonth.slice(0, 8).map((l) => (
              <li key={l.id} className="flex items-center gap-2 py-1.5">
                <span className="flex-1 text-muted-foreground tabular-nums">{format(new Date(l.charged_at), "dd/MM HH:mm")}</span>
                <span className="font-medium tabular-nums">{l.kwh !== null ? `${l.kwh} kWh` : "—"}</span>
                {editable && (
                  <Button size="icon" variant="ghost" className="size-7" aria-label={t("bills.delete")} onClick={() => void remove.mutateAsync(l.id)}>
                    <XIcon className="size-3.5" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  )
}
