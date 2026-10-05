"use client"

import { CheckIcon, LanguagesIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
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
 * Language switch. In the app header (`compact`) one tap cycles
 * ខ្មែរ → EN → 中文 → ខ្មែរ (the app's 1-tap standard); the login screen opens a
 * menu with the full names. The choice is saved on this device at once.
 */
export function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const hydrated = useHydrated()
  const { locale, setLocale } = useLocaleStore()
  const active = hydrated ? locale : "km"
  const current = LANGUAGE_NAMES[active]

  if (compact) {
    const next = LOCALES[(LOCALES.indexOf(active) + 1) % LOCALES.length]
    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-9 min-w-11 px-2.5 text-sm font-semibold"
        onClick={() => setLocale(next)}
        aria-label={`Language · ភាសា · 语言: ${current.name} → ${LANGUAGE_NAMES[next].name}`}
        title={LANGUAGE_NAMES[next].name}
      >
        <span key={active} className="animate-in fade-in-0 duration-200">
          {HEADER_LABEL[active]}
        </span>
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Language · ភាសា · 语言">
          <LanguagesIcon />
          {current.name}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {(Object.keys(LANGUAGE_NAMES) as Locale[]).map((code) => (
          <DropdownMenuItem key={code} onSelect={() => setLocale(code)}>
            <span aria-hidden>{LANGUAGE_NAMES[code].flag}</span>
            <span className="flex-1">{LANGUAGE_NAMES[code].name}</span>
            {code === locale && <CheckIcon className="text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
