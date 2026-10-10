/**
 * Cambodian bank ATMs and branches (ABA, ACLEDA, Canadia, Wing, Sathapana) from OpenStreetMap
 * (© OpenStreetMap contributors, ODbL), stored locally in bank_atms so a search costs nothing:
 * the distance is the Haversine formula, directions open Google Maps. Pure (atm.test.ts) — the
 * import is src/lib/server/atm-sync.ts.
 */

import { distanceKm } from "@/lib/prayer"

export type BankCode = "ABA" | "ACLEDA" | "CANADIA" | "WING" | "SATHAPANA"
export type AtmType = "ATM" | "CRM" | "BRANCH"

export const BANKS: { code: BankCode; label: string; dot: string; match: RegExp }[] = [
  { code: "ABA", label: "ABA", dot: "🔵", match: /\baba\b|advanced bank of asia|អេប៊ីអេ/i },
  { code: "ACLEDA", label: "ACLEDA", dot: "🟡", match: /acleda|អេស៊ីលីដា|អេសុីលីដា/i },
  { code: "CANADIA", label: "Canadia", dot: "🔴", match: /canadia|កាណាឌីយ៉ា/i },
  { code: "WING", label: "Wing", dot: "🟢", match: /\bwing\b|វីង/i },
  { code: "SATHAPANA", label: "Sathapana", dot: "🟣", match: /sathapana|ស្ថាបនា/i },
]

export type OsmElement = { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }
export type Town = { en: string; km: string; lat: number; lng: number }

export type BankAtm = {
  osm_ref: string
  bank_code: BankCode
  type: AtmType
  name_kh: string | null
  name_en: string | null
  address: string | null
  province: string | null
  province_km: string | null
  latitude: number
  longitude: number
  currencies: string[] | null
  is_24h: boolean
}

/** Which of the five banks an OSM entry belongs to (brand / operator / name), else null. */
export function bankOf(tags: Record<string, string>): BankCode | null {
  const text = ["brand", "brand:en", "operator", "operator:en", "name", "name:en", "name:km"].map((k) => tags[k] ?? "").join(" ")
  return BANKS.find((b) => b.match.test(text))?.code ?? null
}

/** An ATM that takes deposits (cash_in=yes) is a CRM; a bank office is a branch. */
export function typeOf(tags: Record<string, string>): AtmType | null {
  // Some ATMs are mapped as "bank" but named for what they are ("Atm ABA", "ATM Canadia").
  if (tags.amenity === "bank") return /\batm\b/i.test([tags.name, tags["name:en"]].filter(Boolean).join(" ")) ? (tags.cash_in === "yes" ? "CRM" : "ATM") : "BRANCH"
  if (tags.amenity === "atm") return tags.cash_in === "yes" ? "CRM" : "ATM"
  return null
}

/** The nearest town or city (OSM places) — most provinces are named after theirs. */
export function nearestTown(lat: number, lng: number, towns: Town[]): Town | null {
  let best: Town | null = null
  let bestKm = Infinity
  for (const t of towns) {
    const km = distanceKm({ lat, lng }, { lat: t.lat, lng: t.lng })
    if (km < bestKm) {
      best = t
      bestKm = km
    }
  }
  return best
}

/** One OSM element → a bank_atms row, or null when it isn't one of the five banks' ATMs / branches. */
export function toAtmRow(e: OsmElement, towns: Town[]): BankAtm | null {
  // Zero-width spaces (common in Khmer text) and stray whitespace out of every tag.
  const tags = Object.fromEntries(Object.entries(e.tags ?? {}).map(([k, v]) => [k, v.replace(/[\u200b-\u200d\ufeff]/g, "").trim()]))
  const bank = bankOf(tags)
  const type = typeOf(tags)
  const lat = e.lat ?? e.center?.lat
  const lng = e.lon ?? e.center?.lon
  if (!bank || !type || lat === undefined || lng === undefined) return null
  if (lat < 9.5 || lat > 15 || lng < 102 || lng > 108) return null // Cambodia, roughly
  const street = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ")
  const town = nearestTown(lat, lng, towns)
  const currencies = [tags["currency:USD"] === "yes" && "USD", tags["currency:KHR"] === "yes" && "KHR"].filter(Boolean) as string[]
  return {
    osm_ref: `${e.type[0]}${e.id}`,
    bank_code: bank,
    type,
    name_kh: tags["name:km"] ?? (/[ក-៿]/.test(tags.name ?? "") ? tags.name : null) ?? null,
    name_en: tags["name:en"] ?? (tags.name && !/[ក-៿]/.test(tags.name) ? tags.name : null) ?? null,
    address: [street, tags["addr:city"]].filter(Boolean).join(", ") || null,
    province: tags["addr:province"] ?? town?.en ?? null,
    province_km: town?.km ?? null,
    latitude: Math.round(lat * 1e6) / 1e6,
    longitude: Math.round(lng * 1e6) / 1e6,
    currencies: currencies.length ? currencies : null,
    // 24/7 when tagged so; a standalone ATM is assumed 24 h unless it says otherwise; a branch keeps office hours.
    is_24h: tags.opening_hours ? tags.opening_hours.trim() === "24/7" : type !== "BRANCH",
  }
}

