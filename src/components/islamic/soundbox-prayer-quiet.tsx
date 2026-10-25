"use client"

import { MoonStarIcon } from "lucide-react"
import { useEffect } from "react"

import { Segmented } from "@/components/common/segmented"
import { useIslamicLocation } from "@/components/islamic/location-picker"
import { Card } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { useT } from "@/lib/i18n/use-t"
import { useIslamicEnabled } from "@/lib/islamic-settings"
import { JUMUAH_QUIET_MINUTES, PRAYER_QUIET_MINUTES, prayerQuietWindows } from "@/lib/prayer-quiet"
import { PRAYER_QUIET_EVENT, writeQuietSpans } from "@/lib/soundbox"
import { useIslamicLocalStore } from "@/stores/islamic-local-store"

const local = () => {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/**
 * Mounted once in the app layout (founder, 26/10/2026 — Task #506): while this device's «ស្ងាត់ SoundBox អំឡុងពេលសឡាត»
 * is on and Islamic Mode too, today's and tomorrow's quiet spans are written for the SoundBox (plain `{ from, to }` — the
 * SoundBox never computes a prayer time), refreshed hourly and whenever the place or the minutes change; off → cleared.
 */
export function SoundboxPrayerQuietWriter() {
  const islamic = useIslamicEnabled()
  const { soundboxQuiet, soundboxQuietMinutes } = useIslamicLocalStore()
  const { lat, lng, utcOffset } = useIslamicLocation()
  useEffect(() => {
    const write = () => {
      const on = islamic && soundboxQuiet
      writeQuietSpans(local(), on ? prayerQuietWindows({ now: Date.now(), lat, lng, utcOffset, minutes: soundboxQuietMinutes }).map(({ from, to }) => ({ from, to })) : null)
      window.dispatchEvent(new Event(PRAYER_QUIET_EVENT))
    }
    write()
    const id = window.setInterval(write, 60 * 60_000)
    return () => window.clearInterval(id)
  }, [islamic, soundboxQuiet, soundboxQuietMinutes, lat, lng, utcOffset])
  return null
}

/** The switch on the prayer page — this device only, off by default. */
export function SoundboxPrayerQuietCard() {
  const t = useT()
  const { soundboxQuiet, soundboxQuietMinutes, setSoundboxQuiet } = useIslamicLocalStore()
  return (
    <Card className="gap-3 px-4 py-3">
      <label className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <MoonStarIcon className="size-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{t("soundboxQuiet.toggle")}</span>
          <span className="block text-xs text-muted-foreground">{t("soundboxQuiet.hint", { jumuah: String(JUMUAH_QUIET_MINUTES) })}</span>
        </span>
        <Switch checked={soundboxQuiet} onCheckedChange={(on) => setSoundboxQuiet({ soundboxQuiet: on })} aria-label={t("soundboxQuiet.toggle")} />
      </label>
      {soundboxQuiet && (
        <Segmented
          aria-label={t("soundboxQuiet.minutes")}
          value={String(soundboxQuietMinutes)}
          onChange={(v) => setSoundboxQuiet({ soundboxQuietMinutes: Number(v) })}
          options={PRAYER_QUIET_MINUTES.map((m) => ({ value: String(m), label: t("soundboxQuiet.minutesValue", { n: String(m) }) }))}
        />
      )}
      <p className="-mt-1 text-[11px] text-muted-foreground">{t("soundboxQuiet.thisDevice")}</p>
    </Card>
  )
}
