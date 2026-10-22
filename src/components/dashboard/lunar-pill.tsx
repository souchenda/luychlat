"use client"

import { ChevronRightIcon, LandmarkIcon, MoonIcon } from "lucide-react"
import Link from "next/link"
import { useEffect, useState, type ComponentType, type SVGProps } from "react"

import { CULTURAL_ICON } from "@/components/culture/cultural-look"
import { nationalPillText, upcomingNationalDays } from "@/lib/calendar/cambodia-holidays"
import { CHINESE_KEYS, culturalDayOn, daysUntil, upcomingCulturalDays, type CulturalKey } from "@/lib/cultural-calendar"
import { todayDate } from "@/lib/debts"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { khmerLunarDate, nextHolyDay } from "@/lib/khmer-lunar"
import { nearestEvents, nextTurn, PILL_ROTATE_MS, type PillEvent } from "@/lib/pill-events"
import { cn } from "@/lib/utils"
import { useLocaleStore } from "@/stores/locale-store"

/** ភទ្របទ in khmerLunarDate's month index (មិគសិរ = 0). */
const PHOTROBOT = 9
/** On the day, these show a wish in the pill ("ចូលឆ្នាំចិន (ហេង ហេង)") instead of the plain name. */
const PILL_WISH = new Set<CulturalKey>(["chinese_new_year", "dongzhi"])
/** A festival / offering day this close takes the pill over from the holy-day countdown. */
const SOON_DAYS = 3

const AMBER = "border-amber-200/80 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-500/10 dark:text-amber-200"
const RED = "border-red-200/80 bg-red-50 text-red-800 hover:bg-red-100 dark:border-red-900/60 dark:bg-red-500/10 dark:text-red-200"

type Item = PillEvent & { key: CulturalKey | null }

/**
 * Home header, right: a small gold pill that opens the calendar switch (or the full card on /bills).
 * Kan Ben / Pchum Ben first ("បិណ្ឌ ១០ · ភ្ជុំបិណ្ឌ (៥ថ្ងៃ)", "ថ្ងៃភ្ជុំបិណ្ឌ (សីលធំ)"); otherwise the events on the NEAREST
 * date (lib/pill-events.ts — Task #455): a national or royal day («ស្អែកនេះ ៖ ទិវាសន្តិភាពទីក្រុងប៉ារីស (23 តុលា)»), a
 * Khmer-Chinese offering day today or within 3 days, the lunar day and the next Sil / festival day. Two or more on that
 * date take turns every 4 seconds with a soft fade (founder, 22/10/2026 — Task #456), each with its own icon; the pill
 * keeps the width of the longest (all are laid in one cell — no jump in the header) and pauses while held, hovered or
 * focused. Chinese days are red and gold.
 */
export function LunarPill({ onOpen }: { onOpen?: () => void } = {}) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const [today, setToday] = useState<string | null>(null)
  const [turn, setTurn] = useState(0)
  const [held, setHeld] = useState(false)
  useEffect(() => setToday(todayDate()), [])
  const items = today ? pillItems(today, locale, t) : []
  const count = items.length
  useEffect(() => {
    if (count < 2 || held) return
    const id = window.setInterval(() => setTurn((i) => nextTurn(i, count)), PILL_ROTATE_MS)
    return () => window.clearInterval(id)
  }, [count, held])
  if (!today || !count) return <span className="h-7 w-28" aria-hidden />

  const active = items[turn % count]
  const tone = (it: Item) => (it.key !== null && CHINESE_KEYS.has(it.key) ? "red" : "amber")
  const iconOf = (it: Item): ComponentType<SVGProps<SVGSVGElement>> => (it.kind === "national" ? LandmarkIcon : it.key ? CULTURAL_ICON[it.key] : MoonIcon)
  const hold = (on: boolean) => () => setHeld(on)

  const className = `group inline-flex max-w-full items-center gap-1.5 rounded-full border py-1 pr-1.5 pl-2 text-xs font-medium shadow-xs transition-all active:scale-[0.97] ${tone(active) === "red" ? RED : AMBER}`
  const inner = (
    <>
      {/* Every event in one grid cell: the pill is as wide as the longest and never jumps; the one on turn is shown. */}
      <span className="grid min-w-0" aria-live={count > 1 ? "polite" : undefined}>
        {items.map((it, k) => {
          const Icon = iconOf(it)
          const on = k === turn % count
          return (
            <span
              key={it.id}
              aria-hidden={!on}
              className={cn("col-start-1 row-start-1 flex min-w-0 items-center gap-1.5 transition-opacity duration-500 motion-reduce:transition-none", on ? "opacity-100" : "opacity-0")}
            >
              <Icon className={`size-3.5 shrink-0 ${tone(it) === "red" ? "text-red-600 dark:text-red-300" : it.key || it.kind === "national" ? "text-amber-600" : "fill-amber-300 text-amber-500"}`} aria-hidden />
              <span className="truncate">{it.text}</span>
            </span>
          )
        })}
      </span>
      <ChevronRightIcon className="size-3.5 shrink-0 opacity-60 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </>
  )
  const pause = { onMouseEnter: hold(true), onMouseLeave: hold(false), onTouchStart: hold(true), onTouchEnd: hold(false), onTouchCancel: hold(false), onFocus: hold(true), onBlur: hold(false) }
  // On Home: a tap opens the calendar switch (Khmer lunar ↔ Hijri) — founder, 18/10/2026.
  if (onOpen)
    return (
      <button type="button" onClick={onOpen} aria-label={t("calendar.title")} className={className} {...pause}>
        {inner}
      </button>
    )
  return (
    <Link href="/bills" aria-label={t("home.openHolyDays")} className={className} {...pause}>
      {inner}
    </Link>
  )
}

