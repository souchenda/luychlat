/**
 * «My location» by name (founder, 29/10/2026 — «show where I am, like my Samsung: កួរស្រូវ»). Two sources, both on the
 * phone — the GPS fix never reaches our server:
 *  1. the app (1.13+): Android's own Geocoder (android/…/PlaceNamePlugin.java) → the area, the sangkat / khum, the khan /
 *     srok and the province; the label is the two most precise distinct names, «កួរស្រូវ · ខណ្ឌដង្កោ»;
 *  2. a browser or an iPhone: the nearest named place of Cambodia that OpenStreetMap knows (public/data/kh-places.json),
 *     within 2 km — said to be near («ជិត…»), never claimed as the exact place; farther than that, no name.
 * Pure (place-name.test.ts).
 */

export type GeocodedAddress = {
  feature?: string
  subLocality?: string
  locality?: string
  subAdminArea?: string
  adminArea?: string
}

/** A part that names nothing: empty, a number, a plus code («7P8R+2C»), a road number. */
const meaningless = (s: string) => !s.trim() || /^[\d\s.,/-]+$/.test(s) || /^[23456789CFGHJMPQRVWX]{4,}\+[23456789CFGHJMPQRVWX]{2,}/i.test(s.trim())

/**
 * The label from the phone's geocoder: the two most precise distinct names — the area (subLocality, or the feature when
 * it is a place and not a number), then the sangkat (locality) or the khan (subAdminArea); the province only when nothing
 * finer is known. null when the geocoder gave no name.
 */
export function geocodedLabel(a: GeocodedAddress): string | null {
  const ordered = [a.subLocality, a.feature, a.locality, a.subAdminArea, a.adminArea].map((s) => (s ?? "").trim())
  const parts: string[] = []
  for (const p of ordered) {
    if (meaningless(p)) continue
    // A part already said inside another («សង្កាត់រលួស» and «រលួស») is said once.
    if (parts.some((q) => q.includes(p) || p.includes(q))) continue
    parts.push(p)
    if (parts.length === 2) break
  }
  return parts.length ? parts.join(" · ") : null
}

/** [lat, lng, Khmer name, English name] — public/data/kh-places.json. */
export type KnownPlace = [number, number, string, string]

/** Distance in km between two points (haversine). */
export function kmBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const r = (d: number) => (d * Math.PI) / 180
  const dLat = r(bLat - aLat)
  const dLng = r(bLng - aLng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

export const NEAR_KM = 2

/** The nearest named place within NEAR_KM, in the reader's language (Khmer, else English) — or null. */
export function nearestPlace(lat: number, lng: number, places: KnownPlace[], locale: "km" | "en" | "zh"): { name: string; km: number } | null {
  let best: { p: KnownPlace; d: number } | null = null
  for (const p of places) {
    if (Math.abs(p[0] - lat) > 0.05 || Math.abs(p[1] - lng) > 0.05) continue
    const d = kmBetween(lat, lng, p[0], p[1])
    if (d <= NEAR_KM && (!best || d < best.d)) best = { p, d }
  }
  if (!best) return null
  const name = locale === "km" ? best.p[2] || best.p[3] : best.p[3] || best.p[2]
  return name ? { name, km: best.d } : null
}
