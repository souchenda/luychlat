"use client"

import { CheckIcon, LanguagesIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useHydrated } from "@/hooks/use-hydrated"
import type { Locale } from "@/lib/i18n/dictionaries"
import { useLocaleStore } from "@/stores/locale-store"

/** Each language named in itself, as the switchers show it. */
export const LANGUAGE_NAMES: Record<Locale, { flag: string; name: string; short: string }> = {
  km: { flag: "🇰🇭", name: "ភាសាខ្មែរ", short: "ខ្មែរ" },
  en: { flag: "🇬🇧", name: "English", short: "EN" },
  zh: { flag: "🇨🇳", name: "中文（简体）", short: "中文" },
}

/**
 * 文A language menu: Khmer, English or Simplified Chinese. `compact` (app
 * header) shows the short name; the login screen shows the full name. The
 * choice is saved on this device at once (locale store).
 */
export function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const hydrated = useHydrated()
  const { locale, setLocale } = useLocaleStore()
  const current = LANGUAGE_NAMES[hydrated ? locale : "km"]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className={compact ? "h-9 gap-1 px-2 text-xs" : undefined} aria-label="Language · ភាសា · 语言">
          <LanguagesIcon />
          {compact ? current.short : current.name}
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
