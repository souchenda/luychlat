import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { distanceKm } from "@/lib/prayer"

import { bankOf, directionsUrl, googleMapsSearchUrl, nearest, nearestText, SPARSE_HINT, toAtmRow, typeOf, type BankAtm } from "./atm"

const towns = [
  { en: "Phnom Penh", km: "ភ្នំពេញ", lat: 11.5564, lng: 104.9282 },
  { en: "Takeo", km: "តាកែវ", lat: 10.9908, lng: 104.785 },
]

describe("ATM locator — Haversine distance", () => {
  it("Phnom Penh → Takeo is about 64 km in a straight line", () => {
    const km = distanceKm({ lat: 11.5564, lng: 104.9282 }, { lat: 10.9908, lng: 104.785 })
    assert.ok(km > 62 && km < 66, String(km))
  })
  it("the same point is 0 km", () => {
    assert.equal(distanceKm({ lat: 11.5, lng: 104.9 }, { lat: 11.5, lng: 104.9 }), 0)
  })
})

describe("ATM locator — reading OpenStreetMap", () => {
  it("bank and type from the tags", () => {
    assert.equal(bankOf({ brand: "ABA Bank" }), "ABA")
    assert.equal(bankOf({ operator: "ACLEDA Bank Plc." }), "ACLEDA")
    assert.equal(bankOf({ name: "ធនាគារ កាណាឌីយ៉ា" }), "CANADIA")
    assert.equal(bankOf({ name: "Wing Bank" }), "WING")
    assert.equal(bankOf({ name: "Sathapana Bank" }), "SATHAPANA")
    assert.equal(bankOf({ name: "Prince Bank" }), null)
    assert.equal(typeOf({ amenity: "atm", cash_in: "yes" }), "CRM")
    assert.equal(typeOf({ amenity: "atm" }), "ATM")
    assert.equal(typeOf({ amenity: "bank" }), "BRANCH")
    assert.equal(typeOf({ amenity: "bank", name: "Atm ABA" }), "ATM")
  })
  it("an element becomes a row: its town, currencies, 24/7", () => {
    const row = toAtmRow({ type: "node", id: 42, lat: 10.99, lon: 104.79, tags: { amenity: "atm", brand: "ABA Bank", "name:km": "ABA ATM - ផ្សារតាកែវ", "currency:USD": "yes", "currency:KHR": "yes", opening_hours: "24/7" } }, towns)
    assert.deepEqual(row && { ref: row.osm_ref, bank: row.bank_code, type: row.type, name: row.name_kh, prov: row.province_km, cur: row.currencies, h24: row.is_24h }, {
      ref: "n42",
      bank: "ABA",
      type: "ATM",
      name: "ABA ATM - ផ្សារតាកែវ",
      prov: "តាកែវ",
      cur: ["USD", "KHR"],
      h24: true,
    })
    // A branch keeps office hours unless tagged 24/7; another bank or outside Cambodia: skipped.
    assert.equal(toAtmRow({ type: "way", id: 7, center: { lat: 11.55, lon: 104.92 }, tags: { amenity: "bank", operator: "ACLEDA" } }, towns)?.is_24h, false)
    assert.equal(toAtmRow({ type: "node", id: 1, lat: 11.55, lon: 104.92, tags: { amenity: "atm", brand: "Prince Bank" } }, towns), null)
    assert.equal(toAtmRow({ type: "node", id: 2, lat: 1.3, lon: 103.8, tags: { amenity: "atm", brand: "ABA Bank" } }, towns), null)
  })
})

