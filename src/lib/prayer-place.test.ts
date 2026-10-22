import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { cambodiaNow, formatMinutes, inCambodia, placeNow, prayerTimes, prayerUtcOffset, PROVINCES } from "./prayer"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const MAKKAH = { lat: 21.42, lng: 39.83 }

describe("Prayer times follow the phone's GPS — at home and abroad (founder, 22/10/2026)", () => {
  it("at home (or a province): Cambodia time, as before", () => {
    assert.equal(prayerUtcOffset(null, 3), 7)
    assert.equal(prayerUtcOffset({ lat: 11.55, lng: 104.92 }, 3), 7) // in Phnom Penh, even with the phone on another zone
    assert.ok(PROVINCES.every((p) => inCambodia(p.lat, p.lng)))
    const now = new Date("2026-10-22T04:47:00Z")
    assert.deepEqual(placeNow(7, now), cambodiaNow(now))
  })
  it("Makkah (Hajj / Umrah): the phone's own zone — Dhuhr reads 12:xx local, not 16:xx Cambodia time; the same instant", () => {
    assert.equal(prayerUtcOffset(MAKKAH, 3), 3)
    assert.equal(prayerUtcOffset(MAKKAH, Number.NaN), 7)
    const local = prayerTimes({ year: 2026, month: 10, day: 22 }, MAKKAH.lat, MAKKAH.lng, 3)
    const kh = prayerTimes({ year: 2026, month: 10, day: 22 }, MAKKAH.lat, MAKKAH.lng, 7)
    assert.match(formatMinutes(local.dhuhr), /^12:/)
    assert.equal(kh.dhuhr - local.dhuhr, 4 * 60) // 4 hours apart on the clock = one moment
    // At the Makkah minute of Dhuhr, the place's clock says it is Dhuhr.
    const at = new Date(Date.UTC(2026, 9, 22) + (local.dhuhr - 3 * 60) * 60_000)
    assert.equal(placeNow(3, at).minutes, local.dhuhr)
  })
  it("half-hour zones (India 5.5) and the date across midnight", () => {
    const at = new Date("2026-10-22T20:00:00Z")
    assert.deepEqual(placeNow(5.5, at).date, { year: 2026, month: 10, day: 23 })
    assert.equal(placeNow(5.5, at).minutes, 90) // 01:30
  })
  it("wired: every prayer screen and the Adhan alert use the place's clock; the fix refreshes quietly; abroad pauses the server push and says so", () => {
    for (const f of ["src/app/(app)/islamic/prayer/page.tsx", "src/components/islamic/hub.tsx"]) {
      const s = read(f)
      assert.match(s, /const clock = placeNow\(location\.utcOffset, now\)/, f)
      assert.doesNotMatch(s, /cambodiaNow/, f)
    }
    assert.match(read("src/components/islamic/next-prayer-chip.tsx"), /prayerTimes\(\{ year, month, day \}, location\.lat, location\.lng, offset\)/)
    const alerts = read("src/components/islamic/prayer-alerts.tsx")
    assert.match(alerts, /const clock = placeNow\(location\.utcOffset\)\s+const times = prayerTimes\(clock\.date, location\.lat, location\.lng, location\.utcOffset\)/)
    assert.match(alerts, /useGpsRefresh\(\)/)
    const picker = read("src/components/islamic/location-picker.tsx")
    assert.match(picker, /if \(state !== "granted"\) return/) // never a permission prompt
    assert.match(picker, /if \(!pushPausedAbroad\) void setPrayerPush\(false\)/)
    assert.match(picker, /if \(pushPausedAbroad\) void setPrayerPush\(true\)/)
    assert.match(read("src/app/(app)/islamic/prayer/page.tsx"), /\{location\.abroad && <p[^>]*>\{t\("prayer\.abroadNote"\)\}<\/p>\}/)
    assert.match(read("src/stores/islamic-local-store.ts"), /\{ name: "luychlat-islamic-local" \}/) // the last fix kept on the phone
  })
})
