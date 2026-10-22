/**
 * The prayer place when the phone gives no GPS (founder, 22/10/2026): the APK had no location permission, a browser
 * may be refused — the nearest province from the network instead. Cloudflare (in front of app.luychlat.com) adds the
 * visitor's approximate place from their IP (cf-iplatitude / cf-iplongitude, «Add visitor location headers»; the
 * country in cf-ipcountry always). The IP itself never reaches us or any other service, and nothing is stored.
 *
 * Never a silent guess (CLAUDE.md): only a place inside Cambodia picks a province, and the app says it is approximate
 * («from your network»); abroad, or with no place, it answers null and the last province chosen stays.
 */
import { nearestProvince } from "@/lib/prayer-push"

type Headers = { get(name: string): string | null }
type Province = { key: string; lat: number; lng: number }

export type NetworkPlace = { province: string | null; country: string | null; source: "network" | "none"; reason?: "abroad" | "unknown" }

/** Cambodia's extent (with a margin): a network fix outside it is never mapped to a province. */
const inCambodia = (lat: number, lng: number) => lat >= 9.8 && lat <= 14.8 && lng >= 102.2 && lng <= 107.8

export function networkPlace(headers: Headers, provinces: Province[]): NetworkPlace {
  const country = headers.get("cf-ipcountry")?.trim().toUpperCase() || null
  if (country && country !== "KH" && country !== "XX" && country !== "T1") return { province: null, country, source: "none", reason: "abroad" }
  const lat = Number(headers.get("cf-iplatitude"))
  const lng = Number(headers.get("cf-iplongitude"))
  if (!headers.get("cf-iplatitude") || !headers.get("cf-iplongitude") || !Number.isFinite(lat) || !Number.isFinite(lng) || !inCambodia(lat, lng)) {
    return { province: null, country, source: "none", reason: "unknown" }
  }
  return { province: nearestProvince(lat, lng, provinces), country: country ?? "KH", source: "network" }
}
