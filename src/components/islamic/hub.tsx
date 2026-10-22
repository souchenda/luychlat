"use client"

import { BellRingIcon, CheckIcon, ChevronRightIcon, CoinsIcon, CompassIcon, CopyIcon, HeadphonesIcon, MapPinIcon, MoonIcon, UtensilsIcon, type LucideIcon } from "lucide-react"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

import { DuaAudioButton } from "@/components/islamic/dua-audio-button"
import { useIslamicLocation } from "@/components/islamic/location-picker"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { duaAudioSrc, DUA_RECORDINGS } from "@/lib/dua-audio"
import { useDuaRecordings } from "@/lib/dua-audio-data"
import { DUAS } from "@/lib/duas"
import { pick, type MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { toHijri } from "@/lib/islamic"
import { contextualDua, countdown, hubHero } from "@/lib/islamic-hub"
import { useIslamicDefaults } from "@/lib/islamic-settings"
import { formatMinutes, placeNow, prayerTimes } from "@/lib/prayer"
import { useLocaleStore } from "@/stores/locale-store"

/** Today's and tomorrow's prayer times for the chosen place, and the Cambodian clock — ticking every second. */
function useHubClock() {
  const location = useIslamicLocation()
  const hijriOffset = Number(useIslamicDefaults().hijri_offset ?? 0) || 0
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])
  const clock = placeNow(location.utcOffset, now)
  const { year, month, day } = clock.date
  const today = useMemo(() => prayerTimes({ year, month, day }, location.lat, location.lng, location.utcOffset), [year, month, day, location.lat, location.lng, location.utcOffset])
  const tomorrow = useMemo(() => {
    const d = new Date(Date.UTC(year, month - 1, day + 1))
    return prayerTimes({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }, location.lat, location.lng, location.utcOffset)
  }, [year, month, day, location.lat, location.lng, location.utcOffset])
  const dayKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  const hijri = useMemo(() => toHijri(new Date(year, month - 1, day, 12), hijriOffset), [year, month, day, hijriOffset])
  return { clock, today, tomorrow, dayKey, hijri, location }
}

/**
 * The hero (founder, 19/10/2026): «អាស័រ · 15:08 · 00:58:45», and on a fast day Imsak and the Iftar countdown.
 * One tap to the full prayer table.
 */
export function IslamicHubHero() {
  const t = useT()
  const { clock, today, tomorrow, dayKey, hijri, location } = useHubClock()
  const hero = hubHero({ day: dayKey, hijri, today, tomorrow, minutes: clock.minutes, seconds: clock.seconds })
  return (
    <Link href="/islamic/prayer" aria-label={t("islamicHub.openPrayer")} className="block rounded-2xl transition-transform active:scale-[0.98]">
      <Card className="gap-1 border-emerald-500/30 bg-linear-to-br from-emerald-600 to-teal-700 px-4 py-4 text-white shadow-[0_8px_28px_-12px_rgba(16,185,129,0.6)]">
        <p className="flex items-center gap-1.5 text-xs text-white/85">
          <BellRingIcon className="size-3.5" aria-hidden />
          <span className="min-w-0 flex-1 truncate">
            {t("prayer.next")} · {location.label}
          </span>
          <ChevronRightIcon className="size-4 opacity-70" aria-hidden />
        </p>
        <p className="flex flex-wrap items-baseline gap-x-2 text-xl font-bold" suppressHydrationWarning>
          <span>{t(`prayer.${hero.next.key}` as MessageKey)}</span>
          <span className="font-mono tabular-nums">{formatMinutes(hero.next.at)}</span>
        </p>
        <p className="font-mono text-3xl font-semibold tracking-wider tabular-nums" suppressHydrationWarning>
          {countdown(hero.next.inSeconds)}
        </p>
        {hero.fast && (
          <div className="mt-2 grid grid-cols-2 gap-2 border-t border-white/20 pt-2.5 text-xs">
            <span className="flex items-center gap-1.5">
              <MoonIcon className="size-3.5 text-white/80" aria-hidden />
              {t("fasting.imsak")} <b className="font-mono tabular-nums">{formatMinutes(hero.fast.imsak)}</b>
            </span>
            <span className="flex items-center justify-end gap-1.5" suppressHydrationWarning>
              <UtensilsIcon className="size-3.5 text-amber-200" aria-hidden />
              {hero.fast.iftarInSeconds !== null ? (
                <>
                  {t("fasting.iftar")} <b className="font-mono tabular-nums">{countdown(hero.fast.iftarInSeconds)}</b>
                </>
              ) : (
                <>
                  {t("fasting.iftar")} <b className="font-mono tabular-nums">{formatMinutes(hero.fast.iftar)}</b>
                </>
              )}
            </span>
          </div>
        )}
      </Card>
    </Link>
  )
}

