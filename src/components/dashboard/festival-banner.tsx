"use client"

import { XIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { CULTURAL_ICON, CULTURAL_LOOK } from "@/components/culture/cultural-look"
import { festivalBannerDay } from "@/lib/cultural-calendar"
import type { CulturalDay } from "@/lib/cultural-calendar"
import { todayDate } from "@/lib/debts"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"

const DISMISS_PREFIX = "luychlat:festival-dismissed:"
/** «pchum_ben_card_shown_date»: the day the card was shown (the splash keeps its own «…_greeting_shown_date»). */
const shownKey = (key: string) => `${key}_card_shown_date`

// Decided once per app open (this page load): shown the first time Home opens that day; a refresh
// or coming back to Home later doesn't bring it back. A remount right after the first (data
// arriving re-renders Home) keeps it, so it never flashes away.
let opened: { day: CulturalDay; left: number | null } | null | undefined

function decide(today: string): CulturalDay | null {
  if (opened !== undefined) {
    if (!opened) return null
    // Back within a moment = the same view remounting; later = navigated away and back.
    if (opened.left !== null && Date.now() - opened.left > 1500) opened = null
    return opened?.day ?? null
  }
  const read = (k: string) => {
    try {
      return localStorage.getItem(k)
    } catch {
      return null
    }
  }
  const day = festivalBannerDay(today, (key) => read(DISMISS_PREFIX + key))
  if (!day || read(shownKey(day.key)) === today) {
    opened = null
    return null
  }
  try {
    localStorage.setItem(shownKey(day.key), today)
  } catch {}
  opened = { day, left: null }
  return day
}

/**
 * Home, on a festival or Khmer-Chinese offering day (New Year, Little New Year,
 * Chinese New Year's eve and New Year, Khmer New Year, Hungry Ghost,
 * Mid-Autumn, Pchum Ben, Water Festival, Dongzhi): a warm wish — once a day, when the app is
 * opened (not on a refresh or on coming back to Home). Closing it hides it for the rest of that
 * festival on this device.
 */
export function FestivalBanner() {
  const t = useT()
  // Decided on the first render — the app renders on the device only (the layout waits for
  // hydration) — so the banner never mounts empty and pops in, nor flashes when <main> re-keys.
  const [day, setDay] = useState<CulturalDay | null>(() => decide(todayDate()))
  useEffect(() => {
    if (opened) opened.left = null
    return () => {
      if (opened) opened.left = Date.now()
    }
  }, [])

  if (!day) return null
  const look = CULTURAL_LOOK[day.key]
  const Icon = CULTURAL_ICON[day.key]

  // Compact (founder, 11/10/2026): ✕ in the corner beside the title only, so the blessing gets the
  // full width — two lines on a 360–390 px phone (Khmer), the net worth card stays near the top.
  return (
    <section className={`relative overflow-hidden rounded-2xl border bg-linear-to-br px-2.5 py-2 shadow-sm animate-in fade-in-0 slide-in-from-bottom-2 duration-500 ${look.card}`}>
      {/* A watermark only where the festival's look has one (none for Pchum Ben: a clean warm gradient). */}
      {look.mark && <Icon aria-hidden className={`pointer-events-none absolute -right-3 -bottom-3 size-20 rotate-12 ${look.mark}`} />}
      <button
        type="button"
        className="absolute top-1 right-1 rounded-full p-1.5 text-muted-foreground hover:bg-white/60 dark:hover:bg-white/10"
        aria-label={t("common.close")}
        onClick={() => {
          setDay(null)
          opened = null
          try {
            localStorage.setItem(DISMISS_PREFIX + day.key, day.start)
          } catch {}
        }}
      >
        <XIcon className="size-4" />
      </button>
      <div className="flex items-center gap-2">
        <span className={`flex size-8 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm dark:bg-neutral-900 ${look.disc}`}>
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="pr-7 text-sm leading-snug font-semibold">{t(`festival.${day.key}.title` as MessageKey, { year: day.start.slice(0, 4) })}</p>
          <p className="mt-0.5 text-xs leading-snug text-neutral-600 dark:text-neutral-300">{t(`festival.${day.key}.body` as MessageKey)}</p>
        </div>
      </div>
    </section>
  )
}
