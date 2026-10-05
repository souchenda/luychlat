"use client"

import { Segmented } from "@/components/common/segmented"
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
 * Language switch, never a menu. In the app header (`compact`) one tap cycles
 * ខ្មែរ → EN → 中文 → ខ្មែរ; the login screen shows all three inline
 * [ ខ្មែរ | EN | 中文 ] so a first-time visitor sees their language at once.
 * The choice is saved on this device and applies instantly.
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
    <Segmented
      aria-label="Language · ភាសា · 语言"
      value={active}
      onChange={setLocale}
      className="rounded-full bg-muted/70 p-0.5 backdrop-blur dark:bg-neutral-800/70 [&>button]:rounded-full [&>button]:px-3 [&>button]:py-1 [&>button]:text-xs [&>button[aria-checked=true]]:font-semibold [&>button[aria-checked=true]]:text-emerald-700 dark:[&>button[aria-checked=true]]:text-emerald-400"
      options={LOCALES.map((code) => ({ value: code, label: <span lang={code}>{LANGUAGE_NAMES[code].short}</span> }))}
    />
  )
}
