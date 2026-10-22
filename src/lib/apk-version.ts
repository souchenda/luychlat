/**
 * The Android app's version and its in-app update (founder, 22/10/2026 — Task #468). One source of truth for the newest
 * APK: android/app/build.gradle (versionCode / versionName) and capacitor.config.ts (the User-Agent token) must match it
 * (apk-version.test.ts), and deploy/build-apk.sh publishes it as /downloads/LuyChlat-v<version>.apk.
 *
 * The installed APK tells the page its build through its User-Agent («LuyChlatApp/6», Capacitor appendUserAgent) — the
 * app ships no plugin to ask. Builds before 1.5 send no token: they are older, so they are offered the update.
 */
export const LATEST_APK = {
  version: "1.5",
  code: 6,
  changelogKm: "• បន្ថែមសិទ្ធិ GPS ទីតាំង\n• ជួសជុលកុងតាក់ម៉ោងសឡាត និងសំឡេងអាហ្សាន",
} as const

/** The first build that opens a download link in the phone's browser (MainActivity's DownloadListener). */
export const IN_APP_DOWNLOAD_FROM = 6

export const apkFileName = (version: string) => `LuyChlat-v${version}.apk`
export const apkDownloadPath = (version: string) => `/downloads/${apkFileName(version)}`
export const APK_USER_AGENT = (code: number) => `LuyChlatApp/${code}`

/** The installed APK's build: its token; 0 for an APK too old to send one; null in a browser (no APK to update). */
export function installedApkCode(ua: string, native: boolean): number | null {
  const m = /\bLuyChlatApp\/(\d+)\b/.exec(ua)
  if (m) return Number(m[1])
  return native ? 0 : null
}

/** The versions this app has had (build → name), for «ជំនាន់ v1.5 (Build 6)»; a build before the token reads as «≤ 1.4». */
const VERSION_NAMES: Record<number, string> = { 6: "1.5" }

/** The installed APK for Settings › About: a known build's name, or «old» (no token), never a guessed number. */
export function apkVersion(code: number | null): { kind: "browser" } | { kind: "old" } | { kind: "known"; version: string | null; code: number } {
  if (code === null) return { kind: "browser" }
  if (code === 0) return { kind: "old" }
  return { kind: "known", version: VERSION_NAMES[code] ?? null, code }
}

export type AppVersionInfo = { latestVersion: string; versionCode: number; downloadUrl: string; changelogKhmer: string }

export const appVersionInfo = (): AppVersionInfo => ({
  latestVersion: LATEST_APK.version,
  versionCode: LATEST_APK.code,
  downloadUrl: apkDownloadPath(LATEST_APK.version),
  changelogKhmer: LATEST_APK.changelogKm,
})

/** An update to offer: an APK older than the newest one published (a browser has none). */
export const updateAvailable = (installed: number | null, latest: number) => installed !== null && installed < latest

/** Snoozed per version for a day: «ពេលក្រោយ» never hides the next version. */
export const UPDATE_SNOOZE_KEY = "luychlat-apk-update-snoozed"
export const UPDATE_SNOOZE_MS = 24 * 3_600_000
export function updateSnoozed(stored: string | null, versionCode: number, now: number): boolean {
  const [code, at] = (stored ?? "").split(":").map(Number)
  return code === versionCode && Number.isFinite(at) && now - at < UPDATE_SNOOZE_MS
}
