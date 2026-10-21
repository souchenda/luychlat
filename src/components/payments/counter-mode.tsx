"use client"

/**
 * 🏪 Counter Soundbox Mode (founder, 21/10/2026 — Task #442): on a shop's counter phone the screen stays on everywhere
 * in the app (a screen wake lock, taken again whenever the app comes back on screen — lib/soundbox.ts keepScreenAwake),
 * so the chime and the spoken amount (payment-chime-listener.tsx) are always heard. Business workspaces only, this
 * device only (prefs-store › counterMode). A web page cannot run with the screen locked: the phone stays plugged in, with
 * the app open.
 */
import { useEffect } from "react"

import { useWorkspaces } from "@/lib/data/hooks"
import { counterModeActive } from "@/lib/payment-chime"
import { keepScreenAwake } from "@/lib/soundbox"
import { usePrefsStore } from "@/stores/prefs-store"

export function CounterModeKeeper() {
  const on = usePrefsStore((s) => s.counterMode)
  const business = (useWorkspaces().data ?? []).some((w) => w.type === "BUSINESS")
  const active = counterModeActive({ on, business })
  useEffect(() => {
    if (!active) return
    return keepScreenAwake(navigator as Parameters<typeof keepScreenAwake>[0], document)
  }, [active])
  return null
}