export const directionsUrl = (lat: number, lng: number) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`

/**
 * Google Maps' own search around a point ("ABA ATM", or every ATM) — a plain link, no API and no
 * cost. OpenStreetMap lists only part of Cambodia's ATMs (sparse in the provinces), so this shows
 * the rest live.
 */
export function googleMapsSearchUrl(bank: BankCode | null | undefined, lat: number, lng: number): string {
  const label = bank ? BANKS.find((b) => b.code === bank)?.label : null
  const query = label ? `${encodeURIComponent(label)}+ATM` : "ATM"
  return `https://www.google.com/maps/search/${query}/@${lat.toFixed(6)},${lng.toFixed(6)},14z`
}

/** Fewer than this many found nearby: the area's data may be incomplete — point to Google Maps. */
export const SPARSE_RESULTS = 3

export const SPARSE_HINT = "ℹ️ ក្នុងតំបន់នេះ ទិន្នន័យមូលដ្ឋានអាចនៅខ្វះចន្លោះ។ បងអាចចុច «🗺️ រកលើ Google Maps ផ្ទាល់» ដើម្បីមើលទូ ATM ទាំងអស់ជុំវិញទីនេះ។"
export const GOOGLE_BUTTON = "🗺️ រកលើ Google Maps ផ្ទាល់ ↗"

export type Near = BankAtm & { distance_km: number }

/** Sorted by distance (km), filtered by bank and type, within `radiusKm`. */
export function nearest(rows: BankAtm[], from: { lat: number; lng: number }, opts: { bank?: BankCode | null; type?: AtmType | "CASH" | null; radiusKm?: number; limit?: number } = {}): Near[] {
  return rows
    .filter((r) => !opts.bank || r.bank_code === opts.bank)
    .filter((r) => !opts.type || (opts.type === "CASH" ? r.type !== "BRANCH" : r.type === opts.type))
    .map((r) => ({ ...r, distance_km: distanceKm(from, { lat: r.latitude, lng: r.longitude }) }))
    .filter((r) => r.distance_km <= (opts.radiusKm ?? 10))
    .sort((a, b) => a.distance_km - b.distance_km)
    .slice(0, opts.limit ?? 5)
}

const TYPE_KM: Record<AtmType, string> = { ATM: "🏧 ដកប្រាក់", CRM: "📥 ដក/ដាក់ប្រាក់", BRANCH: "🏦 សាខា" }

export const kmText = (km: number) => (km < 1 ? `${Math.round(km * 1000)} ម៉ែត្រ` : `${km.toFixed(1)} គ.ម`)

/** The bot's answer (Telegram HTML): the nearest, each with a directions link. */
export function nearestText(rows: Near[], esc: (s: string) => string): string {
  if (!rows.length) return `🏧 រកមិនឃើញទូ ATM ឬសាខាក្នុងរង្វង់ ១០ គ.ម ក្នុងទិន្នន័យរបស់យើងទេ។

${SPARSE_HINT}`
  const lines = ["🏧 <b>ទូ ATM ដែលនៅជិតបងបំផុត៖</b>", ""]
  rows.forEach((r, i) => {
    const bank = BANKS.find((b) => b.code === r.bank_code)!
    const name = r.name_kh ?? r.name_en ?? r.province ?? ""
    const where = [r.address, r.province_km ?? r.province].filter(Boolean).join(" · ")
    const cur = r.currencies?.length ? ` (${r.currencies.map((c) => (c === "USD" ? "$" : "៛")).join(" / ")})` : ""
    lines.push(`${i + 1}. ${bank.dot} ${bank.label} ${r.type === "BRANCH" ? "Branch" : r.type} - ${esc(name)} (${kmText(r.distance_km)})`)
    lines.push(`   📍 ${esc(where || "—")} · ${TYPE_KM[r.type]}${cur}${r.is_24h ? " · 24/7" : ""}`)
    lines.push(`   👉 <a href="${directionsUrl(r.latitude, r.longitude)}">🗺️ បើកផែនទីនាំផ្លូវ</a>`, "")
  })
  if (rows.length < SPARSE_RESULTS) lines.push(SPARSE_HINT, "")
  lines.push("<i>ទិន្នន័យ៖ © OpenStreetMap contributors</i>")
  return lines.join("\n")
}

/**
 * "/atm តាកែវ", "/atm Siem Reap": a province (Khmer, English or an old name) at its capital, else a town
 * by name; null when nothing matches.
 */
export function placeFrom(text: string, provinces: { km: string; en: string; aliases: string[]; lat: number; lng: number }[], towns: Town[]): { name: string; lat: number; lng: number } | null {
  const q = text.trim().toLowerCase().replace(/^(ក្រុង|ស្រុក|ខេត្ត|រាជធានី)\s*/, "").replace(/\s+/g, " ")
  if (q.length < 2) return null
  const p = provinces.find((x) => x.km === q || x.en.toLowerCase() === q || x.aliases.includes(q)) ?? provinces.find((x) => x.km.includes(q) || q.includes(x.km))
  if (p) return { name: p.km, lat: p.lat, lng: p.lng }
  const t = towns.find((x) => x.km === q || x.en.toLowerCase() === q) ?? towns.find((x) => x.km.includes(q) || x.en.toLowerCase().includes(q))
  return t ? { name: t.km, lat: t.lat, lng: t.lng } : null
}
