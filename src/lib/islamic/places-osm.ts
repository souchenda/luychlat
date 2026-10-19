/**
 * The Islamic places finder's data (founder, 19/10/2026 — «like the ATM finder»): mosques, surau and halal food
 * across Cambodia from OpenStreetMap (ODbL, credited on the page), refreshed weekly by
 * lib/server/islamic-places-sync.ts. Coordinates are OpenStreetMap's — never typed by hand. A place without a
 * proper name is called by its kind and the nearest town («វិហារឥស្លាម ជិតកំពត»), never an invented name; the
 * province only when OpenStreetMap tags it (never guessed from the nearest capital). Pure (places-osm.test.ts).
 */
import { nearestTown, type OsmElement, type Town } from "@/lib/atm"

export type OsmPlaceRow = {
  osm_ref: string
  kind: "MOSQUE" | "SURAU" | "HALAL"
  name: string
  province: string | null
  address: string | null
  lat: number
  lng: number
}

/** The Overpass query: Muslim places of worship, and food tagged halal, in Cambodia. */
export const ISLAMIC_PLACES_QUERY = `[out:json][timeout:90];
area["ISO3166-1"="KH"][admin_level=2]->.kh;
(nwr["amenity"="place_of_worship"]["religion"="muslim"](area.kh);
 nwr["diet:halal"~"^(yes|only)$"](area.kh);
 nwr["cuisine"~"halal"](area.kh););
out center tags;`

/** A name that only says «mosque» — the place is then called by its kind and the nearest town. */
const GENERIC = /^(mosque|mosquee|mosquée|masjid|masjed|mesjid|surau|musall?a|prayer room|វិហារ|វិហារឥស្លាម|ម៉ាស្ជិ[ឌទដ]|ស៊ូរ៉ាវ)$/i
const SURAU = /surau|ស៊ូរ៉ាវ|musall?a|musholl?a|prayer room/i
const KHMER = /[ក-៿]/
const clean = (s: string | undefined) => (s ?? "").replace(/[​-‍﻿]/g, "").replace(/\s+/g, " ").trim()

export const KIND_KM: Record<OsmPlaceRow["kind"], string> = { MOSQUE: "វិហារឥស្លាម", SURAU: "ស៊ូរ៉ាវ", HALAL: "អាហារហាឡាល់" }

/** An OpenStreetMap element → a place row, or null (not in Cambodia, no position, an unnamed food place). */
export function toPlaceRow(e: OsmElement, towns: Town[]): OsmPlaceRow | null {
  const tags = Object.fromEntries(Object.entries(e.tags ?? {}).map(([k, v]) => [k, clean(v)]))
  const lat = e.lat ?? e.center?.lat
  const lng = e.lon ?? e.center?.lon
  if (lat === undefined || lng === undefined || lat < 9.5 || lat > 15 || lng < 102 || lng > 108) return null
  const worship = tags.amenity === "place_of_worship" && tags.religion === "muslim"
  const halal = /^(yes|only)$/.test(tags["diet:halal"] ?? "") || /halal/i.test(tags.cuisine ?? "")
  if (!worship && !halal) return null
  const names = [tags["name:km"], tags.name, tags["name:en"]].filter((n): n is string => Boolean(n))
  const kind: OsmPlaceRow["kind"] = !worship ? "HALAL" : names.some((n) => SURAU.test(n)) ? "SURAU" : "MOSQUE"
  // Khmer first (name:km, or a Khmer name), then the name as tagged; a bare «Mosque» is no name.
  const proper = [tags["name:km"], KHMER.test(tags.name ?? "") ? tags.name : undefined, tags.name, tags["name:en"]].find((n) => n && !GENERIC.test(n))
  const town = nearestTown(lat, lng, towns)
  if (!proper && kind === "HALAL") return null // an unnamed restaurant can't be found by anyone
  const name = (proper ?? `${KIND_KM[kind]}${town ? ` ជិត${town.km}` : ""}`).slice(0, 120)
  const street = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ")
  const address = [street, tags["addr:city"]].filter(Boolean).join(", ") || (town ? `ជិត${town.km}` : null)
  return {
    osm_ref: `${e.type[0]}${e.id}`,
    kind,
    name,
    province: tags["addr:province"] ? tags["addr:province"].slice(0, 40) : null,
    address: address ? address.slice(0, 300) : null,
    lat: Math.round(lat * 1e6) / 1e6,
    lng: Math.round(lng * 1e6) / 1e6,
  }
}

/** Every element of an Overpass answer, converted; duplicates (a node and its way) kept once by reference. */
export function toPlaceRows(elements: OsmElement[], towns: Town[]): OsmPlaceRow[] {
  const rows = new Map<string, OsmPlaceRow>()
  for (const e of elements) {
    const row = toPlaceRow(e, towns)
    if (row) rows.set(row.osm_ref, row)
  }
  return [...rows.values()]
}
