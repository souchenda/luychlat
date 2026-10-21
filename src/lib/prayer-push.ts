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

/**
 * The phone's province for the server's prayer push (founder, 21/10/2026 — Yerny's lock screen rang at Phnom Penh's 18:52
 * while her app, set to Kampot, said Isha at 18:56): the province picked in the app; with «my location», the province
 * nearest that fix — the GPS itself never leaves the phone (as the picker says).
 */
export function pushProvince(place: string, gps: { lat: number; lng: number } | null, provinces: { key: string; lat: number; lng: number }[]): string {
  if (place === "gps" && gps) return nearestProvince(gps.lat, gps.lng, provinces)
  return provinces.some((p) => p.key === place) ? place : provinces[0].key
}

/** The province whose centre is nearest (equirectangular distance — plenty at Cambodia's scale). */
export function nearestProvince(lat: number, lng: number, provinces: { key: string; lat: number; lng: number }[]): string {
  const k = Math.cos((lat * Math.PI) / 180)
  let best = provinces[0]
  let bestD = Infinity
  for (const p of provinces) {
    const d = (p.lat - lat) ** 2 + ((p.lng - lng) * k) ** 2
    if (d < bestD) [best, bestD] = [p, d]
  }
  return best.key
}

/**
 * The phones to ring together: one member in one province (a member's phones in two provinces ring at each one's own
 * time — one claim per member, day, prayer and province).
 */
export function groupByMemberProvince(rows: PrayerPushTarget[]): Map<string, PrayerPushTarget[]> {
  const out = new Map<string, PrayerPushTarget[]>()
  for (const r of rows) {
    const key = `${r.user_id}|${r.province}`
    out.set(key, [...(out.get(key) ?? []), r])
  }
  return out
}