/** The pill's events for `today` (Kan Ben alone; else every event on the nearest date). */
function pillItems(today: string, locale: string, t: ReturnType<typeof useT>): Item[] {
  const l = khmerLunarDate(today)
  // Kan Ben: the 14/15 days of waning ភទ្របទ up to Pchum Ben, its last day.
  const ben = l.month === PHOTROBOT && l.phase === "roch" ? l.monthLength - 15 - l.day : null
  if (ben === 0) return [{ id: "ben", daysAway: 0, kind: "holy", key: null, text: t("holyDay.pchumBenToday") }]
  if (ben !== null) return [{ id: "ben", daysAway: ben, kind: "holy", key: null, text: `${t("holyDay.benDay", { n: l.day })} · ${t("holyDay.festival.pchumBen")} (${t("holyDay.pillDays", { n: ben })})` }]

  const name = (key: CulturalKey) => t(`cultural.${key}.name` as MessageKey)
  const events: Item[] = []
  // National and royal days (Khmer only — their names are Khmer): every one on the nearest date.
  if (locale === "km") for (const n of upcomingNationalDays(today)) events.push({ id: `national:${n.day.key}`, daysAway: n.daysAway, kind: "national", key: null, text: nationalPillText(n) })
  const on = culturalDayOn(today)
  const soon = on ? null : upcomingCulturalDays(today, SOON_DAYS)[0]
  if (on) events.push({ id: `cultural:${on.key}`, daysAway: 0, kind: "cultural", key: on.key, text: PILL_WISH.has(on.key) ? t(`cultural.${on.key}.pill` as MessageKey) : name(on.key) })
  else if (soon) events.push({ id: `cultural:${soon.key}`, daysAway: daysUntil(today, soon.start), kind: "cultural", key: soon.key, text: `${name(soon.key)} (${t("holyDay.pillDays", { n: daysUntil(today, soon.start) })})` })
  // The lunar day and the next Sil / festival day.
  const next = nextHolyDay(today)
  const phase = locale === "km" ? (l.phase === "kert" ? "កើត" : "រោច") : locale === "zh" ? (l.phase === "kert" ? "上弦" : "下弦") : l.phase === "kert" ? "waxing" : "waning"
  const day = locale === "km" ? `${l.day} ${phase}` : locale === "zh" ? `${phase}${l.day}` : `${l.day} ${phase}`
  const what = next ? (next.festival ? t(`holyDay.festival.${next.festival}` as MessageKey) : t("holyDay.pill")) : null
  const when = next ? (next.daysAway === 0 ? t("holyDay.pillToday") : t("holyDay.pillDays", { n: next.daysAway })) : null
  events.push({ id: "holy", daysAway: next?.daysAway ?? Number.POSITIVE_INFINITY, kind: "holy", key: null, text: [day, what && `${what} (${when})`].filter(Boolean).join(" · ") })
  return nearestEvents(events) as Item[]
}
