"use client"

import { Loader2Icon, LocateFixedIcon, MapPinIcon, MapPinOffIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useT } from "@/lib/i18n/use-t"
import { PROVINCES } from "@/lib/prayer"
import { useIslamicLocalStore } from "@/stores/islamic-local-store"
import { useLocaleStore } from "@/stores/locale-store"

/** The place used for prayer times and the Qibla: a saved GPS fix or a province (default Phnom Penh). */
export function useIslamicLocation(): { lat: number; lng: number; label: string; gps: boolean } {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const { place, gps } = useIslamicLocalStore()
  if (place === "gps" && gps) return { ...gps, label: t("prayer.myLocation"), gps: true }
  const p = PROVINCES.find((x) => x.key === place) ?? PROVINCES[0]
  return { lat: p.lat, lng: p.lng, label: p[locale], gps: false }
}

type LocateResult = { ok: true; lat: number; lng: number } | { ok: false; reason: "denied" | "unavailable" | "insecure" | "unsupported" }

const position = (options: PositionOptions) =>
  new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, options))

/**
 * Fast first: a network/Wi-Fi fix (no GPS warm-up, a cached one up to 30 min
 * old is fine for prayer times), then one GPS attempt if that times out or
 * finds nothing. Permission denied is reported straight away.
 */
async function locateDevice(): Promise<LocateResult> {
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
      toast.success(t("prayer.gpsSet"))
    } else if (result.reason === "denied") setHelp(true)
    else if (result.reason === "unavailable") toast.error(t("prayer.gpsTimeout"))
    else toast.error(t(result.reason === "insecure" ? "prayer.gpsInsecure" : "prayer.gpsUnavailable"))
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
              {p[locale]}
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
