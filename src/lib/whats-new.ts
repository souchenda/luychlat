// «What's new» (founder, 27/10/2026): every new feature is announced once on each phone — what it is and a «សាកល្បង» to
// try it at once — and the feature itself is ON by default until the person switches it off (a new feature nobody knows
// about helps nobody). Shown on Home after the unlock and the welcome (components/dashboard/whats-new.tsx). Pure.
//
// Adding a feature: add an entry at the TOP — its id never changes (it is what «seen» remembers), its date is the day it
// went live; announcements older than ANNOUNCE_DAYS are not shown (a new user is not walked through the past).

import type { LocalizedText } from "@/lib/i18n/dictionaries"

export type WhatsNewAction = { kind: "greeting" } | { kind: "link"; href: string }

export type WhatsNewEntry = {
  id: string
  /** YYYY-MM-DD, the day it went live (Cambodia). */
  date: string
  icon: string
  title: LocalizedText
  body: LocalizedText
  action: WhatsNewAction
  /** Who it concerns: a Business-only feature is not announced to someone without a Business workspace. */
  scope?: "all" | "business"
}

export const WHATS_NEW: WhatsNewEntry[] = [
  {
    id: "2026-10-27-welcome-voice",
    date: "2026-10-27",
    icon: "🔊",
    title: { km: "សំឡេងស្វាគមន៍ពេលបើកអេប", en: "A spoken welcome when the app opens", zh: "打开应用时的语音问候" },
    body: {
      km: "ពេលបើកអេប នឹងឮ «ជម្រាបសួរ! សូមស្វាគមន៍មកកាន់ អេប លុយឆ្លាត» — ឬ «السلام عليكم» ជាភាសាអារ៉ាប់ ពេលបើក Islamic Mode។ មិនឮពេលទូរស័ព្ទបិទសំឡេង ឬញ័រទេ ហើយអាចបិទបានក្នុង ការកំណត់។",
      en: "When the app opens you hear «ជម្រាបសួរ» — or «السلام عليكم» in Arabic with Islamic Mode on. Never on Silent or Vibrate; switch it off in Settings.",
      zh: "打开应用时会听到问候语（伊斯兰模式下为阿拉伯语 السلام عليكم）。静音或振动时不会播放，可在设置中关闭。",
    },
    action: { kind: "greeting" },
  },
]

/** Announced for this many days after going live. */
export const ANNOUNCE_DAYS = 30

const DAY_MS = 86_400_000
/** Days since 1970 on the Cambodian calendar (UTC+7). */
const cambodiaDayNumber = (ms: number) => Math.floor((ms + 7 * 3_600_000) / DAY_MS)
const isoDayNumber = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS)

/** What this phone has not seen yet, newest first: live for under ANNOUNCE_DAYS, and for this person. */
export function pendingAnnouncements(o: { entries?: WhatsNewEntry[]; seen: ReadonlySet<string>; now: number; business: boolean }): WhatsNewEntry[] {
  const today = cambodiaDayNumber(o.now)
  return (o.entries ?? WHATS_NEW)
    .filter((e) => !o.seen.has(e.id))
    .filter((e) => (e.scope ?? "all") === "all" || o.business)
    .filter((e) => {
      const age = today - isoDayNumber(e.date)
      return age >= 0 && age < ANNOUNCE_DAYS
    })
    .sort((a, b) => b.date.localeCompare(a.date))
}

type Store = { getItem(key: string): string | null; setItem(key: string, value: string): void }

/** The announcements this phone has seen (localStorage) — per device, like the other app preferences. */
export const WHATS_NEW_SEEN_KEY = "luychlat:whats-new-seen"
export function readSeen(store: Store | null): Set<string> {
  try {
    const raw: unknown = JSON.parse(store?.getItem(WHATS_NEW_SEEN_KEY) ?? "[]")
    return new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [])
  } catch {
    return new Set()
  }
}
export function markSeen(store: Store | null, ids: readonly string[]) {
  try {
    const seen = readSeen(store)
    for (const id of ids) seen.add(id)
    store?.setItem(WHATS_NEW_SEEN_KEY, JSON.stringify([...seen].slice(-200)))
  } catch {
    // private mode: shown again next launch, never an error
  }
}
