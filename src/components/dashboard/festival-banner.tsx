"use client"

import { XIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { CULTURAL_ICON, CULTURAL_LOOK } from "@/components/culture/cultural-look"
import { culturalDayOn, type CulturalDay } from "@/lib/cultural-calendar"
import { todayDate } from "@/lib/debts"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"

const DISMISS_PREFIX = "luychlat:festival-dismissed:"

/**
 * Home, on a festival or Khmer-Chinese offering day (New Year, Little New Year,
 * Chinese New Year's eve and New Year, Khmer New Year, Hungry Ghost,
 * Mid-Autumn, Pchum Ben, Water Festival, Dongzhi): a warm wish. Closing it
 * hides it for the rest of that festival on this device.
 */
export function FestivalBanner() {
  const t = useT()
  const [day, setDay] = useState<CulturalDay | null>(null)

  // Client-only: the date and the "closed" note come from this device.
  useEffect(() => {
    const d = culturalDayOn(todayDate())
    if (!d) return
    try {
      if (localStorage.getItem(DISMISS_PREFIX + d.key) === d.start) return
    } catch {}
    setDay(d)
  }, [])

  if (!day) return null
  const look = CULTURAL_LOOK[day.key]
  const Icon = CULTURAL_ICON[day.key]

  return (
    <section className={`relative overflow-hidden rounded-2xl border bg-linear-to-br p-4 shadow-sm animate-in fade-in-0 slide-in-from-bottom-2 duration-500 ${look.card}`}>
      <Icon aria-hidden className={`pointer-events-none absolute -right-3 -bottom-3 size-24 rotate-12 ${look.mark}`} />
      <div className="flex items-start gap-3">
        <span className={`flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm dark:bg-neutral-900 ${look.disc}`}>
          <Icon className="size-6" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{t(`festival.${day.key}.title` as MessageKey, { year: day.start.slice(0, 4) })}</p>
          <p className="mt-1 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">{t(`festival.${day.key}.body` as MessageKey)}</p>
        </div>
        <button
          type="button"
          className="-m-1 rounded-full p-2 text-muted-foreground hover:bg-white/60 dark:hover:bg-white/10"
          aria-label={t("common.close")}
          onClick={() => {
            setDay(null)
            try {
              localStorage.setItem(DISMISS_PREFIX + day.key, day.start)
            } catch {}
          }}
        >
          <XIcon className="size-4" />
        </button>
      </div>
    </section>
  )
}
