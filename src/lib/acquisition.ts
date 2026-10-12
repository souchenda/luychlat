/**
 * «តើបងបានស្គាល់ អេប លុយឆ្លាត តាមរយៈណាដែរ?» — where a new account heard of the app (founder,
 * 12/10/2026). Pure (acquisition.test.ts); saved in profile_private.acquisition_source.
 */
export const ACQUISITION_SOURCES = ["facebook", "telegram", "referral", "organic_search"] as const
export type AcquisitionSource = (typeof ACQUISITION_SOURCES)[number]

/** New accounts are asked within this many days of signing up (as the Islamic Mode choice). */
export const SOURCE_PROMPT_DAYS = 14

/** Ask on a new account's visits until answered; «រំលង» hides it for this visit only. */
export function shouldAskSource(o: { createdAt: string | null; now: number; loaded: boolean; answered: boolean; skipped: boolean }): boolean {
  if (!o.loaded || o.answered || o.skipped || !o.createdAt) return false
  return o.now - Date.parse(o.createdAt) < SOURCE_PROMPT_DAYS * 86_400_000
}
