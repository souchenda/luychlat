"use client"

import { BellRingIcon, ChevronRightIcon, MoonIcon, SunriseIcon, UtensilsIcon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { LocationPicker, useIslamicLocation } from "@/components/islamic/location-picker"
import { PrayerAlertSettings } from "@/components/islamic/prayer-alerts"
import { ScriptureRefs } from "@/components/islamic/scripture-refs"
import { Card } from "@/components/ui/card"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { cambodiaNow, formatMinutes, imsakTime, nextFastingEvent, nextPrayer, PRAYER_ORDER, prayerTimes } from "@/lib/prayer"
import { fastingRuling, ISLAMIC_ARABIC, toHijri } from "@/lib/islamic"
import { useIslamicDefaults } from "@/lib/islamic-settings"
import { hasFajrRecording } from "@/lib/adhan-presets"
import { FastingWisdomSheet } from "@/components/islamic/fasting-wisdom-sheet"
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
  const [wisdomOpen, setWisdomOpen] = useState(false)
  // Wajib in Ramadan, Sunnah in every other month — by today's Hijri date with the admin's offset.
  const hijriOffset = Number(useIslamicDefaults().hijri_offset ?? 0) || 0
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
  const fast = nextFastingEvent(today, tomorrow, clock.minutes, clock.seconds)
  const nowMinutes = clock.minutes
  const ruling = fastingRuling(toHijri(now, hijriOffset))

  return (
    <div className="space-y-3">
      <LocationPicker />

      <Card className="items-center gap-0.5 border-emerald-500/30 bg-linear-to-br from-emerald-600 to-teal-700 px-4 py-4 text-center text-white">
        <p className="flex items-center gap-1.5 text-xs text-white/85">
          <BellRingIcon className="size-3.5" aria-hidden />
          {t("prayer.next")} · {location.label}
        </p>
        <p className="text-xl font-bold">
          {t(`prayer.${next.key}` as MessageKey)} · {formatMinutes(nextTime)}
        </p>
        <p className="font-mono text-3xl font-semibold tracking-wider tabular-nums" suppressHydrationWarning>
          {countdown(next.inSeconds)}
        </p>
      </Card>

      <ul className="grid grid-cols-3 gap-2" aria-label={t("islamic.tab.prayer")}>
        {PRAYER_ORDER.map((key) => {
          const active = key === next.key && !afterIsha
          const past = !active && today[key] <= nowMinutes
          const sunrise = key === "sunrise"
          return (
            <li
              key={key}
              aria-current={active ? "time" : undefined}
              className={cn(
                "rounded-xl border bg-card px-2 py-2 text-center",
                active && "border-primary bg-primary/10 ring-1 ring-primary",
                past && "opacity-60",
              )}
            >
              <p className={cn("flex items-center justify-center gap-1 truncate text-xs font-medium", active ? "text-primary" : sunrise && "text-muted-foreground")}>
                {sunrise && <SunriseIcon className="size-3" aria-hidden />}
                {t(`prayer.${key}` as MessageKey)}
              </p>
              <p className={cn("font-mono text-lg leading-tight tabular-nums", active ? "font-bold text-primary" : sunrise && "text-muted-foreground")}>
                {formatMinutes(today[key])}
              </p>
              <p dir="rtl" lang="ar" className="font-arabic text-sm leading-snug text-muted-foreground" title={LATIN[key]}>
                {ISLAMIC_ARABIC[key]}
              </p>
            </li>
          )
        })}
      </ul>

      {/* The Fajr Adhan's Tathweeb — at Fajr only (lib/adhan-presets adhanForPrayer). */}
      <Card className="gap-1.5 px-4 py-3">
        <p className="text-sm">{t("prayer.fajrNote")}</p>
        <p dir="rtl" lang="ar" className="text-center font-arabic text-xl leading-relaxed text-emerald-800 dark:text-emerald-300">
          {ISLAMIC_ARABIC.tathweeb}
        </p>
        <p className="text-center text-xs text-muted-foreground">{t("prayer.fajrNoteMeaning")}</p>
        <p className="text-xs text-muted-foreground">{t("prayer.fajrNoteOthers")}</p>
        {!hasFajrRecording() && <p className="text-[11px] text-muted-foreground">{t("prayer.fajrNoteNoRecording")}</p>}
      </Card>

      <Card className="gap-2 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium">{t("fasting.title")}</h2>
          <p className="text-xs text-muted-foreground" suppressHydrationWarning>
            {t(fast.kind === "imsak" ? "fasting.imsakIn" : "fasting.iftarIn", { time: countdown(fast.inSeconds) })}
          </p>
        </div>
        {ruling && (
          <p
            className={cn(
              "rounded-lg px-3 py-2 text-[13px] font-medium",
              ruling === "wajib" ? "bg-rose-50 text-rose-800 dark:bg-rose-500/10 dark:text-rose-200" : "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200",
            )}
          >
            {t(ruling === "wajib" ? "fasting.badgeWajib" : "fasting.badgeSunnah")}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <div className={cn("flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2", fast.kind === "imsak" && "ring-1 ring-primary")}>
            <MoonIcon className="size-4 text-indigo-500" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] text-muted-foreground">
                {t("fasting.imsak")} (<span dir="rtl" lang="ar" className="font-arabic text-[13px]">{ISLAMIC_ARABIC.imsak}</span> / Imsak)
              </span>
              <span className="block font-mono font-semibold tabular-nums">{formatMinutes(fast.kind === "imsak" ? fast.at : imsakTime(today))}</span>
            </span>
          </div>
          <div className={cn("flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2", fast.kind === "iftar" && "ring-1 ring-primary")}>
            <UtensilsIcon className="size-4 text-amber-500" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] text-muted-foreground">
                {t("fasting.iftar")} (<span dir="rtl" lang="ar" className="font-arabic text-[13px]">{ISLAMIC_ARABIC.iftar}</span> / Iftar)
              </span>
              <span className="block font-mono font-semibold tabular-nums">{formatMinutes(today.maghrib)}</span>
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setWisdomOpen(true)}
          className="-mx-1 flex min-h-11 items-center justify-between gap-2 rounded-lg px-1 text-left text-sm font-medium text-emerald-800 hover:bg-muted dark:text-emerald-300"
        >
          <span>{t("fasting.wisdomLink")}</span>
          <ChevronRightIcon className="size-4 shrink-0" aria-hidden />
        </button>
      </Card>
      <FastingWisdomSheet open={wisdomOpen} onOpenChange={setWisdomOpen} />

      <PrayerAlertSettings />

      <ScriptureRefs topics={["prayer", "fasting"]} />
    </div>
  )
}
