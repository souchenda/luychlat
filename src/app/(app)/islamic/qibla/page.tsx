"use client"

import { CompassIcon, InfoIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { LocationPicker, useIslamicLocation } from "@/components/islamic/location-picker"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useT } from "@/lib/i18n/use-t"
import { qiblaBearing } from "@/lib/prayer"
import { cn } from "@/lib/utils"

type OrientationEventWithCompass = DeviceOrientationEvent & { webkitCompassHeading?: number }
type PermissionRequester = { requestPermission?: () => Promise<"granted" | "denied"> }

const ALIGNED_DEGREES = 5
const khmerDigits = (value: string) => value.replace(/\d/g, (d) => "០១២៣៤៥៦៧៨៩"[Number(d)])

/** Device heading from the compass (iOS: webkitCompassHeading; Android: absolute alpha). Null until available. */
function useHeading(enabled: boolean): number | null {
  const [heading, setHeading] = useState<number | null>(null)
  useEffect(() => {
    if (!enabled) return
    const onIos = (e: Event) => {
      const h = (e as OrientationEventWithCompass).webkitCompassHeading
      if (typeof h === "number") setHeading(h)
    }
    const onAbsolute = (e: Event) => {
      const alpha = (e as DeviceOrientationEvent).alpha
      if (typeof alpha === "number" && (e as DeviceOrientationEvent).absolute !== false) setHeading((360 - alpha) % 360)
    }
    window.addEventListener("deviceorientationabsolute", onAbsolute)
    window.addEventListener("deviceorientation", onIos)
    return () => {
      window.removeEventListener("deviceorientationabsolute", onAbsolute)
      window.removeEventListener("deviceorientation", onIos)
    }
  }, [enabled])
  return heading
}

/** Qibla direction: a live compass when the phone has one, otherwise the bearing on a north-up dial. */
export default function QiblaPage() {
  const t = useT()
  const location = useIslamicLocation()
  const qibla = qiblaBearing(location.lat, location.lng)
  const [enabled, setEnabled] = useState(false)
  const [denied, setDenied] = useState(false)
  const heading = useHeading(enabled)
  const live = heading !== null
  // Dial rotates so N points north; the Kaaba arrow sits at the Qibla bearing on the dial.
  const dialRotation = live ? -heading : 0
  const diff = live ? ((qibla - heading + 540) % 360) - 180 : null
  const aligned = diff !== null && Math.abs(diff) <= ALIGNED_DEGREES
  const buzzed = useRef(false)

  useEffect(() => {
    if (aligned && !buzzed.current) {
      buzzed.current = true
      navigator.vibrate?.(60)
    }
    if (!aligned) buzzed.current = false
  }, [aligned])

  const start = async () => {
    const requester = (window.DeviceOrientationEvent as unknown as PermissionRequester | undefined)?.requestPermission
    if (requester) {
      try {
        if ((await requester()) !== "granted") return setDenied(true)
      } catch {
        return setDenied(true)
      }
    }
    setEnabled(true)
  }

  const degrees = Math.round(qibla)
  return (
    <div className="space-y-4">
      <LocationPicker />

      <Card className="items-center gap-4 px-4 py-6">
        <div className="relative size-64">
          {/* Dial */}
          <div className="absolute inset-0 rounded-full border-4 border-muted bg-card shadow-inner transition-transform duration-200 ease-out" style={{ transform: `rotate(${dialRotation}deg)` }}>
            {(["N", "E", "S", "W"] as const).map((d, i) => (
              <span
                key={d}
                className={cn("absolute left-1/2 top-1/2 -ml-2.5 -mt-2.5 flex size-5 items-center justify-center text-sm font-bold", d === "N" ? "text-rose-600" : "text-muted-foreground")}
                style={{ transform: `rotate(${i * 90}deg) translateY(-112px) rotate(${-i * 90}deg)` }}
              >
                {d}
              </span>
            ))}
            {Array.from({ length: 36 }, (_, i) => (
              <span key={i} className="absolute left-1/2 top-1/2 h-2 w-px -ml-px origin-top bg-muted-foreground/40" style={{ transform: `rotate(${i * 10}deg) translateY(-124px)` }} />
            ))}
            {/* Kaaba direction */}
            <div className="absolute inset-0" style={{ transform: `rotate(${qibla}deg)` }}>
              <div className={cn("absolute bottom-1/2 left-1/2 -ml-1 h-24 w-2 rounded-full", aligned ? "bg-emerald-500" : "bg-amber-500")} />
              <span
                className="absolute left-1/2 top-[18px] -ml-3.5 flex size-7 items-center justify-center text-xl"
                style={{ transform: `rotate(${-qibla - dialRotation}deg)` }}
                aria-hidden
              >
                🕋
              </span>
            </div>
          </div>
          {/* Phone's pointing direction */}
          <div className="absolute left-1/2 top-0 -ml-2 h-0 w-0 border-x-8 border-t-[14px] border-x-transparent border-t-foreground" aria-hidden />
          <div className="absolute left-1/2 top-1/2 -ml-2 -mt-2 size-4 rounded-full bg-foreground" aria-hidden />
        </div>

        <div className="text-center">
          <p className={cn("text-lg font-bold", aligned && "text-emerald-600 dark:text-emerald-400")}>
            {aligned ? t("qibla.aligned") : t("qibla.bearing", { degrees: khmerDigits(String(degrees)) })}
          </p>
          <p className="text-xs text-muted-foreground">{location.label}</p>
        </div>

        {!live && (
          <Button type="button" onClick={start} className="w-full">
            <CompassIcon />
            {t("qibla.start")}
          </Button>
        )}
        {enabled && !live && <p className="text-center text-xs text-muted-foreground">{t("qibla.waiting")}</p>}
        {denied && <p className="text-center text-xs text-destructive">{t("qibla.denied")}</p>}
      </Card>

      <p className="flex items-start gap-2 px-1 text-xs text-muted-foreground">
        <InfoIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        {t("qibla.hint")}
      </p>
    </div>
  )
}
