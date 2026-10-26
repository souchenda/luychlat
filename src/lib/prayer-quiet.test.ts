import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { prayerTimes } from "./prayer"
import { JUMUAH_QUIET_MINUTES, prayerQuietWindows } from "./prayer-quiet"
import { catchUpTotals, PRAYER_QUIET_KEY, quietSpanAt, readQuietSpans, writeQuietSpans } from "./soundbox"
import { catchUpItem, feedQuiet, inQuietSpan } from "./soundbox-feed"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")
const PP = { lat: 11.5564, lng: 104.9282, utcOffset: 7 }
const at = (iso: string) => Date.parse(iso)
const min = 60_000

describe("The SoundBox quiet during the prayer (founder, 26/10/2026 — Task #506)", () => {
  it("the five prayers of today and tomorrow, 15 minutes from each Adhan by default; 20 on request; anything else 15", () => {
    const w = prayerQuietWindows({ now: at("2026-10-26T03:00:00Z"), ...PP })
    assert.deepEqual(w.map((x) => x.prayer), ["fajr", "dhuhr", "asr", "maghrib", "isha", "fajr", "dhuhr", "asr", "maghrib", "isha"])
    const t = prayerTimes({ year: 2026, month: 10, day: 26 }, PP.lat, PP.lng, 7)
    const midnight = Date.UTC(2026, 9, 26) - 7 * 3_600_000
    assert.equal(w[1].from, midnight + Math.round(t.dhuhr * min)) // from the Adhan, as the prayer page computes it
    assert.ok(w.every((x) => x.to - x.from === 15 * min))
    assert.ok(prayerQuietWindows({ now: at("2026-10-26T03:00:00Z"), ...PP, minutes: 20 }).every((x) => x.to - x.from === 20 * min))
    assert.ok(prayerQuietWindows({ now: at("2026-10-26T03:00:00Z"), ...PP, minutes: 90 }).every((x) => x.to - x.from === 15 * min))
  })
  it("Friday's Dhuhr is the Jumu'ah: 40 minutes; the other prayers of Friday keep theirs", () => {
    const w = prayerQuietWindows({ now: at("2026-10-30T02:00:00Z"), ...PP }) // Friday 30/10, 09:00 in Phnom Penh
    const dhuhr = w.find((x) => x.prayer === "dhuhr")!
    assert.equal(dhuhr.jumuah, true)
    assert.equal(dhuhr.to - dhuhr.from, JUMUAH_QUIET_MINUTES * min)
    assert.equal(w.find((x) => x.prayer === "asr")!.to - w.find((x) => x.prayer === "asr")!.from, 15 * min)
    assert.equal(w.filter((x) => x.jumuah).length, 1) // Saturday's Dhuhr is not
  })
  it("the SoundBox reads plain spans only — written, read back, cleared; malformed ones dropped", () => {
    const m = new Map<string, string>()
    const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }
    writeQuietSpans(store, [{ from: 1000, to: 2000 }])
    assert.deepEqual(readQuietSpans(store), [{ from: 1000, to: 2000 }])
    assert.deepEqual([quietSpanAt(1500, readQuietSpans(store)), quietSpanAt(2000, readQuietSpans(store))], [{ from: 1000, to: 2000 }, null])
    writeQuietSpans(store, null)
    assert.equal(m.has(PRAYER_QUIET_KEY), false)
    m.set(PRAYER_QUIET_KEY, JSON.stringify([{ from: 5, to: 1 }, { from: "x" }, { from: 1, to: 9 }]))
    assert.deepEqual(readQuietSpans(store), [{ from: 1, to: 9 }])
    m.set(PRAYER_QUIET_KEY, "{oops")
    assert.deepEqual(readQuietSpans(store), [])
  })
  it("the catch-up totals: exact per currency (riel whole, dollars to the cent), riel first, the count kept", () => {
    assert.deepEqual(catchUpTotals([{ amount: 25.1, currency: "USD" }, { amount: 372_000, currency: "KHR" }, { amount: 4.2, currency: "USD" }, { amount: 548_000, currency: "KHR" }]), [
      { currency: "KHR", count: 2, amount: 920_000 },
      { currency: "USD", count: 2, amount: 29.3 },
    ])
    assert.deepEqual(catchUpTotals([]), [])
  })
  it("the native feed: nothing during a span; after it, one catch-up within 30 minutes, once; its sales never said alone", () => {
    const span = { from: at("2026-10-26T05:16:00Z"), to: at("2026-10-26T05:31:00Z") } // Dhuhr
    assert.deepEqual(feedQuiet(at("2026-10-26T05:20:00Z"), [span], null), { quiet: span, catchUp: null })
    assert.deepEqual(feedQuiet(at("2026-10-26T05:32:00Z"), [span], null), { quiet: null, catchUp: span })
    assert.deepEqual(feedQuiet(at("2026-10-26T05:32:00Z"), [span], span.to), { quiet: null, catchUp: null }) // already said
    assert.deepEqual(feedQuiet(at("2026-10-26T06:10:00Z"), [span], null), { quiet: null, catchUp: null }) // too late to catch up
    const rows = [
      { id: "a", amount: "372000", currency: "KHR", transaction_time: "2026-10-26T05:18:00Z", created_at: "2026-10-26T05:18:05Z" },
      { id: "b", amount: "5.50", currency: "USD", transaction_time: "2026-10-26T05:25:00Z", created_at: "2026-10-26T05:25:02Z" },
      { id: "c", amount: "1000", currency: "KHR", transaction_time: "2026-10-26T05:33:00Z", created_at: "2026-10-26T05:33:01Z" }, // after
    ]
    assert.deepEqual([inQuietSpan(rows[0].created_at, [span]), inQuietSpan(rows[2].created_at, [span])], [true, false])
    const item = catchUpItem(rows, span, 1, "https://app.luychlat.com")!
    assert.equal(item.id, `prayer-${span.to}`)
    const words = item.clips.map((u) => u.replace("https://app.luychlat.com/audio/soundbox/khmer/", "").replace(".mp3", ""))
    assert.deepEqual(words, ["received", "3", "saen", "7", "meun", "2", "poan", "riel", "received", "5", "dollar", "50", "cent"])
    assert.equal(catchUpItem([rows[2]], span, 1, "https://app.luychlat.com"), null) // nothing held: no catch-up
  })
  it("wired: the page holds and catches up, the app-wide voice stays silent, the server holds and catches up, opt-in per device", () => {
    const page = read("src/app/(app)/soundbox/page.tsx")
    assert.match(page, /const span = quietSpanAt\(Date\.now\(\), readQuietSpans\(store\(\)\)\)\n\s+if \(span\) \{\n\s+held\.current\.push\(added\)\n\s+catchUpAt\(span\)\n\s+return report\(\[document\.visibilityState, SILENCED_DURING_PRAYER\]\)/)
    assert.match(page, /for \(const t of totals\) await announce\(t,/)
    assert.match(page, /method: "PATCH", headers: \{ "Content-Type": "application\/json" \}, body: JSON\.stringify\(\{ device, spans: readQuietSpans\(store\(\)\) \}\)/)
    assert.doesNotMatch(page, /prayer-quiet|lib\/prayer"/) // the SoundBox never computes a prayer time
    assert.match(read("src/components/payments/payment-chime-listener.tsx"), /if \(quietSpanAt\(Date\.now\(\), readQuietSpans\(typeof window === "undefined" \? null : safeLocal\(\)\)\)\) return reportRing\(e, SILENCED_DURING_PRAYER\)/)
    const feed = read("src/app/api/soundbox/feed/route.ts")
    assert.match(feed, /if \(quiet\) return NextResponse\.json\(\{ ok: true, items: \[\], cursor: url\.searchParams\.get\("since"\) \?\? since \}/)
    assert.match(feed, /feedItems\(rows\.filter\(\(r\) => !inQuietSpan\(r\.created_at, spans\)\), now, speed, ORIGIN, voice\)/)
    assert.match(feed, /update\(\{ quiet_caught_to: new Date\(catchUp\.to\)\.toISOString\(\) \}\)/)
    const token = read("src/app/api/soundbox/feed/token/route.ts")
    assert.match(token, /s\.to > s\.from && s\.to - s\.from <= 60 \* 60_000\)\s+\.slice\(0, 20\)/)
    assert.match(token, /\.eq\("id", device\)\.eq\("user_id", auth\.user\.id\)/)
    const writer = read("src/components/islamic/soundbox-prayer-quiet.tsx")
    assert.match(writer, /const on = islamic && soundboxQuiet/) // Islamic Mode and this device's switch, both
    assert.match(read("src/stores/islamic-local-store.ts"), /soundboxQuiet: false,\n\s+soundboxQuietMinutes: 15,/) // off by default
  })
})
