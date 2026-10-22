import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { networkPlace } from "./network-place"
import { PROVINCES } from "./prayer"

const h = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null })
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

describe("Prayer place without GPS — the network's province (founder, 22/10/2026)", () => {
  it("Cloudflare's place inside Cambodia → the nearest province", () => {
    assert.deepEqual(networkPlace(h({ "cf-ipcountry": "KH", "cf-iplatitude": "11.55", "cf-iplongitude": "104.92" }), PROVINCES), { province: "phnom_penh", country: "KH", source: "network" })
    assert.equal(networkPlace(h({ "cf-ipcountry": "KH", "cf-iplatitude": "13.09", "cf-iplongitude": "103.20" }), PROVINCES).province, "battambang")
  })
  it("never a silent guess: abroad, no place, or a place outside Cambodia → null (the last province chosen stays)", () => {
    assert.deepEqual(networkPlace(h({ "cf-ipcountry": "TH", "cf-iplatitude": "13.75", "cf-iplongitude": "100.5" }), PROVINCES), { province: null, country: "TH", source: "none", reason: "abroad" })
    assert.deepEqual(networkPlace(h({ "cf-ipcountry": "KH" }), PROVINCES), { province: null, country: "KH", source: "none", reason: "unknown" }) // the country only
    assert.equal(networkPlace(h({}), PROVINCES).province, null)
    assert.equal(networkPlace(h({ "cf-iplatitude": "35.6", "cf-iplongitude": "139.7" }), PROVINCES).province, null) // Tokyo, no country header
    assert.equal(networkPlace(h({ "cf-ipcountry": "KH", "cf-iplatitude": "abc", "cf-iplongitude": "104.9" }), PROVINCES).province, null)
  })
  it("wired: GPS refused or missing → /api/geo, said to be approximate; no blocking dialog; the APK declares the location permission", () => {
    const picker = read("src/components/islamic/location-picker.tsx")
    assert.match(picker, /const province = await networkProvince\(\)/)
    assert.match(picker, /toast\.success\(t\("prayer\.networkSet"/)
    assert.match(picker, /toast\.error\(t\("prayer\.networkNone"/)
    assert.doesNotMatch(picker, /else if \(result\.reason === "denied"\) setHelp\(true\)/) // the help sheet only on a tap
    assert.match(read("src/app/api/geo/route.ts"), /networkPlace\(req\.headers, PROVINCES\)[\s\S]*no-store/)
    const manifest = read("android/app/src/main/AndroidManifest.xml")
    assert.match(manifest, /android\.permission\.ACCESS_FINE_LOCATION/)
    assert.match(manifest, /android\.permission\.ACCESS_COARSE_LOCATION/)
    assert.match(manifest, /android\.hardware\.location\.gps" android:required="false"/)
    assert.ok(read("src/lib/i18n/dictionaries.ts").includes('"prayer.networkSet": "ទីតាំងប្រហែលតាមបណ្តាញ៖ {place}'))
  })
})
