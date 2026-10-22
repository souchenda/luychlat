"use client"

import { Loader2Icon, LocateFixedIcon, MapPinIcon, MapPinOffIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useT } from "@/lib/i18n/use-t"
import { deviceUtcOffset, inCambodia, prayerUtcOffset, PROVINCES } from "@/lib/prayer"
import { pushProvince } from "@/lib/prayer-push"
import { setPrayerProvince, setPrayerPush } from "@/lib/push"
import { useIslamicLocalStore } from "@/stores/islamic-local-store"
import { useLocaleStore } from "@/stores/locale-store"
import { pick } from "@/lib/i18n/dictionaries"

/**
 * The place used for prayer times and the Qibla: the last GPS fix (kept on this phone) or a province (default Phnom
 * Penh), with the clock its times are kept in — Cambodia time, or the phone's own zone abroad (lib/prayer prayerUtcOffset).
 */
export function useIslamicLocation(): { lat: number; lng: number; label: string; gps: boolean; utcOffset: number; abroad: boolean } {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const { place, gps } = useIslamicLocalStore()
  if (place === "gps" && gps) {
    const utcOffset = prayerUtcOffset(gps, deviceUtcOffset())
    return { ...gps, label: t("prayer.myLocation"), gps: true, utcOffset, abroad: !inCambodia(gps.lat, gps.lng) }
  }
  const p = PROVINCES.find((x) => x.key === place) ?? PROVINCES[0]
  return { lat: p.lat, lng: p.lng, label: pick(p, locale), gps: false, utcOffset: 7, abroad: false }
}

const REFRESH_MS = 30 * 60_000
let lastRefresh = 0

/**
 * «My location» follows the phone (founder, 22/10/2026): with the location already allowed, the fix is refreshed quietly
 * at most every 30 minutes while the app is open — never a permission prompt (the Permissions API says «granted» first).
 */
export function useGpsRefresh() {
  const { place, setGps } = useIslamicLocalStore()
  useEffect(() => {
    if (place !== "gps" || typeof navigator === "undefined" || !navigator.permissions?.query) return
    const refresh = async () => {
      if (Date.now() - lastRefresh < REFRESH_MS) return
      const state = await navigator.permissions.query({ name: "geolocation" as PermissionName }).then(
        (s) => s.state,
        () => "prompt",
      )
      if (state !== "granted") return
      lastRefresh = Date.now()
      const result = await locateDevice()
      if (result.ok) setGps(result.lat, result.lng)
    }
    void refresh()
    const id = window.setInterval(() => void refresh(), REFRESH_MS)
    return () => window.clearInterval(id)
  }, [place, setGps])
}

/**
 * Keeps the server's prayer push on this phone's place (founder, 21/10/2026): the province picked here — or, with «my
 * location», the nearest province (the GPS stays on the phone) — is saved on this phone's push subscription whenever it
 * changes, so the lock screen rings at the same minute, with the same place, as the app.
 */
export function usePrayerProvinceSync() {
  const { place, gps, pushPausedAbroad, setPushPausedAbroad } = useIslamicLocalStore()
  const province = pushProvince(place, gps, PROVINCES)
  // Abroad (a GPS fix outside Cambodia) the server would ring at a Cambodian province's time: this phone's push is
  // paused — the in-app Adhan follows the place itself — and turned back on once the fix is home again.
  const abroad = place === "gps" && !!gps && !inCambodia(gps.lat, gps.lng)
  useEffect(() => {
    if (abroad) {
      if (!pushPausedAbroad) void setPrayerPush(false).then((ok) => ok && setPushPausedAbroad(true)).catch(() => false)
      return
    }
    if (pushPausedAbroad) void setPrayerPush(true).then((ok) => ok && setPushPausedAbroad(false)).catch(() => false)
    void setPrayerProvince(province).catch(() => false)
  }, [abroad, province, pushPausedAbroad, setPushPausedAbroad])
}

export type LocateResult = { ok: true; lat: number; lng: number } | { ok: false; reason: "denied" | "unavailable" | "insecure" | "unsupported" }

const position = (options: PositionOptions) =>
  new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, options))

/**
 * Fast first: a network/Wi-Fi fix (no GPS warm-up, a cached one up to 30 min
 * old is fine for prayer times), then one GPS attempt if that times out or
 * finds nothing. Permission denied is reported straight away.
 */
