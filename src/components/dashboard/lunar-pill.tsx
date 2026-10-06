"use client"

import { ChevronRightIcon, MoonIcon } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"

import { CULTURAL_ICON } from "@/components/culture/cultural-look"
import { CHINESE_KEYS, culturalDayOn, daysUntil, upcomingCulturalDays, type CulturalKey } from "@/lib/cultural-calendar"
import { khmerDigits } from "@/lib/dates"
import { todayDate } from "@/lib/debts"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { khmerLunarDate, nextHolyDay } from "@/lib/khmer-lunar"
import { useLocaleStore } from "@/stores/locale-store"

/** ភទ្របទ in khmerLunarDate's month index (មិគសិរ = 0). */
const PHOTROBOT = 9
/** On the day, these show a wish in the pill ("ចូលឆ្នាំចិន (ហេង ហេង)") instead of the plain name. */
const PILL_WISH = new Set<CulturalKey>(["chinese_new_year", "dongzhi"])
/** A festival / offering day this close takes the pill over from the holy-day countdown. */
const SOON_DAYS = 3

const AMBER = "border-amber-200/80 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-500/10 dark:text-amber-200"
const RED = "border-red-200/80 bg-red-50 text-red-800 hover:bg-red-100 dark:border-red-900/60 dark:bg-red-500/10 dark:text-red-200"

/**
 * Home header, right: a small gold pill that opens the full card on /bills.
 * In order: Kan Ben / Pchum Ben ("បិណ្ឌ ១០ · ភ្ជុំបិណ្ឌ (៥ថ្ងៃ)", "ថ្ងៃភ្ជុំបិណ្ឌ (សីលធំ)"),
 * a festival or Khmer-Chinese offering day today ("ថ្ងៃសែនដកជើងធូប") or within
 * 3 days ("ថ្ងៃសែននំអ៊ី (២ថ្ងៃ)"), else the lunar day and the next holy day
 * ("១០រោច · ថ្ងៃសីល (៥ថ្ងៃ)"). Chinese days are red and gold.
 */
export function LunarPill() {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const [today, setToday] = useState<string | null>(null)
  useEffect(() => setToday(todayDate()), [])
  if (!today) return <span className="h-7 w-28" aria-hidden />

  const l = khmerLunarDate(today)
  // Kan Ben: the 14/15 days of waning ភទ្របទ up to Pchum Ben, its last day.
  const ben = l.month === PHOTROBOT && l.phase === "roch" ? l.monthLength - 15 - l.day : null
  const name = (key: CulturalKey) => t(`cultural.${key}.name` as MessageKey)

  let text: string
  let key: CulturalKey | null = null
  if (ben === 0) {
    text = t("holyDay.pchumBenToday")
  } else if (ben !== null) {
    text = `${t("holyDay.benDay", { n: l.day })} · ${t("holyDay.festival.pchumBen")} (${t("holyDay.pillDays", { n: ben })})`
  } else {
    const on = culturalDayOn(today)
    const soon = on ? null : upcomingCulturalDays(today, SOON_DAYS)[0]
    if (on) {
      key = on.key
      text = PILL_WISH.has(on.key) ? t(`cultural.${on.key}.pill` as MessageKey) : name(on.key)
    } else if (soon) {
      key = soon.key
      text = `${name(soon.key)} (${t("holyDay.pillDays", { n: daysUntil(today, soon.start) })})`
    } else {
      const next = nextHolyDay(today)
      const phase = locale === "km" ? (l.phase === "kert" ? "កើត" : "រោច") : locale === "zh" ? (l.phase === "kert" ? "上弦" : "下弦") : l.phase === "kert" ? "waxing" : "waning"
      const day = locale === "km" ? `${l.day}${phase}` : locale === "zh" ? `${phase}${l.day}` : `${l.day} ${phase}`
      const what = next ? (next.festival ? t(`holyDay.festival.${next.festival}` as MessageKey) : t("holyDay.pill")) : null
      const when = next ? (next.daysAway === 0 ? t("holyDay.pillToday") : t("holyDay.pillDays", { n: next.daysAway })) : null
      text = [day, what && `${what} (${when})`].filter(Boolean).join(" · ")
    }
  }

  const red = key !== null && CHINESE_KEYS.has(key)
  const Icon = key ? CULTURAL_ICON[key] : MoonIcon

  return (
    <Link
      href="/bills"
      aria-label={t("home.openHolyDays")}
      className={`group inline-flex max-w-[58%] shrink-0 items-center gap-1.5 rounded-full border py-1 pr-1.5 pl-2 text-xs font-medium shadow-xs transition-all active:scale-[0.97] ${red ? RED : AMBER}`}
    >
      <Icon className={`size-3.5 shrink-0 ${red ? "text-red-600 dark:text-red-300" : key ? "text-amber-600" : "fill-amber-300 text-amber-500"}`} aria-hidden />
      <span className="truncate">{locale === "km" ? khmerDigits(text) : text}</span>
      <ChevronRightIcon className="size-3.5 shrink-0 opacity-60 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  )
}
