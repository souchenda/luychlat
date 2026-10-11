/**
 * The festive greeting (splash once a day + a header badge) on the national festivals — Khmer New
 * Year, Pchum Ben and the Water Festival — on the days the cultural calendar computes
 * (lib/cultural-calendar.ts: Pchum Ben 2026 = 10–12 Oct, Khmer New Year = 14–16 Apr). Pchum Ben
 * is a Buddhist merit festival: not shown to Islamic Mode users (as its Telegram wish). Pure
 * (festive-greeting.test.ts).
 */
import { culturalDayOn, type CulturalDay, type CulturalKey } from "@/lib/cultural-calendar"

export const GREETING_KEYS = ["khmer_new_year", "pchum_ben", "water_festival"] as const satisfies readonly CulturalKey[]
export type GreetingKey = (typeof GREETING_KEYS)[number]

const isGreeting = (key: CulturalKey): key is GreetingKey => (GREETING_KEYS as readonly string[]).includes(key)

/** Today's festival to greet, or null. `preview` (?festive=pchum_ben) shows one on any day, for checking it. */
export function activeGreeting(today: string, o: { islamic: boolean; preview?: string | null }): { key: GreetingKey; day: CulturalDay | null } | null {
  if (o.preview && isGreeting(o.preview as CulturalKey)) return { key: o.preview as GreetingKey, day: null }
  const day = culturalDayOn(today)
  if (!day || !isGreeting(day.key)) return null
  if (day.key === "pchum_ben" && o.islamic) return null
  return { key: day.key, day }
}

/** The splash once a day per festival: the stored value is «<key>:<day>» of the last showing. */
export const splashMark = (key: GreetingKey, today: string) => `${key}:${today}`
export const shouldShowSplash = (stored: string | null, key: GreetingKey, today: string) => stored !== splashMark(key, today)
