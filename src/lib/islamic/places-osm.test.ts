import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { OsmElement } from "@/lib/atm"
import { TOWNS } from "@/lib/kh-towns"

import { ISLAMIC_PLACES_QUERY, toPlaceRow, toPlaceRows } from "./places-osm"

const node = (id: number, lat: number, lon: number, tags: Record<string, string>): OsmElement => ({ type: "node", id, lat, lon, tags })
const worship = { amenity: "place_of_worship", religion: "muslim" }

describe("Islamic places from OpenStreetMap (founder, 19/10/2026 — pre-loaded like the ATM finder)", () => {
  it("a named mosque keeps its name (Khmer first) and OpenStreetMap's own coordinates", () => {
    const r = toPlaceRow(node(1, 11.636912, 104.887034, { ...worship, name: "វិហារធំ​គីឡូម៉ែត្រ លេខ ៩" }), TOWNS)!
    assert.equal(r.kind, "MOSQUE")
    assert.equal(r.name, "វិហារធំគីឡូម៉ែត្រ លេខ ៩") // zero-width space removed
    assert.deepEqual([r.lat, r.lng, r.osm_ref], [11.636912, 104.887034, "n1"])
    assert.equal(toPlaceRow(node(2, 11.63, 104.90, { ...worship, name: "Nurul Earsan Mosque", "name:km": "វិហារ នូរ៉ុល អាស់សាន" }), TOWNS)!.name, "វិហារ នូរ៉ុល អាស់សាន")
  })
  it("a place named only «Mosque» is called by its kind and the nearest town — never an invented name", () => {
    const r = toPlaceRow(node(3, 10.6134, 104.1696, { ...worship, name: "Mosque" }), TOWNS)!
    assert.match(r.name, /^វិហារឥស្លាម ជិត/)
    assert.equal(r.address, r.name.replace("វិហារឥស្លាម ", ""))
  })
  it("a surau by its name; halal food only with a name; the province only when tagged", () => {
    assert.equal(toPlaceRow(node(4, 11.63, 104.90, { ...worship, name: "ស៊ូរ៉ាវ នូរូឌដាអ៊ី" }), TOWNS)!.kind, "SURAU")
    const food = toPlaceRow(node(5, 11.55, 104.92, { amenity: "restaurant", "diet:halal": "yes", name: "Taste of the Middle East - Halal Food" }), TOWNS)!
    assert.deepEqual([food.kind, food.province], ["HALAL", null])
    assert.equal(toPlaceRow(node(6, 11.55, 104.92, { amenity: "restaurant", "diet:halal": "only" }), TOWNS), null)
    assert.equal(toPlaceRow(node(7, 11.55, 104.92, { ...worship, name: "Al-Serkal Mosque", "addr:province": "Phnom Penh" }), TOWNS)!.province, "Phnom Penh")
  })
  it("never outside Cambodia, never without a position, never another religion's temple", () => {
    assert.equal(toPlaceRow(node(8, 13.75, 100.5, { ...worship, name: "Bangkok Mosque" }), TOWNS), null)
    assert.equal(toPlaceRow({ type: "way", id: 9, tags: { ...worship, name: "x" } }, TOWNS), null)
    assert.equal(toPlaceRow(node(10, 11.55, 104.92, { amenity: "place_of_worship", religion: "buddhist", name: "Wat" }), TOWNS), null)
  })
  it("a way uses its centre; the same reference is kept once", () => {
    const way: OsmElement = { type: "way", id: 11, center: { lat: 11.5793, lon: 104.9143 }, tags: { ...worship, name: "Al-Serkal Mosque" } }
    assert.equal(toPlaceRows([way, way], TOWNS).length, 1)
    assert.equal(toPlaceRows([way], TOWNS)[0].osm_ref, "w11")
  })
  it("the query asks for Muslim places of worship and halal food, in Cambodia only", () => {
    assert.match(ISLAMIC_PLACES_QUERY, /area\["ISO3166-1"="KH"\]/)
    assert.match(ISLAMIC_PLACES_QUERY, /\["religion"="muslim"\]/)
    assert.match(ISLAMIC_PLACES_QUERY, /diet:halal/)
  })
})
