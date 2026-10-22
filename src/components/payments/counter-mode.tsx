"use client"

/**
 * 🏪 Counter Soundbox Mode (founder, 21/10/2026 — Task #442): on a shop's counter phone the screen stays on everywhere
 * in the app (a screen wake lock, taken again whenever the app comes back on screen — lib/soundbox.ts keepScreenAwake),
 * so the chime and the spoken amount (payment-chime-listener.tsx) are always heard. Business workspaces only, this
 * device only (prefs-store › counterMode). A web page cannot run with the screen locked: the phone stays plugged in, with
 * the app open.
 */
import { useEffect } from "react"

import { useT } from "@/lib/i18n/use-t"

import { useWorkspaces } from "@/lib/data/hooks"
import { counterModeActive } from "@/lib/payment-chime"
import { keepScreenAwake } from "@/lib/soundbox"
import { usePrefsStore } from "@/stores/prefs-store"

import { useLiveStatus } from "./live-status"

export function CounterModeKeeper() {
  const on = usePrefsStore((s) => s.counterMode)
  const business = (useWorkspaces().data ?? []).some((w) => w.type === "BUSINESS")
  const active = counterModeActive({ on, business })
  useEffect(() => {
    if (!active) return
    return keepScreenAwake(navigator as Parameters<typeof keepScreenAwake>[0], document)
  }, [active])
  const live = useLiveStatus((s) => s.live)
  const t = useT()
  if (!active) return null
  // The counter phone says whether it is listening (Task #463): green «SoundBox កំពុងដំណើរការ», red while it reconnects.
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed top-[calc(env(safe-area-inset-top)+6px)] left-1/2 z-50 flex -translate-x-1/2 items-center gap-1.5 rounded-full border bg-background/95 px-3 py-1 text-xs font-medium shadow-sm backdrop-blur"
    >
      <span aria-hidden className={`size-2 rounded-full ${live ? "bg-emerald-500" : "animate-pulse bg-rose-500"}`} />
      {t(live ? "soundbox.liveOn" : "soundbox.reconnecting")}
    </div>
  )
}
