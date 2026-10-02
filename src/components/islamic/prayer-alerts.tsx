"use client"

import { BellIcon, BellOffIcon, FileAudioIcon, Loader2Icon, PlayIcon, SquareIcon, Trash2Icon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { Segmented } from "@/components/common/segmented"
import { useIslamicLocation } from "@/components/islamic/location-picker"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { cambodiaNow, formatMinutes, prayerTimes } from "@/lib/prayer"
import {
  ADHAN_MAX_BYTES,
  alertId,
  claimAlert,
  deleteAdhan,
  duePrayer,
  notificationsSupported,
  playAdhan,
  playChime,
  saveAdhan,
  showPrayerNotification,
  stopSound,
} from "@/lib/prayer-alerts"
import { useIslamicLocalStore, type AlertSound } from "@/stores/islamic-local-store"

/**
 * Mounted once in the app layout: while LuyChlat is open (or in the
 * background), checks every 15 s whether a prayer time has arrived and alerts once.
 */
export function PrayerAlertScheduler() {
  const t = useT()
  const { alertsOn, alertSound } = useIslamicLocalStore()
  const location = useIslamicLocation()
  const latest = useRef({ t, alertSound, location })
  latest.current = { t, alertSound, location }

  useEffect(() => {
    if (!alertsOn) return
    const tick = () => {
      const { t, alertSound, location } = latest.current
      const clock = cambodiaNow()
      const times = prayerTimes(clock.date, location.lat, location.lng)
      const key = duePrayer(times, clock.minutes)
      if (!key || !claimAlert(alertId(clock.date, key))) return
      const name = t(`prayer.${key}` as MessageKey)
      const title = t("prayerAlert.title", { name })
      const body = t("prayerAlert.body", { time: formatMinutes(times[key]), place: location.label })
      void showPrayerNotification(title, body, `prayer-${key}`)
      if (alertSound === "chime") playChime()
      if (alertSound === "adhan") void playAdhan()
      if (document.visibilityState === "visible") {
        toast(title, {
          description: body,
          duration: alertSound === "adhan" ? 60_000 : 10_000,
          action: alertSound === "adhan" ? { label: t("prayerAlert.stop"), onClick: stopSound } : undefined,
        })
      }
    }
    tick()
    const id = window.setInterval(tick, 15_000)
    document.addEventListener("visibilitychange", tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener("visibilitychange", tick)
    }
  }, [alertsOn])

  return null
}

/** Prayer page card: turn alerts on (asks the browser), choose Adhan / chime / silent, pick the Adhan file. */
export function PrayerAlertSettings() {
  const t = useT()
  const { alertsOn, alertSound, adhanName, setAlerts } = useIslamicLocalStore()
  const [busy, setBusy] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default")
  useEffect(() => setPermission(notificationsSupported() ? Notification.permission : "unsupported"), [])

  const toggle = async (on: boolean) => {
    if (!on) return setAlerts({ alertsOn: false })
    let result = permission
    if (result === "default") {
      result = await Notification.requestPermission()
      setPermission(result)
    }
    // Without notification permission the in-app sound and banner still work.
    setAlerts({ alertsOn: true })
    toast.success(t(result === "granted" ? "prayerAlert.on" : "prayerAlert.onInApp"))
  }

  const pickFile = async (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith("audio/")) return void toast.error(t("prayerAlert.notAudio"))
    if (file.size > ADHAN_MAX_BYTES) return void toast.error(t("prayerAlert.tooBig"))
    setBusy(true)
    try {
      await saveAdhan(file)
      setAlerts({ adhanName: file.name, alertSound: "adhan" })
      toast.success(t("prayerAlert.adhanSaved"))
    } catch {
      toast.error(t("common.error"))
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  const removeFile = async () => {
    stopSound()
    await deleteAdhan().catch(() => {})
    setAlerts({ adhanName: null, alertSound: alertSound === "adhan" ? "chime" : alertSound })
  }

  const preview = async () => {
    if (previewing) {
      stopSound()
      return setPreviewing(false)
    }
    if (alertSound === "chime") return playChime()
    setPreviewing(true)
    const played = await playAdhan()
    if (played === "chime") setPreviewing(false)
  }
  useEffect(() => () => stopSound(), [])

  return (
    <Card className="gap-3 px-4 py-3">
      <label className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          {alertsOn ? <BellIcon className="size-5" aria-hidden /> : <BellOffIcon className="size-5" aria-hidden />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{t("prayerAlert.toggle")}</span>
          <span className="block text-xs text-muted-foreground">{t("prayerAlert.hint")}</span>
        </span>
        <Switch checked={alertsOn} onCheckedChange={(v) => void toggle(v)} aria-label={t("prayerAlert.toggle")} />
      </label>

      {alertsOn && (
        <div className="space-y-3 border-t pt-3">
          {permission === "denied" && <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">{t("prayerAlert.blocked")}</p>}
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <Segmented
                aria-label={t("prayerAlert.sound")}
                value={alertSound}
                onChange={(v) => {
                  stopSound()
                  setPreviewing(false)
                  setAlerts({ alertSound: v as AlertSound })
                }}
                options={[
                  { value: "adhan", label: t("prayerAlert.adhan") },
                  { value: "chime", label: t("prayerAlert.chime") },
                  { value: "silent", label: t("prayerAlert.silent") },
                ]}
              />
            </div>
            {alertSound !== "silent" && (
              <Button size="icon" variant="outline" className="shrink-0" onClick={() => void preview()} aria-label={t("prayerAlert.preview")}>
                {previewing ? <SquareIcon /> : <PlayIcon />}
              </Button>
            )}
          </div>

          {alertSound === "adhan" && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2">
                <FileAudioIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm">{adhanName ?? t("prayerAlert.noFile")}</span>
                <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()} disabled={busy}>
                  {busy && <Loader2Icon className="animate-spin" />}
                  {t(adhanName ? "prayerAlert.change" : "prayerAlert.choose")}
                </Button>
                {adhanName && (
                  <Button size="icon" variant="ghost" className="size-8 text-destructive" onClick={() => void removeFile()} aria-label={t("prayerAlert.removeFile")}>
                    <Trash2Icon />
                  </Button>
                )}
              </div>
              <input ref={fileRef} type="file" accept="audio/*" className="sr-only" onChange={(e) => void pickFile(e.target.files?.[0])} aria-label={t("prayerAlert.choose")} />
              <p className="text-xs text-muted-foreground">{t("prayerAlert.fileHint")}</p>
            </div>
          )}
          <p className="text-xs text-muted-foreground">{t("prayerAlert.limit")}</p>
        </div>
      )}
    </Card>
  )
}
