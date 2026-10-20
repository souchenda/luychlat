"use client"

import { BellIcon, BellOffIcon, FileAudioIcon, Loader2Icon, PauseIcon, PlayIcon, Trash2Icon } from "lucide-react"
import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { toast } from "sonner"

import { Segmented } from "@/components/common/segmented"
import { useIslamicLocation } from "@/components/islamic/location-picker"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { AdhanGlobalButtons } from "@/components/islamic/adhan-global"
import { AdhanUploadSheet } from "@/components/islamic/adhan-upload-sheet"
import { adhanForPrayer, availablePresets, canPublishGlobally, CUSTOM_ADHAN, FAJR_ADHAN, fajrPreset, GLOBAL_ADHAN_PREFIX, presetById, resolvePreset } from "@/lib/adhan-presets"
import { useAdhanDefaults, useGlobalAdhanPresets, useRemoveGlobalAdhan } from "@/lib/adhan-presets-data"
import { usePlan } from "@/lib/plan"
import { type MessageKey, pick } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { enablePush, setPrayerPush } from "@/lib/push"
import { isNativeApp } from "@/lib/native-bridge"
import { cancelNativePrayers, requestNativePrayerPermissions, scheduleNativePrayers } from "@/lib/native-prayer"
import { cambodiaNow, formatMinutes, prayerTimes } from "@/lib/prayer"
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
  listenForStopAdhan,
  loadAdhan,
  showPrayerNotification,
  stopSound,
} from "@/lib/prayer-alerts"
import { cn } from "@/lib/utils"
import { useIslamicLocalStore, type AlertSound } from "@/stores/islamic-local-store"
import { useLocaleStore } from "@/stores/locale-store"


const usePlaying = () => useSyncExternalStore(onPlaybackChange, currentSource, () => null)

/**
 * Mounted once in the app layout: while LuyChlat is open (or in the
 * background), checks every 15 s whether a prayer time has arrived and alerts once.
 */
