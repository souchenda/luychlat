"use client"

import { GlobeIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useHydrated } from "@/hooks/use-hydrated"
import { LOCALES, type Locale } from "@/lib/i18n/dictionaries"
import { useLocaleStore } from "@/stores/locale-store"

/** Each language named in itself, as the switchers show it. */
export const LANGUAGE_NAMES: Record<Locale, { flag: string; name: string; short: string }> = {
  km: { flag: "🇰🇭", name: "ភាសាខ្មែរ", short: "ខ្មែរ" },
  en: { flag: "🇬🇧", name: "English", short: "EN" },
  zh: { flag: "🇨🇳", name: "中文（简体）", short: "中文" },
}

/** The header button: one short label, nothing else (flag emoji show as "KH" letters on Windows). */
const HEADER_LABEL: Record<Locale, string> = { km: "ខ្មែរ", en: "EN", zh: "CN" }

/**
 * Language switch, never a menu: one tap cycles ខ្មែរ → EN → 中文 → ខ្មែរ and
 * the page changes at once (saved on this device). `compact` is the app
 * header's plain label; the login page shows a pill with a globe.
 */
export function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const hydrated = useHydrated()
  const { locale, setLocale } = useLocaleStore()
  const active = hydrated ? locale : "km"
  const current = LANGUAGE_NAMES[active]
  const next = LOCALES[(LOCALES.indexOf(active) + 1) % LOCALES.length]
  const label = `Language · ភាសា · 语言: ${current.name} → ${LANGUAGE_NAMES[next].name}`

  if (compact) {
    return (
      <Button variant="ghost" size="sm" className="h-9 min-w-11 px-2.5 text-sm font-semibold" onClick={() => setLocale(next)} aria-label={label} title={LANGUAGE_NAMES[next].name}>
        <span key={active} className="animate-in fade-in-0 duration-200">
          {HEADER_LABEL[active]}
        </span>
      </Button>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setLocale(next)}
      aria-label={label}
      title={LANGUAGE_NAMES[next].name}
      className="group inline-flex h-9 items-center gap-1.5 rounded-full border border-neutral-200/80 bg-white/80 pr-3.5 pl-2.5 text-sm font-medium text-neutral-700 shadow-sm backdrop-blur transition-all hover:border-emerald-300 hover:text-emerald-700 active:scale-95 dark:border-neutral-800 dark:bg-neutral-900/80 dark:text-neutral-200 dark:hover:border-emerald-700 dark:hover:text-emerald-400"
    >
      {/* Re-keyed on each change: the globe turns and the label pops in. */}
      <GlobeIcon key={`globe-${active}`} className="size-4 text-emerald-600 animate-in spin-in-90 duration-500 motion-reduce:animate-none dark:text-emerald-400" aria-hidden />
      <span key={`label-${active}`} lang={active} className="min-w-[2.25rem] text-center animate-in fade-in-0 zoom-in-75 duration-200 ease-out">
        {current.short}
      </span>
    </button>
  )
}
