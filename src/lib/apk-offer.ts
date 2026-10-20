/**
 * The Android app offer on the prayer page (founder, 20/10/2026): on Android Chrome — never inside the app, never on an
 * iPhone — a member with prayer alerts on is invited to install the app, the one way to hear the Adhan with the screen
 * locked. «ពេលក្រោយ» hides it for 7 days on this phone. Pure (apk-offer.test.ts).
 */
export const APK_URL = "/LuyChlat.apk"
export const APK_OFFER_SNOOZE_DAYS = 7
export const APK_OFFER_KEY = "luychlat-apk-offer-snoozed"

/** Android, and not an iPhone / iPad (an iPad may say «Macintosh», never «Android»). */
export const isAndroidUa = (ua: string) => /android/i.test(ua) && !/iphone|ipad|ipod/i.test(ua)

export function shouldOfferApk(o: { ua: string; native: boolean; alertsOn: boolean; snoozedAt: number | null; now: number }): boolean {
  if (o.native || !o.alertsOn || !isAndroidUa(o.ua)) return false
  return o.snoozedAt === null || o.now - o.snoozedAt >= APK_OFFER_SNOOZE_DAYS * 86_400_000
}
