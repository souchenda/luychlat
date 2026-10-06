"use client"

import { ChevronRightIcon, MoonIcon } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"

import { khmerDigits } from "@/lib/dates"
import { todayDate } from "@/lib/debts"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { khmerLunarDate, nextHolyDay } from "@/lib/khmer-lunar"
import { useLocaleStore } from "@/stores/locale-store"

/**
 * Home header, right: today's lunar day and the next holy day / festival as a
 * small gold pill — "១០រោច · ភ្ជុំបិណ្ឌ (៥ថ្ងៃ) ›" — that opens the full card on /bills.
 */
export function LunarPill() {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const [today, setToday] = useState<string | null>(null)
  useEffect(() => setToday(todayDate()), [])
  if (!today) return <span className="h-7 w-28" aria-hidden />

  const l = khmerLunarDate(today)
  const next = nextHolyDay(today)
  const phase = locale === "km" ? (l.phase === "kert" ? "កើត" : "រោច") : locale === "zh" ? (l.phase === "kert" ? "上弦" : "下弦") : l.phase === "kert" ? "waxing" : "waning"
  const day = locale === "km" ? `${l.day}${phase}` : locale === "zh" ? `${phase}${l.day}` : `${l.day} ${phase}`
  const what = next ? (next.festival ? t(`holyDay.festival.${next.festival}` as MessageKey) : t("holyDay.pill")) : null
  const when = next ? (next.daysAway === 0 ? t("holyDay.pillToday") : t("holyDay.pillDays", { n: next.daysAway })) : null
  const text = [day, what && `${what} (${when})`].filter(Boolean).join(" · ")

  return (
    <Link
      href="/bills"
      aria-label={t("home.openHolyDays")}
      className="group inline-flex max-w-[58%] shrink-0 items-center gap-1.5 rounded-full border border-amber-200/80 bg-amber-50 py-1 pr-1.5 pl-2 text-xs font-medium text-amber-900 shadow-xs transition-all hover:bg-amber-100 active:scale-[0.97] dark:border-amber-900/60 dark:bg-amber-500/10 dark:text-amber-200"
    >
      <MoonIcon className="size-3.5 shrink-0 fill-amber-300 text-amber-500" aria-hidden />
      <span className="truncate">{locale === "km" ? khmerDigits(text) : text}</span>
      <ChevronRightIcon className="size-3.5 shrink-0 opacity-60 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  )
}
