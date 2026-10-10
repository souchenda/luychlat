/**
 * Real-world acceptance tests for the ATM finder, against the REAL production rows: the OpenStreetMap
 * seed (supabase/migrations/20270133000000_bank_atms.sql) and the verified additions
 * (20270139000000_verified_atm_angk_ta_saom.sql — the ABA ATM at Angk Ta Saom on Route 3, which
 * OpenStreetMap doesn't map, supplied and verified by the founder). No invented entries.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import { googleMapsSearchUrl, nearest, type BankAtm } from "../src/lib/atm"

/** The rows a migration put in production (the seed's 12 values, or 13 with the source). */
function migrationRows(file: string): BankAtm[] {
  const sql = readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8")
  const str = "('(?:[^']|'')*'|null)"
  const row = new RegExp(`^\\s*\\(${str}, ${str}, ${str}, ${str}, ${str}, ${str}, ${str}, ${str}, (-?[\\d.]+), (-?[\\d.]+), (array\\[[^\\]]*\\]|null), (true|false)(?:, '\\w+')?\\),?$`, "gm")
  const text = (v: string) => (v === "null" ? null : v.slice(1, -1).replaceAll("''", "'"))
  return [...sql.matchAll(row)].map((m) => ({
    osm_ref: text(m[1])!,
    bank_code: text(m[2]) as BankAtm["bank_code"],
    type: text(m[3]) as BankAtm["type"],
    name_kh: text(m[4]),
    name_en: text(m[5]),
    address: text(m[6]),
    province: text(m[7]),
    province_km: text(m[8]),
    latitude: Number(m[9]),
    longitude: Number(m[10]),
    currencies: m[11] === "null" ? null : [...m[11].matchAll(/'(\w+)'/g)].map((c) => c[1]),
    is_24h: m[12] === "true",
  }))
}

const seed = migrationRows("20270133000000_bank_atms.sql")
const verified = migrationRows("20270139000000_verified_atm_angk_ta_saom.sql")
const rows = [...seed, ...verified]

describe("ATM finder — real-world acceptance (production seed)", () => {
  it("the production rows: 394 OpenStreetMap entries and the verified Angk Ta Saom ABA ATM", () => {
    assert.equal(seed.length, 394)
    assert.deepEqual(
      verified.map((r) => [r.osm_ref, r.bank_code, r.type, r.name_en, r.latitude, r.longitude]),
      [["v-aba-angk-ta-saom", "ABA", "ATM", "ABA ATM - Angk Ta Saom", 11.0194192, 104.6741459]],
    )
  })

  it("Sihanoukville city (10.625, 103.523): real ABA and ACLEDA ATMs nearby", () => {
    const here = { lat: 10.625, lng: 103.523 }
    const aba = nearest(rows, here, { bank: "ABA", type: "CASH", radiusKm: 10, limit: 20 })
    const acleda = nearest(rows, here, { bank: "ACLEDA", radiusKm: 10, limit: 20 })
    assert.ok(aba.length >= 3, `ABA cash machines found: ${aba.length}`)
    assert.ok(aba[0].distance_km < 3, `nearest ABA ${aba[0].distance_km} km`)
    assert.ok(acleda.length >= 1, `ACLEDA found: ${acleda.length}`)
    assert.ok(acleda[0].distance_km < 3, `nearest ACLEDA ${acleda[0].distance_km} km`)
  })

  it("Angk Ta Saom / Tram Kak (11.026, 104.665): the ABA ATM on Route 3, with ACLEDA and Sathapana, all within 3 km", () => {
    const here = { lat: 11.026, lng: 104.665 }
    const found = nearest(rows, here, { radiusKm: 3, limit: 10 })
    const aba = found.find((r) => r.bank_code === "ABA")
    assert.ok(aba, "ABA within 3 km")
    assert.equal(aba.osm_ref, "v-aba-angk-ta-saom")
    assert.ok(aba.distance_km > 1 && aba.distance_km < 1.5, `ABA ${aba.distance_km} km`)
    assert.ok(found.some((r) => r.bank_code === "ACLEDA"))
    assert.ok(found.some((r) => r.bank_code === "SATHAPANA"))
    // The ABA filter finds it first (no "sparse data" hint needed for that answer's first line).
    assert.equal(nearest(rows, here, { bank: "ABA", radiusKm: 10 })[0].osm_ref, "v-aba-angk-ta-saom")
  })

  it("Google Maps fallback: the same point and the chosen bank", () => {
    assert.equal(googleMapsSearchUrl("ABA", 11.026, 104.665), "https://www.google.com/maps/search/ABA+ATM/@11.026000,104.665000,14z")
    assert.equal(googleMapsSearchUrl("ACLEDA", 10.625, 103.523), "https://www.google.com/maps/search/ACLEDA+ATM/@10.625000,103.523000,14z")
    assert.equal(googleMapsSearchUrl(null, 10.625, 103.523), "https://www.google.com/maps/search/ATM/@10.625000,103.523000,14z")
  })
})
