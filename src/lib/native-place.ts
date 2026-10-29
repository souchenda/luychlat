"use client"

// «My location» by name, on the phone (founder, 29/10/2026 — lib/place-name.ts): the app (1.13+) asks Android's own
// Geocoder (android/…/PlaceNamePlugin.java); a browser, an iPhone or an older app looks up the nearest named place in the
// list shipped with the site (public/data/kh-places.json). The GPS fix stays on the phone — no call to our server.

import { registerPlugin } from "@capacitor/core"

import { isNativeApp } from "@/lib/native-bridge"
import { geocodedLabel, nearestPlace, type GeocodedAddress, type KnownPlace } from "@/lib/place-name"

type PlaceNamePlugin = { lookup(o: { lat: number; lng: number; lang: string }): Promise<GeocodedAddress & { found: boolean }> }

const PlaceName = registerPlugin<PlaceNamePlugin>("PlaceName")

let known: Promise<KnownPlace[]> | null = null
const knownPlaces = () =>
  (known ??= window
    .fetch("/data/kh-places.json")
    .then((r) => (r.ok ? (r.json() as Promise<{ places: KnownPlace[] }>) : { places: [] }))
    .then((d) => d.places)
    .catch(() => []))

/** «exact»: the phone's geocoder named the place; «near»: the nearest known place (said «ជិត…»). null: no name. */
export type PlaceLabel = { name: string; kind: "exact" | "near" }

export async function placeNameFor(lat: number, lng: number, locale: "km" | "en" | "zh"): Promise<PlaceLabel | null> {
  if (isNativeApp()) {
    try {
      const a = await PlaceName.lookup({ lat, lng, lang: locale })
      const name = a?.found ? geocodedLabel(a) : null
      if (name) return { name, kind: "exact" }
    } catch {
      // An app before 1.13 has no PlaceName plugin — the list below then.
    }
  }
  const near = nearestPlace(lat, lng, await knownPlaces(), locale)
  return near ? { name: near.name, kind: "near" } : null
}
