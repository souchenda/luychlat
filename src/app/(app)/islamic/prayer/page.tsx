"use client"

import { BellRingIcon, InfoIcon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { LocationPicker, useIslamicLocation } from "@/components/islamic/location-picker"
import { Card } from "@/components/ui/card"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { cambodiaNow, formatMinutes, nextPrayer, PRAYER_ORDER, prayerTimes } from "@/lib/prayer"
import { cn } from "@/lib/utils"

const LATIN: Record<string, string> = { fajr: "Fajr", sunrise: "Shuruq", dhuhr: "Dhuhr", asr: "Asr", maghrib: "Maghrib", isha: "Isha" }

function countdown(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":")
}

/** Today's five prayers (plus sunrise) for the chosen place, with a live countdown to the next one. */
export default function PrayerTimesPage() {
  const t = useT()
  const location = useIslamicLocation()
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const clock = cambodiaNow(now)
  const { year, month, day } = clock.date
  const today = useMemo(() => prayerTimes({ year, month, day }, location.lat, location.lng), [year, month, day, location.lat, location.lng])
  const tomorrow = useMemo(() => {
    const d = new Date(Date.UTC(year, month - 1, day + 1))
    return prayerTimes({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }, location.lat, location.lng)
  }, [year, month, day, location.lat, location.lng])
  const next = nextPrayer(today, tomorrow, clock.minutes, clock.seconds)
  // After Isha the next prayer is tomorrow's Fajr.
  const afterIsha = clock.minutes * 60 + clock.seconds >= today.isha * 60
  const nextTime = afterIsha ? tomorrow.fajr : today[next.key]

  return (
    <div className="space-y-4">
      <LocationPicker />

      <Card className="items-center gap-1 border-emerald-500/30 bg-linear-to-br from-emerald-600 to-teal-700 px-4 py-5 text-center text-white">
        <p className="flex items-center gap-1.5 text-sm text-white/85">
          <BellRingIcon className="size-4" aria-hidden />
          {t("prayer.next")}
        </p>
        <p className="text-2xl font-bold">
          {t(`prayer.${next.key}` as MessageKey)} · {formatMinutes(nextTime)}
        </p>
        <p className="font-mono text-3xl font-semibold tracking-wider tabular-nums" suppressHydrationWarning>
          {countdown(next.inSeconds)}
        </p>
        <p className="text-xs text-white/75">{location.label}</p>
      </Card>

      <Card className="gap-0 py-0">
        <ul className="divide-y">
          {PRAYER_ORDER.map((key) => {
            const active = key === next.key && !afterIsha
            return (
              <li key={key} className={cn("flex items-center justify-between px-4 py-3", active && "bg-primary/10")}>
                <span>
                  <span className={cn("block font-medium", key === "sunrise" && "text-muted-foreground", active && "text-primary")}>
                    {t(`prayer.${key}` as MessageKey)}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">{LATIN[key]}</span>
                </span>
                <span className={cn("font-mono text-lg tabular-nums", active ? "font-bold text-primary" : key === "sunrise" && "text-muted-foreground")}>
                  {formatMinutes(today[key])}
                </span>
              </li>
            )
          })}
        </ul>
      </Card>

      <p className="flex items-start gap-2 px-1 text-xs text-muted-foreground">
        <InfoIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        {t("prayer.method")}
      </p>
    </div>
  )
}
