"use client"

import { MoonStarIcon, PlayIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { useT } from "@/lib/i18n/use-t"
import { closingClipSequence, closingDue, readClosing, shownAmount, writeClosing, type ClosingClip, type ClosingPrefs, type ClosingTotals, type KhmerClip } from "@/lib/soundbox"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

/** The audio is the page's (only it may use lib/soundbox-audio — golden 6): «played», «locked», «error». */
type Speak = (sequence: (KhmerClip | ClosingClip)[]) => Promise<string>

const storage = () => {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** Today's KHQR sales, counted by the database (exact — the page's list stops at 200). */
async function todayTotals(): Promise<ClosingTotals | null> {
  const { data, error } = (await getSupabaseBrowserClient()?.rpc("soundbox_today_totals")) ?? { data: null, error: null }
  if (error || !data) return null
  const d = data as { khr: number | string; usd: number | string; count: number | string }
  return { khr: Number(d.khr) || 0, usd: Number(d.usd) || 0, count: Number(d.count) || 0 }
}

/**
 * «សង្ខេបលក់ពេលបិទហាង» (founder, 4/11/2026 — lib/soundbox.ts closingDue / closingClipSequence): switched on per phone, a closing
 * time, then once a day «សរុបថ្ងៃនេះ … រៀល និង … ដុល្លារ · ការលក់ … ដង · អរគុណ», the same total on screen. Only while the SoundBox
 * is on; never on Silent / Vibrate (`quiet`); a locked audio is tried again on the next check, within the hour.
 */
export function ClosingSummaryCard({ active, speak, quiet }: { active: boolean; speak: Speak; quiet: () => Promise<boolean> }) {
  const t = useT()
  const [prefs, setPrefs] = useState<ClosingPrefs>(() => (typeof window === "undefined" ? readClosing(null) : readClosing(storage())))
  const [said, setSaid] = useState<ClosingTotals | null>(null)
  const busy = useRef(false)

  const save = (next: ClosingPrefs) => {
    setPrefs(next)
    writeClosing(storage(), next)
  }

  const say = async (): Promise<"played" | "none" | string> => {
    const totals = await todayTotals()
    if (!totals) return "error"
    setSaid(totals)
    const sequence = closingClipSequence(totals)
    return sequence ? speak(sequence) : "none"
  }

  useEffect(() => {
    if (!active || !prefs.on) return
    const check = async () => {
      const now = Date.now()
      if (busy.current || !closingDue(readClosing(storage()), now)) return
      busy.current = true
      try {
        if (await quiet()) return
        const result = await say()
        console.info(`[SoundBox] closing summary: ${result}`)
        // Said, or nothing to say (no sale today): once a day. Locked / error: the next check tries again.
        if (result === "played" || result === "none") save({ ...readClosing(storage()), spoken: new Date(now + 7 * 3_600_000).toISOString().slice(0, 10) })
      } finally {
        busy.current = false
      }
    }
    void check()
    const every = window.setInterval(() => void check(), 30_000)
    return () => window.clearInterval(every)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the check reads the stored prefs each time
  }, [active, prefs.on, prefs.time])

  return (
    <Card className="gap-3 px-4 py-3">
      <div className="flex items-center gap-3">
        <MoonStarIcon className="size-5 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{t("soundbox.closing.title")}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">{t("soundbox.closing.hint", { time: prefs.time })}</p>
        </div>
        <Switch checked={prefs.on} onCheckedChange={(on) => save({ ...prefs, on })} aria-label={t("soundbox.closing.title")} />
      </div>
      {prefs.on && (
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground" htmlFor="closing-time">
            {t("soundbox.closing.at")}
          </label>
          <input
            id="closing-time"
            type="time"
            value={prefs.time}
            onChange={(e) => /^\d{2}:\d{2}$/.test(e.target.value) && save({ ...prefs, time: e.target.value, spoken: null })}
            className="h-11 rounded-md border bg-background px-3 text-sm tabular-nums"
          />
          <Button type="button" size="sm" variant="outline" className="ml-auto h-11" onClick={() => void say()}>
            <PlayIcon />
            {t("soundbox.closing.try")}
          </Button>
        </div>
      )}
      {said && (
        <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-800 tabular-nums dark:text-emerald-200">
          {said.count
            ? t("soundbox.closing.said", {
                amounts: [said.khr > 0 && shownAmount(said.khr, "KHR"), said.usd > 0 && shownAmount(said.usd, "USD")].filter(Boolean).join(" · "),
                count: said.count,
              })
            : t("soundbox.closing.none")}
        </p>
      )}
    </Card>
  )
}
