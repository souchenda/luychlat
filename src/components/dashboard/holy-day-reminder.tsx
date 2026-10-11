"use client"

import { XIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { useActiveWorkspace } from "@/lib/data/hooks"
import { holyDayReminder, holyDayReminderAllowed } from "@/lib/holy-day-alerts"
import { useT } from "@/lib/i18n/use-t"
import { useIslamicSettings } from "@/lib/islamic-settings"
import { playTempleBell } from "@/lib/temple-bell-player"
import { usePrefsStore } from "@/stores/prefs-store"

const seenKey = (day: string, stage: string) => `holy_day_reminder:${day}:${stage}`

/**
 * Home, from 07:00 the day before a holy day and on the day: «🪷 ថ្ងៃស្អែក / ថ្ងៃនេះជាថ្ងៃសីល» with a
 * gentle question about the offerings, and one soft temple bell (Settings › «សំឡេងរំលឹកថ្ងៃសីល»).
 * Strictly the Personal workspace — never a business (nor Family) — and nothing at all with
 * Islamic Mode on. Once per day and stage on this device; ✕ hides it.
 */
export function HolyDayReminder() {
  const t = useT()
  const { workspace } = useActiveWorkspace()
  const { settings, loaded } = useIslamicSettings()
  const chime = usePrefsStore((s) => s.holyDayChime)
  const [reminder] = useState(() => holyDayReminder(Date.now()))
  const [show, setShow] = useState(false)
  // Decided once the workspace and Islamic Mode are known: never shown, then taken back.
  const allowed = loaded && Boolean(workspace) && holyDayReminderAllowed({ workspaceType: workspace?.type, islamic: settings.enabled })

  useEffect(() => {
    if (!reminder || !allowed) return setShow(false)
    const key = seenKey(reminder.day, reminder.stage)
    let seen = false
    try {
      seen = localStorage.getItem(key) === "1"
      localStorage.setItem(key, "1")
    } catch {}
    if (seen) return
    setShow(true)
    if (chime) playTempleBell()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when it becomes allowed
  }, [allowed])

  if (!show || !reminder || !allowed) return null
  return (
    <section className="relative overflow-hidden rounded-2xl border border-amber-200/70 bg-linear-to-br from-amber-50 to-emerald-50 p-4 shadow-sm animate-in fade-in-0 slide-in-from-bottom-2 duration-500 dark:border-amber-900/50 dark:from-amber-500/10 dark:to-emerald-500/10">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-amber-900 dark:text-amber-200">{reminder.title}</p>
          <p className="mt-1 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">{reminder.ask}</p>
        </div>
        <button type="button" onClick={() => setShow(false)} aria-label={t("common.close")} className="-m-1 rounded-full p-2 text-muted-foreground hover:bg-white/60 dark:hover:bg-white/10">
          <XIcon className="size-4" />
        </button>
      </div>
    </section>
  )
}

/** Settings: «🪷 សំឡេងរំលឹកថ្ងៃសីល» on / off (this device; on by default). Hidden with Islamic Mode on. */
export function useHolyDayChimeSetting() {
  const { settings } = useIslamicSettings()
  const on = usePrefsStore((s) => s.holyDayChime)
  const set = usePrefsStore((s) => s.setHolyDayChime)
  return { visible: !settings.enabled, on, set }
}
