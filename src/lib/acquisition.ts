/**
 * «តើបងបានស្គាល់ អេប លុយឆ្លាត តាមរយៈណាដែរ?» — where a new account heard of the app (founder,
 * 12/10/2026). Pure (acquisition.test.ts); saved in profile_private.acquisition_source.
 */
export const ACQUISITION_SOURCES = ["facebook", "telegram", "referral", "organic_search"] as const
export type AcquisitionSource = (typeof ACQUISITION_SOURCES)[number]
/** What is saved: one of the four, or a typed «other: …» (otherSource). */
export type AcquisitionAnswer = AcquisitionSource | `other: ${string}`

/** New accounts are asked within this many days of signing up (as the Islamic Mode choice). */
export const SOURCE_PROMPT_DAYS = 14

/** Ask on a new account's visits until answered; «រំលង» hides it for this visit only. */
export function shouldAskSource(o: { createdAt: string | null; now: number; loaded: boolean; answered: boolean; skipped: boolean }): boolean {
  if (!o.loaded || o.answered || o.skipped || !o.createdAt) return false
  return o.now - Date.parse(o.createdAt) < SOURCE_PROMPT_DAYS * 86_400_000
}

/** The longest typed «ផ្សេងៗ» answer kept. */
export const OTHER_SOURCE_MAX = 60

/**
 * A typed «ផ្សេងៗ» answer → «other: tiktok»: trimmed, spaces collapsed, Latin letters lower-cased (so
 * «TikTok» and «tiktok» group together in the admin view), 1–60 characters; null when empty.
 */
export function otherSource(text: string): string | null {
  const t = text
    .replace(/^\s*other\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
  if (!t) return null
  return `other: ${t.slice(0, OTHER_SOURCE_MAX).trim()}`
}

/**
 * How a saved answer reads in the new-user alert: one of the four → its key (the bot translates it);
 * «other: tiktok» → { other: "tiktok" }; nothing yet → null.
 */
export function sourceForAlert(answer: string | null | undefined): AcquisitionSource | { other: string } | null {
  if (!answer) return null
  if ((ACQUISITION_SOURCES as readonly string[]).includes(answer)) return answer as AcquisitionSource
  const m = /^other: (.+)$/.exec(answer)
  return m ? { other: m[1] } : null
}

/** A saved answer: one of the four, or a typed «other: …». */
export const isAcquisitionAnswer = (v: string | null | undefined) => Boolean(v && ((ACQUISITION_SOURCES as readonly string[]).includes(v) || /^other: \S/.test(v)))