const ACTIONS: { href: string; label: MessageKey; icon: LucideIcon }[] = [
  { href: "/islamic/qibla", label: "islamicHub.qibla", icon: CompassIcon },
  { href: "/islamic/quran", label: "islamicHub.quran", icon: HeadphonesIcon },
  { href: "/islamic/places", label: "islamicHub.places", icon: MapPinIcon },
  { href: "#zakat", label: "islamicHub.zakat", icon: CoinsIcon },
]

/** Four quick actions: Qibla, the Quran reciters, mosques nearby, the Zakat calculator (below on this page). */
export function IslamicQuickActions() {
  const t = useT()
  return (
    <nav aria-label={t("islamicHub.quickActions")} className="grid grid-cols-4 gap-2">
      {ACTIONS.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          onClick={(e) => {
            if (href !== "#zakat") return
            e.preventDefault()
            document.getElementById("zakat")?.scrollIntoView({ behavior: "smooth", block: "start" })
          }}
          className="flex min-h-[84px] flex-col items-center justify-center gap-1.5 rounded-2xl border bg-card px-1 py-2.5 text-center text-[11px] leading-tight font-medium shadow-xs transition-transform active:scale-[0.96]"
        >
          <span className="flex size-9 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
            <Icon className="size-[18px]" aria-hidden />
          </span>
          {t(label)}
        </Link>
      ))}
    </nav>
  )
}

/** The du'a that fits the hour — waking, breaking the fast (Mon / Thu, Ramadan), bedtime — with 🔊 when recorded. */
export function ContextualDuaCard() {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const { clock, today, dayKey, hijri } = useHubClock()
  const fastDay = hubHero({ day: dayKey, hijri, today, tomorrow: today, minutes: clock.minutes, seconds: clock.seconds }).fast !== null
  const dua = DUAS.find((d) => d.id === contextualDua({ minutes: clock.minutes, times: today, fastDay }))
  const uploaded = useDuaRecordings().data ?? {}
  const [copied, setCopied] = useState(false)
  if (!dua) return null
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(dua.arabic)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard can be blocked; nothing to do.
    }
  }
  const urls = Object.fromEntries(Object.entries(uploaded).map(([id, r]) => [id, r.url]))
  return (
    <Card className="gap-2 px-4 py-3">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1">
          <span className="block text-[11px] text-muted-foreground">{t("islamicHub.duaNow")}</span>
          <span className="block truncate text-sm font-semibold" suppressHydrationWarning>
            {pick(dua.title, locale)}
          </span>
        </p>
        <DuaAudioButton id={dua.id} src={duaAudioSrc(dua.id, DUA_RECORDINGS, urls)} />
        <Button size="icon" variant="ghost" className="size-8 text-muted-foreground" onClick={() => void copy()} aria-label={t("duas.copy")}>
          {copied ? <CheckIcon className="text-emerald-600" /> : <CopyIcon />}
        </Button>
      </div>
      <p dir="rtl" lang="ar" className="font-arabic text-2xl leading-[2.1]" suppressHydrationWarning>
        {dua.arabic}
      </p>
      <p className="text-sm leading-relaxed" suppressHydrationWarning>
        {pick(dua, locale)}
      </p>
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>📖 {dua.source}</span>
        <Link href="/islamic/duas" className="flex min-h-9 items-center gap-0.5 font-medium text-primary">
          {t("islamicHub.allDuas")}
          <ChevronRightIcon className="size-3.5" aria-hidden />
        </Link>
      </div>
    </Card>
  )
}
