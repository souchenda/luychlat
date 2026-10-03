"use client"

import { BellIcon, BellOffIcon, FileAudioIcon, Loader2Icon, PauseIcon, PlayIcon, Trash2Icon } from "lucide-react"
import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { toast } from "sonner"

import { Segmented } from "@/components/common/segmented"
import { useIslamicLocation } from "@/components/islamic/location-picker"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { availablePresets, CUSTOM_ADHAN, FAJR_ADHAN, presetById } from "@/lib/adhan-presets"
import { type MessageKey, pick } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { cambodiaNow, formatMinutes, prayerTimes, type PrayerKey } from "@/lib/prayer"
import {
  ADHAN_MAX_BYTES,
  alertId,
  claimAlert,
  currentSource,
  deleteAdhan,
  duePrayer,
  notificationsSupported,
  onPlaybackChange,
  playAdhan,
  playChime,
  playPreset,
  saveAdhan,
  showPrayerNotification,
  stopSound,
} from "@/lib/prayer-alerts"
import { cn } from "@/lib/utils"
import { useIslamicLocalStore, type AlertSound } from "@/stores/islamic-local-store"
import { useLocaleStore } from "@/stores/locale-store"

/** The recording for a prayer: the Fajr Adhan at Fajr (when on), else the chosen preset, else the phone's file. */
function adhanFor(prayer: PrayerKey | null, presetId: string, fajrAdhan: boolean): { presetFile?: string; presetId?: string } {
  if (prayer === "fajr" && fajrAdhan && FAJR_ADHAN.file) return { presetFile: FAJR_ADHAN.file, presetId: FAJR_ADHAN.id }
  const preset = presetById(presetId)
  return preset?.file ? { presetFile: preset.file, presetId: preset.id } : {}
}

const usePlaying = () => useSyncExternalStore(onPlaybackChange, currentSource, () => null)

/**
 * Mounted once in the app layout: while LuyChlat is open (or in the
 * background), checks every 15 s whether a prayer time has arrived and alerts once.
 */
