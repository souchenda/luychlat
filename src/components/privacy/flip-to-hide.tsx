"use client"

/**
 * Flip to hide (founder, 22/10/2026 — Task #461; lib/flip-to-hide.ts): while the balances are shown and the setting is
 * on, the phone's tilt is read; laid face down, the balances are masked and the phone buzzes once (50 ms). Hiding only —
 * showing them again is the eye's tap. iOS lets a page read the tilt only after a tap asks (`askMotionOnce`, called from
 * the eye and the Settings switch); Android and others need no asking.
 */
import { useEffect } from "react"

import { createFlipDetector, requestMotionPermission } from "@/lib/flip-to-hide"
import { usePrefsStore } from "@/stores/prefs-store"

let asked = false
/** From a tap (iOS needs one): ask for the tilt once per visit. */
export function askMotionOnce(): void {
  if (asked || typeof window === "undefined") return
  asked = true
  void requestMotionPermission((window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<"granted" | "denied"> } }).DeviceOrientationEvent)
}

export function FlipToHideListener() {
  const on = usePrefsStore((s) => s.flipToHide)
  const hidden = usePrefsStore((s) => s.hideBalances)
  const setHidden = usePrefsStore((s) => s.setHideBalances)
  useEffect(() => {
    if (!on || hidden || typeof window === "undefined" || !("DeviceOrientationEvent" in window)) return
    const detector = createFlipDetector()
    const onTilt = (e: DeviceOrientationEvent) => {
      if (!detector.sample(e.beta, e.timeStamp || performance.now())) return
      setHidden(true)
      navigator.vibrate?.(50)
    }
    window.addEventListener("deviceorientation", onTilt)
    return () => window.removeEventListener("deviceorientation", onTilt)
  }, [on, hidden, setHidden])
  return null
}
