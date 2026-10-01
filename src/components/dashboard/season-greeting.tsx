"use client"

import { ChevronRightIcon, Flower2Icon, LampIcon, SailboatIcon, SunIcon, TreePineIcon, XIcon, type LucideIcon } from "lucide-react"
import Link from "next/link"

import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { seasonOn, type SeasonKey } from "@/lib/theme/seasons"
import { usePrefsStore } from "@/stores/prefs-store"

const GREETINGS: Record<Exclude<SeasonKey, "default">, { icon: LucideIcon; href: string }> = {
  khmer_new_year: { icon: SunIcon, href: "/budgets" },
  pchum_ben: { icon: Flower2Icon, href: "/budgets" },
  water_festival: { icon: SailboatIcon, href: "/budgets" },
  christmas: { icon: TreePineIcon, href: "/reports" },
  chinese_new_year: { icon: LampIcon, href: "/budgets" },
}

/**
 * Home: a festive greeting with a money tip during a holiday period (by the
 * calendar, whatever theme is picked). Closing it hides it until next year.
 */
export function SeasonGreeting() {
  const t = useT()
  const dismissed = usePrefsStore((s) => s.dismissedGreeting)
  const dismiss = usePrefsStore((s) => s.dismissGreeting)
  const season = seasonOn()
  if (!season || season === "default") return null
  const key = `${season}-${new Date().getFullYear()}`
  if (dismissed === key) return null
  const { icon: Icon, href } = GREETINGS[season]

  return (
    // data-season scopes that festival's colours to this card, whatever theme is picked.
    <section
      data-season={season}
      className="relative isolate overflow-hidden rounded-2xl bg-linear-to-r from-(--brand-from) to-(--brand-to) px-4 py-3 text-white">
      <span aria-hidden className="pointer-events-none absolute -top-8 -right-6 -z-10 size-28 rounded-full bg-(--brand-glow) blur-2xl" />
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20" aria-hidden>
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{t(`greet.${season}.title` as MessageKey)}</p>
          <p className="text-sm text-white/85">{t(`greet.${season}.tip` as MessageKey)}</p>
          <Link href={href} className="mt-1 inline-flex items-center gap-0.5 text-sm font-medium underline-offset-2 hover:underline">
            {t(`greet.${season}.cta` as MessageKey)}
            <ChevronRightIcon className="size-4" aria-hidden />
          </Link>
        </div>
        <button
          type="button"
          onClick={() => dismiss(key)}
          className="-m-1 rounded-full p-1 text-white/80 hover:bg-white/15 hover:text-white"
          aria-label={t("greet.close")}
        >
          <XIcon className="size-4" />
        </button>
      </div>
    </section>
  )
}
