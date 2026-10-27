// The Hajj honorific (founder, 27/10/2026 — Task #524): a person who has completed the 5th pillar may be greeted
// «ហាជ្ជី ចិន្តា» / «ហាជ្ជះ …» — only in Islamic Mode, only when they said so themselves (islamic_settings
// .has_completed_hajj) and only with the title they chose (hajj_title). The profile has no gender, so the title is
// never inferred: switched on without a choice, the name stays plain (no silent guessing). Pure (hajj-title.test.ts).

import type { Locale } from "@/lib/i18n/dictionaries"

export type HajjTitle = "haji" | "hajjah"
export const HAJJ_TITLES: readonly HajjTitle[] = ["haji", "hajjah"]

/** The founder's spelling (Task #524) — changed only by the founder's decision. */
export const HAJJ_TITLE_TEXT: Record<HajjTitle, { km: string; en: string }> = {
  haji: { km: "ហាជ្ជី", en: "Haji" },
  hajjah: { km: "ហាជ្ជះ", en: "Hajjah" },
}

export const isHajjTitle = (v: unknown): v is HajjTitle => v === "haji" || v === "hajjah"

/** «ហាជ្ជី ចិន្តា» when it applies, else the name as it is (null stays null — the greeting then has no name). */
export function formatHonorificName(o: {
  name: string | null | undefined
  islamic: boolean
  hasCompletedHajj: boolean | null | undefined
  hajjTitle: string | null | undefined
  locale?: Locale
}): string | null {
  const name = o.name?.trim() || null
  if (!name || !o.islamic || !o.hasCompletedHajj || !isHajjTitle(o.hajjTitle)) return name
  const text = HAJJ_TITLE_TEXT[o.hajjTitle]
  const title = o.locale === "en" || o.locale === "zh" ? text.en : text.km
  // Already written into the name in Settings: never «ហាជ្ជី ហាជ្ជី …».
  const lower = name.toLowerCase()
  if ([text.km, text.en.toLowerCase(), "hajji", "haj"].some((t) => lower === t || lower.startsWith(`${t} `))) return name
  return `${title} ${name}`
}
