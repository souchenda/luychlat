import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { geocodedLabel, kmBetween, nearestPlace, NEAR_KM, type KnownPlace } from "./place-name"

describe("«My location» by name (founder, 29/10/2026 — «show កួរស្រូវ, like my Samsung»)", () => {
  it("the phone's geocoder: the two most precise distinct names, numbers and plus codes skipped", () => {
    // The founder's phone: the area «កួរស្រូវ», the sangkat «រលួស», the khan «ដង្កោ».
    assert.equal(geocodedLabel({ subLocality: "កួរស្រូវ", locality: "សង្កាត់រលួស", subAdminArea: "ខណ្ឌដង្កោ", adminArea: "ភ្នំពេញ" }), "កួរស្រូវ · សង្កាត់រលួស")
    assert.equal(geocodedLabel({ feature: "7P8R+2C", locality: "រលួស", subAdminArea: "ខណ្ឌដង្កោ" }), "រលួស · ខណ្ឌដង្កោ")
    assert.equal(geocodedLabel({ feature: "12", locality: "សង្កាត់រលួស", subAdminArea: "រលួស" }), "សង្កាត់រលួស") // said once
    assert.equal(geocodedLabel({ adminArea: "ភ្នំពេញ" }), "ភ្នំពេញ")
    assert.equal(geocodedLabel({}), null)
  })
  it("a browser or an iPhone: the nearest named place within 2 km, in the reader's language — none farther", () => {
    const places: KnownPlace[] = [
      [11.48708, 104.89735, "ភូមិកណ្ដាល", "Phum Kandal"],
      [11.5, 104.95, "ភូមិឆ្ងាយ", "Phum Chhngay"],
    ]
    assert.equal(nearestPlace(11.488, 104.896, places, "km")?.name, "ភូមិកណ្ដាល")
    assert.equal(nearestPlace(11.488, 104.896, places, "en")?.name, "Phum Kandal")
    assert.equal(nearestPlace(11.3, 104.6, places, "km"), null)
    assert.equal(NEAR_KM, 2)
    assert.ok(Math.abs(kmBetween(11.5, 104.9, 11.51, 104.9) - 1.11) < 0.01)
  })
  it("the place list ships with the app — OpenStreetMap's, credited; the GPS fix is never sent anywhere", () => {
    const file = join(process.cwd(), "public/data/kh-places.json")
    if (existsSync(file)) {
      const d = JSON.parse(readFileSync(file, "utf8")) as { source: string; places: KnownPlace[] }
      assert.match(d.source, /OpenStreetMap/)
      assert.ok(d.places.length > 1500)
      assert.ok(d.places.some((p) => p[2] === "ភូមិកណ្ដាល"))
    }
    const bridge = readFileSync(join(process.cwd(), "src/lib/native-place.ts"), "utf8")
    assert.doesNotMatch(bridge, /fetch\([^)]*api/) // no server call with the fix
  })
})
