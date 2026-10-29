"use client"

import { ChevronRightIcon, MoonStarIcon } from "lucide-react"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

import { useIslamicLocation, usePrayerProvinceSync } from "@/components/islamic/location-picker"
import { PRAYER_NAMES } from "@/lib/islamic/glossary"
import { useIslamicEnabled } from "@/lib/islamic-settings"
import { formatMinutes, nextPrayer, placeNow, prayerTimes } from "@/lib/prayer"

/** «2:05» hours:minutes left (or «45 នាទី») — international digits (founder, 21/10/2026). */
const left = (seconds: number) => {
  const m = Math.max(1, Math.ceil(seconds / 60))
  return m < 60 ? `${m} នាទី` : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`
}

/**
 * Islamic Mode, on Home below the balance card (founder, 19/10/2026): one line — the next prayer, its time and how
 * long until it — one tap to /islamic. A sibling of the hero card, never inside it (tests/golden/layout-guards).
 */
export function NextPrayerChip() {
  const islamic = useIslamicEnabled()
  const location = useIslamicLocation()
  // Home keeps the server's prayer push on this phone's province too (founder, 21/10/2026).
  usePrayerProvinceSync()
  const offset = location.utcOffset
  const [now, setNow] = useState(() => placeNow(offset))
  useEffect(() => {
    setNow(placeNow(offset))
    const id = window.setInterval(() => setNow(placeNow(offset)), 30_000)
    return () => window.clearInterval(id)
  }, [offset])
  const { year, month, day } = now.date
  const next = useMemo(() => {
    const today = prayerTimes({ year, month, day }, location.lat, location.lng, offset)
    const d = new Date(Date.UTC(year, month - 1, day + 1))
    const tomorrow = prayerTimes({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }, location.lat, location.lng, offset)
    const n = nextPrayer(today, tomorrow, now.minutes, now.seconds)
    return { ...n, at: n.key === "fajr" && n.inSeconds > (24 * 60 - now.minutes) * 60 ? tomorrow.fajr : today[n.key] }
  }, [year, month, day, now.minutes, now.seconds, location.lat, location.lng, offset])
  if (!islamic) return null
  return (
    <Link
      href="/islamic"
      className="flex min-h-11 items-center gap-2 rounded-2xl border border-emerald-200/80 bg-emerald-50 px-3.5 py-2 text-sm text-emerald-900 transition-transform active:scale-[0.98] dark:border-emerald-900/60 dark:bg-emerald-500/10 dark:text-emerald-100"
    >
      <MoonStarIcon className="size-4 shrink-0 text-amber-500" aria-hidden />
      <span className="min-w-0 flex-1 truncate">
        សឡាតបន្ទាប់ <b className="font-semibold">{PRAYER_NAMES[next.key as keyof typeof PRAYER_NAMES]}</b> {formatMinutes(next.at)}
        <span className="text-emerald-700/80 dark:text-emerald-300/80"> · នៅសល់ {left(next.inSeconds)}</span>
      </span>
      <ChevronRightIcon className="size-4 shrink-0 opacity-60" aria-hidden />
    </Link>
  )
}
