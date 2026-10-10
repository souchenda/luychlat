/**
 * Real-world acceptance tests for the ATM finder, against the REAL bank_atms seed (OpenStreetMap,
 * supabase/migrations/20270133000000_bank_atms.sql) — no invented entries.
 *
 * Angk Ta Saom (Tram Kak, Takeo, Route 3): the real ABA ATM there is not in any data we may use
 * (OpenStreetMap doesn't map it; ababank.com sits behind a bot challenge and ACLEDA's robots.txt
 * disallows its ATM pages). It stays a `todo` — never a hand-placed coordinate — until an official
 * bank dataset or a user-verified report adds it; Google Maps is the fallback meanwhile.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import { googleMapsSearchUrl, nearest, nearestText, SPARSE_HINT, type BankAtm } from "../src/lib/atm"

/** The seed rows, read straight from the migration that put them in production. */
function seedRows(): BankAtm[] {
  const sql = readFileSync(new URL("../supabase/migrations/20270133000000_bank_atms.sql", import.meta.url), "utf8")
  const str = "('(?:[^']|'')*'|null)"
  const row = new RegExp(`^\\s*\\(${str}, ${str}, ${str}, ${str}, ${str}, ${str}, ${str}, ${str}, (-?[\\d.]+), (-?[\\d.]+), (array\\[[^\\]]*\\]|null), (true|false)\\),?$`, "gm")
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

const rows = seedRows()

describe("ATM finder — real-world acceptance (production seed)", () => {
  it("the seed is the production one (394 real OpenStreetMap entries)", () => {
    assert.equal(rows.length, 394)
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

  it("Angk Ta Saom / Tram Kak (11.026, 104.665): what the real data has — ACLEDA and Sathapana — and the Google Maps hint", () => {
    const here = { lat: 11.026, lng: 104.665 }
    const found = nearest(rows, here, { radiusKm: 10, limit: 10 })
    assert.ok(found.some((r) => r.bank_code === "ACLEDA"))
    assert.ok(found.some((r) => r.bank_code === "SATHAPANA"))
    // Sparse data: the answer points to Google Maps, which shows every ATM there (the ABA one too).
    assert.ok(nearestText(nearest(rows, here, { bank: "ABA", radiusKm: 10 }), (s) => s).includes(SPARSE_HINT))
  })

  it.todo("Angk Ta Saom: the ABA ATM on Route 3 within 10 km — needs an official ABA dataset or a user-verified report (not in OpenStreetMap)")

  it("Google Maps fallback: the same point and the chosen bank", () => {
    assert.equal(googleMapsSearchUrl("ABA", 11.026, 104.665), "https://www.google.com/maps/search/ABA+ATM/@11.026000,104.665000,14z")
    assert.equal(googleMapsSearchUrl("ACLEDA", 10.625, 103.523), "https://www.google.com/maps/search/ACLEDA+ATM/@10.625000,103.523000,14z")
    assert.equal(googleMapsSearchUrl(null, 10.625, 103.523), "https://www.google.com/maps/search/ATM/@10.625000,103.523000,14z")
  })
})