export function PrayerAlertScheduler() {
  const t = useT()
  const { alertsOn, alertSound, adhanPreset, fajrAdhan } = useIslamicLocalStore()
  const location = useIslamicLocation()
  const latest = useRef({ t, alertSound, adhanPreset, fajrAdhan, location })
  latest.current = { t, alertSound, adhanPreset, fajrAdhan, location }

  useEffect(() => {
    if (!alertsOn) return
    const tick = () => {
      const { t, alertSound, adhanPreset, fajrAdhan, location } = latest.current
      const clock = cambodiaNow()
      const times = prayerTimes(clock.date, location.lat, location.lng)
      const key = duePrayer(times, clock.minutes)
      if (!key || !claimAlert(alertId(clock.date, key))) return
      const name = t(`prayer.${key}` as MessageKey)
      const title = t("prayerAlert.title", { name })
      const body = t("prayerAlert.body", { time: formatMinutes(times[key]), place: location.label })
      void showPrayerNotification(title, body, `prayer-${key}`)
      if (alertSound === "chime") playChime()
      if (alertSound === "adhan") void playAdhan(adhanFor(key, adhanPreset, fajrAdhan))
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

/** ▶ / ⏸ for one recording. */
function PreviewButton({ id, onPlay, label }: { id: string; onPlay: () => void; label: string }) {
  const playing = usePlaying() === id
  return (
    <Button size="icon" variant={playing ? "default" : "outline"} className="size-9 shrink-0 rounded-full" onClick={() => (playing ? stopSound() : onPlay())} aria-label={label} aria-pressed={playing}>
      {playing ? <PauseIcon /> : <PlayIcon />}
    </Button>
  )
}

/** Prayer page card: turn alerts on (asks the browser), choose Adhan / chime / silent, and which Adhan. */
export function PrayerAlertSettings() {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const { alertsOn, alertSound, adhanName, adhanPreset, fajrAdhan, setAlerts } = useIslamicLocalStore()
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default")
  useEffect(() => setPermission(notificationsSupported() ? Notification.permission : "unsupported"), [])
  useEffect(() => () => stopSound(), [])

  const presets = availablePresets()
  // Without built-in recordings, the phone's file is the only Adhan choice.
  const selected = presetById(adhanPreset) ? adhanPreset : CUSTOM_ADHAN

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

  const choose = (id: string) => {
    setAlerts({ adhanPreset: id })
    // Fetch once so the service worker keeps it for offline alerts.
    const preset = presetById(id)
    if (preset?.file) void fetch(preset.file).catch(() => {})
  }

  const pickFile = async (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith("audio/")) return void toast.error(t("prayerAlert.notAudio"))
    if (file.size > ADHAN_MAX_BYTES) return void toast.error(t("prayerAlert.tooBig"))
    setBusy(true)
    try {
      await saveAdhan(file)
      setAlerts({ adhanName: file.name, alertSound: "adhan", adhanPreset: CUSTOM_ADHAN })
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
    setAlerts({ adhanName: null, adhanPreset: presets[0]?.id ?? CUSTOM_ADHAN, alertSound: alertSound === "adhan" && !presets.length ? "chime" : alertSound })
  }

  const row = (active: boolean) => cn("flex items-center gap-3 rounded-xl border px-3 py-2", active && "border-primary bg-primary/5 ring-1 ring-primary")

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
                  setAlerts({ alertSound: v as AlertSound })
                }}
                options={[
                  { value: "adhan", label: t("prayerAlert.adhan") },
                  { value: "chime", label: t("prayerAlert.chime") },
                  { value: "silent", label: t("prayerAlert.silent") },
                ]}
              />
            </div>
            {alertSound === "chime" && (
              <Button size="icon" variant="outline" className="size-9 shrink-0 rounded-full" onClick={playChime} aria-label={t("prayerAlert.preview")}>
                <PlayIcon />
              </Button>
            )}
          </div>

          {alertSound === "adhan" && (
            <div className="space-y-2" role="radiogroup" aria-label={t("prayerAlert.adhan")}>
              {presets.map((p) => (
                <div key={p.id} className={row(selected === p.id)}>
                  <button type="button" role="radio" aria-checked={selected === p.id} onClick={() => choose(p.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <span className={cn("size-4 shrink-0 rounded-full border-2", selected === p.id ? "border-primary bg-primary shadow-[inset_0_0_0_3px_var(--background)]" : "border-muted-foreground/40")} aria-hidden />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{pick(p.name, locale)}</span>
                      {p.credit && <span className="block truncate text-[11px] text-muted-foreground">{p.credit}</span>}
                    </span>
                  </button>
                  <PreviewButton id={p.id} onPlay={() => void playPreset(p.file!, p.id)} label={t("prayerAlert.preview")} />
                </div>
              ))}

              {/* Advanced: an Adhan file from the phone (kept on this device). */}
              <div className={cn(row(selected === CUSTOM_ADHAN), "flex-wrap")}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected === CUSTOM_ADHAN}
                  onClick={() => (adhanName ? choose(CUSTOM_ADHAN) : fileRef.current?.click())}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span className={cn("size-4 shrink-0 rounded-full border-2", selected === CUSTOM_ADHAN ? "border-primary bg-primary shadow-[inset_0_0_0_3px_var(--background)]" : "border-muted-foreground/40")} aria-hidden />
                  <FileAudioIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{adhanName ?? t(presets.length ? "prayerAlert.customFile" : "prayerAlert.noFile")}</span>
                    <span className="block text-[11px] text-muted-foreground">{t("prayerAlert.customHint")}</span>
                  </span>
                </button>
                {adhanName && <PreviewButton id={CUSTOM_ADHAN} onPlay={() => void playAdhan()} label={t("prayerAlert.preview")} />}
                <div className="flex w-full justify-end gap-1">
                  <Button size="sm" variant="ghost" className="h-7" onClick={() => fileRef.current?.click()} disabled={busy}>
                    {busy && <Loader2Icon className="animate-spin" />}
                    {t(adhanName ? "prayerAlert.change" : "prayerAlert.choose")}
                  </Button>
                  {adhanName && (
                    <Button size="icon" variant="ghost" className="size-7 text-destructive" onClick={() => void removeFile()} aria-label={t("prayerAlert.removeFile")}>
                      <Trash2Icon />
                    </Button>
                  )}
                </div>
              </div>
              <input ref={fileRef} type="file" accept="audio/*" className="sr-only" onChange={(e) => void pickFile(e.target.files?.[0])} aria-label={t("prayerAlert.choose")} />

              {FAJR_ADHAN.file && (
                <label className="flex items-center gap-3 rounded-xl bg-muted/50 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{t("prayerAlert.fajrAdhan")}</span>
                    <span className="block text-[11px] text-muted-foreground">{t("prayerAlert.fajrAdhanHint")}</span>
                  </span>
                  <PreviewButton id={FAJR_ADHAN.id} onPlay={() => void playPreset(FAJR_ADHAN.file!, FAJR_ADHAN.id)} label={t("prayerAlert.preview")} />
                  <Switch checked={fajrAdhan} onCheckedChange={(v) => setAlerts({ fajrAdhan: v })} aria-label={t("prayerAlert.fajrAdhan")} />
                </label>
              )}
              {!presets.length && <p className="text-xs text-muted-foreground">{t("prayerAlert.fileHint")}</p>}
            </div>
          )}
          <p className="text-xs text-muted-foreground">{t("prayerAlert.limit")}</p>
        </div>
      )}
    </Card>
  )
}
