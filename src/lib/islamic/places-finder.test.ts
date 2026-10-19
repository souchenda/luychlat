import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { dictionaries } from "@/lib/i18n/dictionaries"

const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8")

describe("Islamic places finder — ATM-style, pre-loaded, Khmer (founder, 19/10/2026)", () => {
  it("a map never paints over a sheet (the double zoom controls over the suggestion form)", () => {
    assert.match(read("src/components/islamic/osm-map-impl.tsx"), /style=\{\{ isolation: "isolate" \}\}/)
    assert.match(read("src/components/islamic/osm-map-impl.tsx"), /return \(\) => \{[\s\S]*?m\.remove\(\)/) // destroyed on unmount
  })
  it("the finder: pins at once, the four chips, «near me», directions — always in Khmer", () => {
    const page = read("src/app/(app)/islamic/places/page.tsx")
    assert.match(page, /const t = useKhmerT\(\)/)
    assert.match(page, /locateDevice\(\)/)
    assert.match(page, /directionsUrl\(p\.lat, p\.lng\)/)
    assert.doesNotMatch(page, /PlaceFormSheet/)
    const km = dictionaries.km
    assert.deepEqual(["ALL", "MOSQUE", "SURAU", "HALAL"].map((k) => km[`finder.chip.${k}` as keyof typeof km]), ["ទាំងអស់", "🕌 វិហារឥស្លាម", "🕋 ស៊ូរ៉ាវ", "🥩 សាច់/អាហារហាឡាល់"])
    assert.equal(km["finder.nearMe"], "📍 យកទីតាំងក្បែរខ្ញុំ")
    assert.equal(km["finder.directions"], "🧭 នាំផ្លូវ (Google Maps)")
  })
  it("the suggestion: one fixed-height map, the position from the phone, the founder's Khmer words", () => {
    const sheet = read("src/components/islamic/suggest-place-sheet.tsx")
    assert.match(sheet, /const t = useKhmerT\(\)/)
    assert.equal((sheet.match(/<OsmMap/g) ?? []).length, 1)
    assert.match(sheet, /className="isolate h-56 overflow-hidden rounded-xl border"/)
    assert.match(sheet, /void locate\(\)/) // on opening
    const km = dictionaries.km
    assert.equal(km["suggest.title"], "ស្នើសុំបន្ថែមទីតាំង (វិហារ / ស៊ូរ៉ាវ / ហាងហាឡាល់)")
    assert.equal(km["suggest.name"], "ឈ្មោះទីតាំង")
    assert.equal(km["suggest.namePlaceholder"], "ឧ. ម៉ាស្ជិទ អាល់ស៊ើរកាល់")
    assert.equal(km["suggest.province"], "រាជធានី-ខេត្ត")
    assert.equal(km["suggest.gps"], "📍 យកទីតាំងបច្ចុប្បន្នរបស់ខ្ញុំ")
    assert.equal(km["suggest.submit"], "📍 ផ្ញើទីតាំងសុំការអនុម័ត")
  })
  it("seeded on the first tick after the deploy, refreshed every Sunday; a short answer changes nothing", () => {
    const sync = read("src/lib/server/islamic-places-sync.ts")
    assert.match(sync, /p_job: "islamic-places-seed"/)
    assert.match(read("src/lib/server/bot-dispatch.ts"), /await islamicPlacesSyncTick\(\)/)
    const sql = read("supabase/migrations/20270180000000_islamic_places_osm.sql")
    assert.match(sql, /if n < 40 then/)
    assert.doesNotMatch(sql, /halal_certified = /) // OpenStreetMap never certifies halal
  })
})
