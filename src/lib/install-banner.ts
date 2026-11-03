/**
 * «ដំឡើងអេប លុយឆ្លាត» banner (founder, 3/11/2026 — «easy for the people using it, not done by hand»): a floating card
 * above the bottom bar with one [ដំឡើង] tap, instead of an install card buried in Settings. Pure (install-banner.test.ts).
 *
 *   prompt  Chrome / Edge / Samsung on Android and desktop: the browser's own install, one tap
 *   ios     iPhone / iPad: Apple gives a web page no install button — two steps shown (Share › Add to Home Screen)
 *   null    inside the Android app, already on the home screen, or × tapped in the last 14 days
 */
export const INSTALL_SNOOZE_DAYS = 14
export const INSTALL_SNOOZE_KEY = "luychlat-install-banner-snoozed"
/** Not the first thing on screen: the page settles (and the welcome greeting goes) first. */
export const INSTALL_BANNER_DELAY_MS = 6000

export type InstallBannerMode = "prompt" | "ios" | null

export const isIosUa = (ua: string, touchMac = false) => /iphone|ipad|ipod/i.test(ua) || (touchMac && /macintosh/i.test(ua))

export function installBannerMode(o: { standalone: boolean; native: boolean; ios: boolean; canPrompt: boolean; snoozedAt: number | null; now: number }): InstallBannerMode {
  if (o.native || o.standalone) return null
  if (o.snoozedAt !== null && o.now - o.snoozedAt < INSTALL_SNOOZE_DAYS * 86_400_000) return null
  if (o.canPrompt) return "prompt"
  return o.ios ? "ios" : null
}
