/**
 * The prayer-time Web Push (founder, 20/10/2026 — the father's Android rings at each prayer even with the app closed).
 * Pure (prayer-push.test.ts). The notification shares the in-app alert's tag («prayer-<key>»), so an open app's own
 * notification is replaced, never doubled; it buzzes, stays on the screen, and a tap opens the prayer page — opened
 * within the prayer's 5-minute window, the app's scheduler then plays the Adhan.
 */
export type PrayerPushTarget = { user_id: string; endpoint: string; p256dh: string; auth: string; province: string; language: string }

export function prayerPushPayload(o: { prayer: string; title: string; body: string }) {
  return {
    title: `🕌 ${o.title}`,
    body: o.body,
    tag: `prayer-${o.prayer}`,
    url: "/islamic/prayer",
    renotify: true,
    requireInteraction: true,
    vibrate: [400, 200, 400, 200, 800],
  }
}

/** The members to ring, each with all their phones (one claim per member, day and prayer). */
export function groupByMember(rows: PrayerPushTarget[]): Map<string, PrayerPushTarget[]> {
  const out = new Map<string, PrayerPushTarget[]>()
  for (const r of rows) out.set(r.user_id, [...(out.get(r.user_id) ?? []), r])
  return out
}