export function PrayerAlertScheduler() {
  const t = useT()
  const { alertsOn, alertSound, adhanPreset, adhanName, fajrAdhan } = useIslamicLocalStore()
  const location = useIslamicLocation()
  // The Adhans the admin published for everyone, beside the bundled ones.
  const global = useGlobalAdhanPresets()
  // The app-wide defaults (regular and Fajr) the Adhan manager sets.
  const defaults = useAdhanDefaults()
  const latest = useRef({ t, alertSound, adhanPreset, adhanName, fajrAdhan, location, global, defaults })
  latest.current = { t, alertSound, adhanPreset, adhanName, fajrAdhan, location, global, defaults }

  // The notification's «🔇 បិទសំឡេង» reaches the app through the service worker.
  useEffect(() => listenForStopAdhan(), [])

  // In the Android app (founder, 20/10/2026): the week's prayers as native alarms with the Adhan channel — they ring
  // with the screen locked and the app closed. Re-planned at every launch and whenever the place, sound or language
  // changes; the in-page timer below then stands down (never two Adhans). Off → the alarms are cancelled.
  const [nativeOn, setNativeOn] = useState(false)
  useEffect(() => {
    if (!isNativeApp()) return
    if (!alertsOn) {
      setNativeOn(false)
      void cancelNativePrayers().catch(() => {})
      return
    }
    const { t, location } = latest.current
    void scheduleNativePrayers({
      lat: location.lat,
      lng: location.lng,
      sound: alertSound,
      text: (prayer, time) => {
        const name = t(`prayer.${prayer}` as MessageKey)
        return { title: `🕌 ${t("prayerAlert.title", { name })}`, body: t("prayerAlert.body", { time, place: location.label }) }
      },
    })
      .then((count) => setNativeOn(count > 0))
      .catch(() => setNativeOn(false))
  }, [alertsOn, alertSound, location.lat, location.lng, location.label, t])

  useEffect(() => {
    if (!alertsOn || nativeOn) return
    const tick = () => {
      const { t, alertSound, adhanPreset, adhanName, fajrAdhan, location, global, defaults } = latest.current
      const clock = cambodiaNow()
      const times = prayerTimes(clock.date, location.lat, location.lng)
      const key = duePrayer(times, clock.minutes)
      if (!key || !claimAlert(alertId(clock.date, key))) return
      const name = t(`prayer.${key}` as MessageKey)
      const title = t("prayerAlert.title", { name })
      const body = t("prayerAlert.body", { time: formatMinutes(times[key]), place: location.label })
      const adhan = alertSound === "adhan"
      void showPrayerNotification(title, body, `prayer-${key}`, adhan ? t("prayerAlert.stopAdhan") : undefined)
      if (alertSound === "chime") playChime()
      if (adhan) void playAdhan({ ...adhanForPrayer(key, adhanPreset, fajrAdhan, !!adhanName, FAJR_ADHAN, global, defaults), title })
      if (document.visibilityState === "visible") {
        toast(title, {
          description: body,
          duration: alertSound === "adhan" ? 60_000 : 10_000,
          // 🔇 one tap: stops at once and resets to the start (also on the lock screen and the notification).
          action: adhan ? { label: t("prayerAlert.stopAdhan"), onClick: stopSound } : undefined,
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
  }, [alertsOn, nativeOn])

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

  const global = useGlobalAdhanPresets()
  const defaults = useAdhanDefaults()
  const presets = availablePresets(global)
  // The recording that will actually play (lib/adhan-presets resolvePreset); the phone's file otherwise.
  const selected = resolvePreset(adhanPreset, !!adhanName, global, defaults)?.id ?? CUSTOM_ADHAN
  const fajr = fajrPreset(global, defaults)
  // A super admin chooses where a file goes: this phone, or everyone (AdhanUploadSheet); a member's stays on the phone.
  const admin = canPublishGlobally(usePlan().plan.staff_role)
  const [pending, setPending] = useState<File | null>(null)
  // «⬆️ បង្ហោះ និងកំណត់ជាសកល» from the phone file (founder, 19/10/2026).
  const [toGlobal, setToGlobal] = useState<{ file: File; kind: "regular" | "fajr" } | null>(null)
  const publishPhoneFile = async (kind: "regular" | "fajr") => {
    const blob = await loadAdhan().catch(() => undefined)
    if (!blob) return void toast.error(t("common.error"))
    setToGlobal({ file: new File([blob], adhanName ?? "adhan.mp3", { type: blob.type || "audio/mpeg" }), kind })
  }
  const removeGlobal = useRemoveGlobalAdhan()

  const toggle = async (on: boolean) => {
    if (!on) {
      // The server's prayer push for this phone goes off with the switch (lib/prayer-push.ts).
      void setPrayerPush(false).catch(() => false)
      return setAlerts({ alertsOn: false })
    }
    // In the Android app: Android's own notification and exact-alarm permissions (the native Adhan).
    if (isNativeApp()) {
      const granted = await requestNativePrayerPermissions().catch(() => false)
      setAlerts({ alertsOn: true })
      return void toast.success(t(granted ? "prayerAlert.on" : "prayerAlert.onInApp"))
    }
    let result = permission
    if (result === "default") {
      result = await Notification.requestPermission()
      setPermission(result)
    }
    // Without notification permission the in-app sound and banner still work.
    setAlerts({ alertsOn: true })
    // With permission, this phone also gets the server's prayer push — it rings with the app closed (founder, 20/10/2026).
    if (result === "granted") void enablePush().then((state) => (state === "on" ? setPrayerPush(true) : false)).catch(() => false)
    toast.success(t(result === "granted" ? "prayerAlert.on" : "prayerAlert.onInApp"))
  }

  const choose = (id: string) => {
    setAlerts({ adhanPreset: id })
    // Fetch once so the service worker keeps it for offline alerts.
    const preset = presetById(id, global)
    if (preset?.file) void fetch(preset.file).catch(() => {})
  }

  const pickFile = async (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith("audio/")) return void toast.error(t("prayerAlert.notAudio"))
    if (file.size > ADHAN_MAX_BYTES) return void toast.error(t("prayerAlert.tooBig"))
    if (fileRef.current) fileRef.current.value = ""
    if (admin) return setPending(file)
    await keepOnDevice(file)
  }

  /** «សម្រាប់តែឧបករណ៍នេះ»: the file in this phone's IndexedDB, never uploaded. */
  const keepOnDevice = async (file: File) => {
    setBusy(true)
    try {
      await saveAdhan(file)
      setAlerts({ adhanName: file.name, alertSound: "adhan", adhanPreset: CUSTOM_ADHAN })
      toast.success(t("prayerAlert.adhanSaved"))
    } catch {
      toast.error(t("common.error"))
    } finally {
      setBusy(false)
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
                <div key={p.id} className={cn(row(selected === p.id), admin && "flex-wrap")}>
                  <button type="button" role="radio" aria-checked={selected === p.id} onClick={() => choose(p.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <span className={cn("size-4 shrink-0 rounded-full border-2", selected === p.id ? "border-primary bg-primary shadow-[inset_0_0_0_3px_var(--background)]" : "border-muted-foreground/40")} aria-hidden />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{pick(p.name, locale)}</span>
                      {p.credit && <span className="block truncate text-[11px] text-muted-foreground">{p.credit}</span>}
                    </span>
                  </button>
                  <PreviewButton id={p.id} onPlay={() => void playPreset(p.file!, p.id)} label={t("prayerAlert.preview")} />
                  {admin && p.id.startsWith(GLOBAL_ADHAN_PREFIX) && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-9 shrink-0 text-destructive"
                      disabled={removeGlobal.isPending}
                      aria-label={t("prayerAlert.removeGlobal")}
                      onClick={() =>
                        window.confirm(t("prayerAlert.removeGlobalConfirm")) &&
                        removeGlobal.mutate(p.id, { onSuccess: () => toast.success(t("prayerAlert.removedGlobal")), onError: () => toast.error(t("common.error")) })
                      }
                    >
                      <Trash2Icon />
                    </Button>
                  )}
                  {/* A content manager: this track as the default for everyone (founder, 19/10/2026). */}
                  {admin && <AdhanGlobalButtons presetId={p.id} defaults={defaults} />}
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
                {admin && adhanName && (
                  <div className="flex w-full flex-wrap gap-1.5">
                    <Button size="sm" variant="outline" className="h-8 px-2.5 text-[11px]" onClick={() => void publishPhoneFile("regular")}>
                      ⬆️ 🌐 {t("adhanUpload.publishRegular")}
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 px-2.5 text-[11px]" onClick={() => void publishPhoneFile("fajr")}>
                      ⬆️ 🌅 {t("adhanUpload.publishFajr")}
                    </Button>
                  </div>
                )}
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
              {admin && (
                <AdhanUploadSheet
                  file={pending}
                  onOpenChange={(open) => !open && setPending(null)}
                  onKeepOnDevice={keepOnDevice}
                  onPublished={(id) => {
                    setAlerts({ adhanPreset: id, alertSound: "adhan" })
                    setPending(null)
                  }}
                />
              )}
              {admin && (
                <AdhanUploadSheet
                  file={toGlobal?.file ?? null}
                  setAsDefault={toGlobal?.kind}
                  onOpenChange={(open) => !open && setToGlobal(null)}
                  onKeepOnDevice={keepOnDevice}
                  onPublished={() => setToGlobal(null)}
                />
              )}

              {fajr?.file && (
                <label className="flex items-center gap-3 rounded-xl bg-muted/50 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{t("prayerAlert.fajrAdhan")}</span>
                    <span className="block text-[11px] text-muted-foreground">{t("prayerAlert.fajrAdhanHint")}</span>
                  </span>
                  <PreviewButton id={fajr.id} onPlay={() => void playPreset(fajr.file!, fajr.id)} label={t("prayerAlert.preview")} />
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
