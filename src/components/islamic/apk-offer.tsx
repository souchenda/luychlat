"use client"

import { BellRingIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { APK_OFFER_KEY, APK_URL, shouldOfferApk } from "@/lib/apk-offer"
import { useT } from "@/lib/i18n/use-t"
import { isNativeApp } from "@/lib/native-bridge"
import { useIslamicLocalStore } from "@/stores/islamic-local-store"

const readSnooze = (): number | null => {
  try {
    const v = Number(window.localStorage.getItem(APK_OFFER_KEY))
    return Number.isFinite(v) && v > 0 ? v : null
  } catch {
    return null
  }
}

/** «🔔 ដំឡើងអេប លុយឆ្លាត សម្រាប់ Android…» with [ទាញយក APK] [ពេលក្រោយ] — Android Chrome only (lib/apk-offer.ts). */
export function ApkOffer() {
  const t = useT()
  const alertsOn = useIslamicLocalStore((s) => s.alertsOn)
  const [show, setShow] = useState(false)
  useEffect(() => {
    setShow(shouldOfferApk({ ua: navigator.userAgent, native: isNativeApp(), alertsOn, snoozedAt: readSnooze(), now: Date.now() }))
  }, [alertsOn])
  if (!show) return null

  const later = () => {
    try {
      window.localStorage.setItem(APK_OFFER_KEY, String(Date.now()))
    } catch {
      // Private mode: hidden for this visit only.
    }
    setShow(false)
  }

  return (
    <Card className="gap-2 border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
      <p className="flex items-start gap-2 text-sm font-medium leading-relaxed">
        <BellRingIcon className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
        {t("apkOffer.title")}
      </p>
      <p className="text-xs text-muted-foreground">{t("apkOffer.note")}</p>
      <div className="flex gap-2">
        <Button asChild size="sm" className="h-10 flex-1">
          <a href={APK_URL} download>
            {t("apkOffer.download")}
          </a>
        </Button>
        <Button size="sm" variant="outline" className="h-10 flex-1" onClick={later}>
          {t("apkOffer.later")}
        </Button>
      </div>
    </Card>
  )
}