export async function locateDevice(): Promise<LocateResult> {
  if (typeof window === "undefined" || !("geolocation" in navigator)) return { ok: false, reason: "unsupported" }
  // Browsers only give the location to https pages (and localhost).
  if (!window.isSecureContext) return { ok: false, reason: "insecure" }
  const attempts: PositionOptions[] = [
    { enableHighAccuracy: false, timeout: 7_000, maximumAge: 30 * 60_000 },
    { enableHighAccuracy: true, timeout: 12_000, maximumAge: 0 },
  ]
  for (const options of attempts) {
    try {
      const pos = await position(options)
      return { ok: true, lat: pos.coords.latitude, lng: pos.coords.longitude }
    } catch (e) {
      if ((e as GeolocationPositionError).code === 1) return { ok: false, reason: "denied" }
    }
  }
  return { ok: false, reason: "unavailable" }
}

/**
 * No GPS (permission refused, the APK without the location permission, no fix): the nearest province from the
 * network (GET /api/geo — lib/network-place.ts), or null — the last province chosen then stays (founder, 22/10/2026).
 */
export async function networkProvince(): Promise<string | null> {
  try {
    const res = await fetch("/api/geo", { cache: "no-store" })
    const body = (await res.json()) as { province?: string | null }
    return res.ok && body.province && PROVINCES.some((p) => p.key === body.province) ? body.province : null
  } catch {
    return null
  }
}

/** Province dropdown + "use my location" (GPS stays on this device, rounded to ~1 km). */
export function LocationPicker() {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const { place, gps, setProvince, setGps } = useIslamicLocalStore()
  const [locating, setLocating] = useState(false)
  const [help, setHelp] = useState(false)

  const locate = async () => {
    setLocating(true)
    const result = await locateDevice()
    setLocating(false)
    if (result.ok) {
      setGps(result.lat, result.lng)
      return void toast.success(t("prayer.gpsSet"))
    }
    // No GPS: the network's province instead of a blocking dialog — said to be approximate; the help one tap away.
    setLocating(true)
    const province = await networkProvince()
    setLocating(false)
    const help = result.reason === "denied" ? { action: { label: t("prayer.gpsHelpTitle"), onClick: () => setHelp(true) } } : {}
    if (province) {
      setProvince(province)
      const p = PROVINCES.find((x) => x.key === province)!
      return void toast.success(t("prayer.networkSet", { place: pick(p, locale) }), { duration: 8_000, ...help })
    }
    // Nothing from the network either: the last province stays, and the person is told which.
    const kept = PROVINCES.find((x) => x.key === place) ?? PROVINCES[0]
    toast.error(t("prayer.networkNone", { place: pick(kept, locale) }), { duration: 8_000, ...help })
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={place === "gps" && gps ? "gps" : place} onValueChange={(v) => (v === "gps" ? void locate() : setProvince(v))}>
        <SelectTrigger className="h-10 min-w-0 flex-1" aria-label={t("prayer.location")}>
          <MapPinIcon className="size-4 text-primary" aria-hidden />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {gps && <SelectItem value="gps">{t("prayer.myLocation")}</SelectItem>}
          {PROVINCES.map((p) => (
            <SelectItem key={p.key} value={p.key}>
              {pick(p, locale)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="button" variant="outline" className="h-10 shrink-0" onClick={() => void locate()} disabled={locating} aria-label={t("prayer.useGps")}>
        {locating ? <Loader2Icon className="animate-spin" /> : <LocateFixedIcon />}
        <span className="hidden min-[380px]:inline">{t("prayer.useGps")}</span>
      </Button>

      <BottomSheet open={help} onOpenChange={setHelp} title={t("prayer.gpsHelpTitle")} description={t("prayer.gpsHelpIntro")}>
        <div className="space-y-4 text-sm">
          <div className="flex justify-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <MapPinOffIcon className="size-7" aria-hidden />
            </span>
          </div>
          {(["android", "iphone", "app"] as const).map((k) => (
            <section key={k} className="space-y-1 rounded-xl bg-muted/60 p-3">
              <h3 className="font-semibold">{t(`prayer.gpsHelp.${k}Title`)}</h3>
              <p className="whitespace-pre-line text-muted-foreground">{t(`prayer.gpsHelp.${k}`)}</p>
            </section>
          ))}
          <p className="text-xs text-muted-foreground">{t("prayer.gpsHelpProvince")}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => setHelp(false)}>
              {t("common.close")}
            </Button>
            <Button
              onClick={() => {
                setHelp(false)
                void locate()
              }}
            >
              <LocateFixedIcon />
              {t("prayer.gpsRetry")}
            </Button>
          </div>
        </div>
      </BottomSheet>
    </div>
  )
}