describe("ATM locator — nearest, filters, the bot's answer", () => {
  const row = (bank: BankAtm["bank_code"], type: BankAtm["type"], lat: number, lng: number, name: string): BankAtm => ({
    osm_ref: name, bank_code: bank, type, name_kh: name, name_en: null, address: null, province: "Phnom Penh", province_km: "ភ្នំពេញ", latitude: lat, longitude: lng, currencies: null, is_24h: type !== "BRANCH",
  })
  const rows = [
    row("ABA", "ATM", 11.5600, 104.9300, "far ABA"),
    row("ABA", "CRM", 11.5570, 104.9285, "near ABA"),
    row("ACLEDA", "ATM", 11.5580, 104.9290, "ACLEDA"),
    row("ACLEDA", "BRANCH", 11.5575, 104.9288, "ACLEDA branch"),
    row("WING", "ATM", 12.5, 104.0, "too far"),
  ]
  const me = { lat: 11.5564, lng: 104.9282 }
  it("sorted by distance, within 10 km", () => {
    assert.deepEqual(nearest(rows, me).map((r) => r.osm_ref), ["near ABA", "ACLEDA branch", "ACLEDA", "far ABA"])
  })
  it("filtered by bank and by type (cash = ATM or CRM)", () => {
    assert.deepEqual(nearest(rows, me, { bank: "ACLEDA" }).map((r) => r.osm_ref), ["ACLEDA branch", "ACLEDA"])
    assert.deepEqual(nearest(rows, me, { type: "CRM" }).map((r) => r.osm_ref), ["near ABA"])
    assert.deepEqual(nearest(rows, me, { type: "CASH" }).map((r) => r.osm_ref), ["near ABA", "ACLEDA", "far ABA"])
  })
  it("the bot's list links Google Maps directions", () => {
    const text = nearestText(nearest(rows, me, { limit: 2 }), (s) => s)
    assert.match(text, /^🏧 <b>ទូ ATM ដែលនៅជិតបងបំផុត៖<\/b>/)
    assert.match(text, /1\. 🔵 ABA CRM - near ABA \(\d+ ម៉ែត្រ\)/)
    assert.ok(text.includes(directionsUrl(11.557, 104.9285)))
    assert.match(text, /© OpenStreetMap contributors/)
  })
})

describe("ATM locator — a place by name", () => {
  it("a province in Khmer, English or an old name; a town; nothing", async () => {
    const { PROVINCES, TOWNS } = await import("./kh-towns")
    const { placeFrom } = await import("./atm")
    assert.equal(placeFrom("តាកែវ", PROVINCES, TOWNS)?.name, "តាកែវ")
    assert.equal(placeFrom("ខេត្តតាកែវ", PROVINCES, TOWNS)?.name, "តាកែវ")
    assert.equal(placeFrom("Siem Reap", PROVINCES, TOWNS)?.name, "សៀមរាប")
    assert.equal(placeFrom("kampong som", PROVINCES, TOWNS)?.name, "ព្រះសីហនុ")
    assert.ok(placeFrom("Kampong Trach", PROVINCES, TOWNS))
    assert.equal(placeFrom("Bangkok", PROVINCES, TOWNS), null)
  })
})

describe("ATM locator — Google Maps for what OpenStreetMap lacks", () => {
  it("a search link around the point: one bank, or every ATM", () => {
    assert.equal(googleMapsSearchUrl("ABA", 10.9908, 104.785), "https://www.google.com/maps/search/ABA+ATM/@10.990800,104.785000,14z")
    assert.equal(googleMapsSearchUrl(null, 10.9908, 104.785), "https://www.google.com/maps/search/ATM/@10.990800,104.785000,14z")
  })
  it("fewer than 3 nearby, or none: the hint to search Google Maps", () => {
    const one: BankAtm = { osm_ref: "n1", bank_code: "SATHAPANA", type: "ATM", name_kh: null, name_en: "Sathapana", address: null, province: "Takeo", province_km: "តាកែវ", latitude: 10.99, longitude: 104.79, currencies: null, is_24h: true }
    assert.ok(nearestText(nearest([one], { lat: 10.99, lng: 104.78 }), (s) => s).includes(SPARSE_HINT))
    assert.ok(nearestText([], (s) => s).includes(SPARSE_HINT))
  })
})
