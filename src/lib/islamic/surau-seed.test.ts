import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

describe("Prayer rooms in malls and airports (founder, 19/10/2026)", () => {
  const sql = read("supabase/migrations/20270184000000_surau_prayer_rooms_seed.sql")
  const rows = [...sql.matchAll(/\('SURAU', '([^']+)', '([^']+)',\s*'([^']+)', ([\d.]+), ([\d.]+),/g)].map((m) => ({ name: m[1], province: m[2], lat: Number(m[4]), lng: Number(m[5]) }))

  it("five prayer rooms under ស៊ូរ៉ាវ, listed at once, never removed by the weekly OpenStreetMap refresh", () => {
    assert.equal(rows.length, 5)
    assert.match(sql, /select v\.kind, v\.name, v\.province, v\.address, v\.lat, v\.lng, v\.note, true, 'community', null/)
    // The refresh deletes only its own rows (source = 'osm').
    assert.match(read("supabase/migrations/20270180000000_islamic_places_osm.sql"), /where p\.source = 'osm'\s+and p\.osm_ref not in/)
    assert.match(sql, /where not exists \(select 1 from public\.islamic_places p where p\.name = v\.name\)/) // once
  })

  it("each where OpenStreetMap puts the mall / airport, inside Cambodia; no closed airport", () => {
    for (const r of rows) {
      assert.ok(r.lat > 10 && r.lat < 14.7 && r.lng > 102.3 && r.lng < 107.7, r.name)
      assert.ok(["ភ្នំពេញ", "កណ្ដាល", "សៀមរាប"].includes(r.province), r.name)
    }
    const aeon3 = rows.find((r) => r.name.includes("Mean Chey"))!
    assert.deepEqual([aeon3.lat, aeon3.lng], [11.4834, 104.9177])
    assert.ok(!rows.some((r) => /ពោធិ៍ចិនតុង|Pochentong/.test(r.name)))
  })
})
