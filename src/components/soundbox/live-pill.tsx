"use client"

/**
 * «🟢 SoundBox កំពុងដំណើរការ» / «🔴 កំពុងភ្ជាប់ឡើងវិញ...» — whether the live payment connection is up (Task #463), shown
 * ON THE SOUNDBOX PAGE ONLY (founder, 22/10/2026): a floating pill over every screen covered the avatar, the workspace
 * switch, the language pill and the bell. Elsewhere the listening stays invisible.
 */
import { useLiveStatus } from "@/components/payments/live-status"
import { useT } from "@/lib/i18n/use-t"

export function SoundboxLivePill() {
  const live = useLiveStatus((s) => s.live)
  const t = useT()
  return (
    <div role="status" aria-live="polite" className="mx-auto flex w-fit items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-xs font-medium shadow-sm">
      <span aria-hidden className={`size-2 rounded-full ${live ? "bg-emerald-500" : "animate-pulse bg-rose-500"}`} />
      {/* Plainly connected or not (Task #483), then what the SoundBox is doing. */}
      <span className={live ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}>{t(live ? "soundbox.connected" : "soundbox.disconnected")}</span>
      <span aria-hidden>·</span>
      {t(live ? "soundbox.liveOn" : "soundbox.reconnecting")}
    </div>
  )
}
