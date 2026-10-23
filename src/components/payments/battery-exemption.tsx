"use client"

/**
 * «🔋 អនុញ្ញាតឱ្យប្រើថ្មពេលនៅខាងក្រោយ» (founder, 23/10/2026 — Task #473): in the Android app (1.6+), while the SoundBox or
 * the counter mode is on, a short Khmer explanation and one tap to Android's «Allow unrestricted battery» prompt —
 * without it Android may still hold the payment alerts while the screen is off. Hidden once allowed, in a browser and in
 * older APKs (no way to ask there).
 */
import { BatteryChargingIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { useT } from "@/lib/i18n/use-t"
import { batteryExempt, requestBatteryExemption } from "@/lib/native-keepalive"

export function BatteryExemptionCard() {
  const t = useT()
  const [exempt, setExempt] = useState<boolean | null>(null)
  useEffect(() => {
    const check = () => void batteryExempt().then(setExempt)
    check()
    // Back from Android's prompt: checked again.
    document.addEventListener("visibilitychange", check)
    return () => document.removeEventListener("visibilitychange", check)
  }, [])
  if (exempt !== false) return null
  return (
    <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-3">
      <p className="flex items-start gap-2 text-sm font-medium text-amber-900 dark:text-amber-200">
        <BatteryChargingIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
        {t("soundbox.batteryTitle")}
      </p>
      <p className="text-xs text-amber-900/80 dark:text-amber-200/80">{t("soundbox.batteryHint")}</p>
      <Button type="button" size="sm" className="h-10 w-full rounded-xl" onClick={() => void requestBatteryExemption()}>
        {t("soundbox.batteryAllow")}
      </Button>
    </div>
  )
}
