import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { previousCycle, type FuelPrices } from "@/lib/market-calc"

import { shouldPublishToFacebook } from "./facebook-publisher"
import { fuelAnnouncementDue, newPricesText } from "./moc-fuel-sync"

const stored = (over: Partial<FuelPrices> = {}): FuelPrices => ({
  regular: 5050, super: null, diesel: 5550, lpg: null, lpg_unit: "kg", from: "2026-10-21", to: "2026-11-01", source: "moc", post: 36200, updated_at: "2026-10-21T06:25:09Z",
  previous: { regular: 5350, super: null, diesel: 5550, from: "2026-10-11", to: "2026-10-21", post: 35950 },
  ...over,
})

describe("fuel change announcement for prices stored by hand (founder, 21/10/2026 — notice #36200)", () => {
  it("storing a new cycle keeps the one before; a correction of the same cycle keeps its own «previous»", () => {
    const old = stored({ regular: 5350, from: "2026-10-11", to: "2026-10-21", post: 35950, previous: null })
    assert.deepEqual(previousCycle(old, { from: "2026-10-21" }), { regular: 5350, super: null, diesel: 5550, from: "2026-10-11", to: "2026-10-21", post: 35950 })
    assert.deepEqual(previousCycle(stored(), { from: "2026-10-21" }), stored().previous) // same cycle, corrected
    assert.equal(previousCycle(null, { from: "2026-10-21" }), null)
  })

  it("due once the Ministry's prices are in with the cycle before — this cycle only, never a manual entry or an old one", () => {
    assert.equal(fuelAnnouncementDue(stored(), "2026-10-21"), true)
    assert.equal(fuelAnnouncementDue(stored(), "2026-10-23"), true)
    assert.equal(fuelAnnouncementDue(stored(), "2026-10-24"), false) // three days into the cycle: too late to announce
    assert.equal(fuelAnnouncementDue(stored({ previous: null }), "2026-10-21"), false)
    assert.equal(fuelAnnouncementDue(stored({ source: "manual" }), "2026-10-21"), false)
    assert.equal(fuelAnnouncementDue(stored({ post: null }), "2026-10-21"), false)
    assert.equal(fuelAnnouncementDue(null, "2026-10-21"), false)
  })

  it("the #36200 card: EA92 5,050 ៛ ▼ 300, diesel 5,550 ៛ unchanged, 21 October – 1 November, the notice linked", () => {
    const f = stored()
    const text = newPricesText(f, f.previous!, 36200)
    assert.match(text, /^⛽ តម្លៃលក់រាយប្រេងឥន្ធនៈផ្លូវការ \(ក្រសួងពាណិជ្ជកម្ម\)/)
    assert.match(text, /សម្រាប់ថ្ងៃទី ២១ ខែតុលា ដល់ ០១ ខែវិច្ឆិកា ឆ្នាំ ២០២៦/)
    assert.match(text, /• សាំងធម្មតា \(EA92\) ៖ ៥,០៥០ ៛\/លីត្រ \(▼ ៣០០\)/)
    assert.match(text, /• ប្រេងម៉ាស៊ូត \(Diesel\) ៖ ៥,៥៥០ ៛\/លីត្រ\n/) // unchanged: no arrow
    assert.match(text, /t\.me\/mocnewsfeed\/36200/)
    // EA92 changed: the community channel and the Facebook Page (the curated rule), still preview-first.
    assert.equal(shouldPublishToFacebook({ kind: "fuel", now: f, previous: { regular: 5350, diesel: 5550 } }), true)
  })

  it("the migration stores the cycle before #36200, and the app schedules the card after a deploy and at each fuel check", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/20270242000000_fuel_previous_cycle.sql"), "utf8")
    assert.match(sql, /'regular', 5350, 'super', null, 'diesel', 5550, 'from', '2026-10-11', 'to', '2026-10-21', 'post', 35950/)
    assert.match(sql, /\(value -> 'fuel' ->> 'post'\)::bigint = 36200/)
    const sync = readFileSync(join(process.cwd(), "src/lib/server/market-sync.ts"), "utf8")
    assert.match(sync, /if \(!fuelAnnounceChecked\) \{\n\s+fuelAnnounceChecked = true\n\s+await announceAppliedFuel\(day\)/)
    assert.match(sync, /previous: previousCycle\(previous\?\.fuel, input\)/)
    const moc = readFileSync(join(process.cwd(), "src/lib/server/moc-fuel-sync.ts"), "utf8")
    assert.match(moc, /else if \(covered\) await announceAppliedFuel\(day\)/)
  })
})
