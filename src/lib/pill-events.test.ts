import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { upcomingNationalDays } from "@/lib/calendar/cambodia-holidays"
import { nextHolyDay } from "@/lib/khmer-lunar"

import { nearestEvents, nextTurn, PILL_ROTATE_MS, type PillEvent } from "./pill-events"

const ev = (id: string, daysAway: number, kind: PillEvent["kind"]): PillEvent => ({ id, daysAway, kind, text: id })

describe("the home pill: every event on the nearest date takes its turn (founder, 22/10/2026 — Task #456)", () => {
  it("one event: alone (static); two on the same date: both — the national day first, then the Khmer-Chinese day, then the Sil day", () => {
    assert.deepEqual(nearestEvents([ev("paris", 1, "national"), ev("chenh-vassa", 4, "holy")]).map((e) => e.id), ["paris"])
    assert.deepEqual(nearestEvents([ev("sil", 0, "holy"), ev("dongzhi", 0, "cultural"), ev("paris", 0, "national")]).map((e) => e.id), ["paris", "dongzhi", "sil"])
    assert.deepEqual(nearestEvents([ev("a", 2, "national"), ev("a", 2, "national")]).map((e) => e.id), ["a"]) // never twice
    // Only the lunar day, no event date known: it is still shown.
    assert.deepEqual(nearestEvents([ev("holy", Number.POSITIVE_INFINITY, "holy")]).map((e) => e.id), ["holy"])
  })
  it("every 4 seconds, round and round", () => {
    assert.equal(PILL_ROTATE_MS, 4000)
    assert.deepEqual([nextTurn(0, 2), nextTurn(1, 2), nextTurn(2, 3), nextTurn(0, 0)], [1, 0, 0, 0])
  })
  it("a real coincidence: a national day on a Sil day in the next two years — both are kept", () => {
    let found: string | null = null
    for (let i = 0; i < 730 && !found; i++) {
      const d = new Date(Date.UTC(2026, 9, 22 + i)).toISOString().slice(0, 10)
      const n = upcomingNationalDays(d, 0)
      const holy = nextHolyDay(d)
      if (n.length && holy?.daysAway === 0) {
        const items = nearestEvents([...n.map((x) => ev(`national:${x.day.key}`, 0, "national")), ev("holy", 0, "holy")])
        assert.equal(items.length >= 2, true, d)
        assert.equal(items[0].kind, "national")
        found = d
      }
    }
    assert.ok(found, "a national day falls on a Sil day within two years")
  })
  it("wired: one cell for all (no jump), a soft fade, paused while held / hovered / focused, Kan Ben still alone", () => {
    const pill = readFileSync(join(process.cwd(), "src/components/dashboard/lunar-pill.tsx"), "utf8")
    assert.match(pill, /<span className="grid min-w-0"/)
    assert.match(pill, /"col-start-1 row-start-1 flex min-w-0 items-center gap-1\.5 transition-opacity duration-500 motion-reduce:transition-none", on \? "opacity-100" : "opacity-0"/)
    assert.match(pill, /if \(count < 2 \|\| held\) return\s*const id = window\.setInterval\(\(\) => setTurn\(\(i\) => nextTurn\(i, count\)\), PILL_ROTATE_MS\)/)
    assert.match(pill, /onTouchStart: hold\(true\), onTouchEnd: hold\(false\)/)
    assert.match(pill, /onMouseEnter: hold\(true\), onMouseLeave: hold\(false\)/)
    assert.match(pill, /aria-hidden=\{!on\}/) // a screen reader hears the one on turn
    assert.match(pill, /if \(ben === 0\) return \[\{ id: "ben"/)
  })
})
