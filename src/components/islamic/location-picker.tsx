"use client"

import { Loader2Icon, LocateFixedIcon, MapPinIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

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

/** Province dropdown + "use my location" (GPS stays on this device, rounded to ~1 km). */
export function LocationPicker() {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const { place, gps, setProvince, setGps } = useIslamicLocalStore()
  const [locating, setLocating] = useState(false)

  const locate = () => {
    if (!("geolocation" in navigator)) return void toast.error(t("prayer.gpsUnavailable"))
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps(pos.coords.latitude, pos.coords.longitude)
        setLocating(false)
        toast.success(t("prayer.gpsSet"))
      },
      () => {
        setLocating(false)
        toast.error(t("prayer.gpsDenied"))
      },
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 10 * 60_000 },
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={place === "gps" && gps ? "gps" : place} onValueChange={(v) => (v === "gps" ? locate() : setProvince(v))}>
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
      <Button type="button" variant="outline" className="h-10 shrink-0" onClick={locate} disabled={locating} aria-label={t("prayer.useGps")}>
        {locating ? <Loader2Icon className="animate-spin" /> : <LocateFixedIcon />}
        <span className="hidden min-[380px]:inline">{t("prayer.useGps")}</span>
      </Button>
    </div>
  )
}
