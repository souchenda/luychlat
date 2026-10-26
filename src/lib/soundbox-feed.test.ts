import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { feedCursor, feedItems, feedSince, feedSpeed } from "./soundbox-feed"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const native = !existsSync(join(process.cwd(), "android")) && "android/ is not in the build context"
const ORIGIN = "https://app.luychlat.com"

describe("The SoundBox announced by the phone itself (founder, 24/10/2026 — Task #487)", () => {
  const now = Date.parse("2026-10-24T02:46:00Z") // 09:46 Cambodia
  const sale = { id: "698d22e5-9760-4339-ba43-b78895d860a3", amount: "4893000.00", currency: "KHR", transaction_time: "2026-10-24T02:45:50Z", created_at: "2026-10-24T02:45:53Z" }

  it("the 09:45 sale: its clips at the page's speed — «received 4 lean 8 saen 9 meun 3 poan riel»", () => {
    const [item] = feedItems([sale], now, 1.2, ORIGIN)
    assert.equal(item.id, sale.id)
    assert.deepEqual(item.clips.map((u) => u.replace(`${ORIGIN}/audio/soundbox/khmer/x1.2/`, "").replace(".mp3", "")), ["received", "4", "lean", "8", "saen", "9", "meun", "3", "poan", "riel"])
  })

  it("the page's rules: never a late push, never a sale over 5 min old, never a non-sale; the cursor moves past all of them", () => {
    const late = { ...sale, id: "a", transaction_time: "2026-10-24T02:20:00Z" } // the bank's time 25 min before
    const stale = { ...sale, id: "b", created_at: "2026-10-24T02:30:00Z" }
    const zero = { ...sale, id: "c", amount: "0" }
    const odd = { ...sale, id: "d", currency: "THB" }
    assert.deepEqual(feedItems([late, stale, zero, odd, sale], now, 1, ORIGIN).map((i) => i.id), [sale.id])
    assert.equal(feedCursor([stale, sale], "x"), sale.created_at)
    assert.equal(feedCursor([], "2026-10-24T02:45:00.000Z"), "2026-10-24T02:45:00.000Z")
  })

  it("never asks further back than 5 minutes; the speed is one of the three", () => {
    assert.equal(feedSince("2026-10-24T01:00:00Z", now), new Date(now - 5 * 60_000).toISOString())
    assert.equal(feedSince("2026-10-24T02:45:00.000Z", now), "2026-10-24T02:45:00.000Z")
    assert.equal(feedSince("garbage", now), new Date(now - 5 * 60_000).toISOString())
    assert.deepEqual([feedSpeed("1"), feedSpeed("1.3"), feedSpeed("9"), feedSpeed(null)], [1, 1.3, 1.2, 1.2])
  })

  it("the server: the device token checked against its SHA-256 in constant time; only the device's own workspace", () => {
    const feed = read("src/app/api/soundbox/feed/route.ts")
    assert.match(feed, /timingSafeEqual\(a, b\)/)
    assert.match(feed, /\.eq\("workspace_id", device\.workspace_id\)/)
    assert.match(feed, /log: `native \$\{log\}`/)
    const token = read("src/app/api/soundbox/feed/token/route.ts")
    assert.match(token, /randomBytes\(24\)\.toString\("hex"\)/)
    assert.match(token, /\.update\(\{ native_token_hash: tokenHash\(token\) \}\)\s+\.eq\("id", device\)\s+\.eq\("user_id", user\.id\)/)
    assert.match(token, /\.update\(\{ native_token_hash: null \}\)/) // revoked when the SoundBox goes off
    assert.doesNotMatch(feed + token, /export (const|function) tokenHash/) // a route file exports only its handlers
    const sql = read("supabase/migrations/20270253000000_soundbox_native_feed.sql")
    assert.match(sql, /revoke select on public\.soundbox_devices from authenticated/) // the hash never readable by members
  })

  it("never twice: while the phone announces, the page and the app-wide voice stay quiet; the app-wide voice reports every sale", () => {
    const page = read("src/app/(app)/soundbox/page.tsx")
    assert.match(page, /if \(nativeFeedActive\(\)\) return report\(\[document\.visibilityState, "native-feed"\]\)/)
    assert.match(page, /startNativeFeed\(\{ device, token: r\.token, speed: String\(readVoiceSpeed\(store\(\)\)\), voice: readVoiceGender\(store\(\)\) \}\)/)
    assert.match(page, /stopNativeFeed\(\)\s+void fetch\("\/api\/soundbox\/feed\/token", \{ method: "DELETE"/)
    const l = read("src/components/payments/payment-chime-listener.tsx")
    assert.match(l, /if \(nativeFeedActive\(\)\) return reportRing\(e, "native-feed"\)/)
    assert.match(l, /reportRing\(e, shown \? "chime" : "hidden-tab \(no sound: the app's tab is not on screen\)"\)/)
  })

  it("the Android side: the feed in the foreground service — every 4 s, the chime and the clips through MediaPlayer, the phone's quiet first", { skip: native }, () => {
    const f = read("android/app/src/main/java/com/luychlat/app/SoundboxFeed.java")
    assert.match(f, /private static final long POLL_MS = 4_000;/)
    assert.match(f, /if \("silent"\.equals\(phone\)\) \{\s+log = "phone:silent";/)
    assert.match(f, /R\.raw\.payment_received/)
    assert.match(f, /\.setUsage\(AudioAttributes\.USAGE_MEDIA\)/) // the media volume, like the page's «សាកស្ដាប់» (Task #492)
    assert.match(f, /if \(url == null \|\| !url\.startsWith\("https:\/\/app\.luychlat\.com\/"\)\) return null;/)
    assert.match(read("android/app/src/main/java/com/luychlat/app/SoundboxKeepAliveService.java"), /\.putString\("feedUrl", intent\.getStringExtra\("feedUrl"\)\)[\s\S]+?feed = savedFeed\(\);/)
    assert.match(read("android/app/src/main/java/com/luychlat/app/SoundboxKeepAlivePlugin.java"), /public void startFeed\(PluginCall call\)/)
  })

  it("Task #492: a sound counts only when it ended without an error; the volume and the watchdog in every report; the token never in the URL", { skip: native }, () => {
    const f = read("android/app/src/main/java/com/luychlat/app/SoundboxFeed.java")
    assert.match(f, /return ended\.await\(15, TimeUnit\.SECONDS\) && !failed\.get\(\);/)
    assert.match(f, /log \+= " vol:" \+ volume\(\) \+ " wd:" \+ SoundboxKeepAliveService\.watchdogRestarts;/)
    assert.match(f, /String url = feedUrl \+ "\?d=" \+ enc\(device\) \+ "&since="/)
    assert.doesNotMatch(f, /"&t="/)
    assert.match(f, /conn\.setRequestProperty\("X-Soundbox-Token", token\);[\s\S]+conn\.setRequestProperty\("X-Soundbox-Token", token\);/) // the poll and the report
    assert.match(f, /lastOkAt = System\.currentTimeMillis\(\);/)
  })

  it("Task #492: the wake lock held until the SoundBox is off; a restarted service resumes the feed; a 30 s watchdog", { skip: native }, () => {
    const s = read("android/app/src/main/java/com/luychlat/app/SoundboxKeepAliveService.java")
    assert.match(s, /if \(wakeLock != null && !wakeLock\.isHeld\(\)\) wakeLock\.acquire\(\);/)
    assert.doesNotMatch(s, /WAKE_LOCK_MS|acquire\(\w+_MS\)/) // never on a timer
    assert.match(s, /private static final long SILENT_MS = 30_000;/)
    assert.match(s, /if \(f != null && \(!f\.alive\(\) \|\| System\.currentTimeMillis\(\) - f\.lastOkAt\(\) > SILENT_MS\)\) \{\s+holdWakeLock\(\);/)
    assert.match(s, /\} else if \(intent == null && feed == null\) \{[\s\S]+?feed = savedFeed\(\);/)
    assert.match(s, /\} else if \(ACTION_FEED_STOP\.equals\(action\)\) \{\s+prefs\(\)\.edit\(\)\.clear\(\)\.apply\(\);/) // off = forgotten
    assert.match(s, /handler\.removeCallbacks\(watchdog\);\s+if \(feed != null\) feed\.stop\(\);/) // onDestroy
    const m = read("android/app/src/main/AndroidManifest.xml")
    assert.match(m, /android:foregroundServiceType="specialUse"/)
    assert.match(m, /android\.permission\.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS/)
  })

  it("Task #492: the server reads the token from the X-Soundbox-Token header (1.10+), the query / body only for 1.9", () => {
    const feed = read("src/app/api/soundbox/feed/route.ts")
    assert.match(feed, /request\.headers\.get\("x-soundbox-token"\) \?\? url\.searchParams\.get\("t"\)/)
    assert.match(feed, /request\.headers\.get\("x-soundbox-token"\) \?\? \(typeof body\?\.t === "string" \? body\.t : null\)/)
  })
})

describe("The sale push strictly per device (founder, 24/10/2026 — Task #493: every sale rang all 9 of the founder's devices)", () => {
  it("a SoundBox on here, for any workspace — read from this device's own switches only", async () => {
    const { soundboxOnHere } = await import("./soundbox")
    const store = (o: Record<string, string>) => ({ length: Object.keys(o).length, key: (i: number) => Object.keys(o)[i] ?? null, getItem: (k: string) => o[k] ?? null })
    assert.equal(soundboxOnHere(store({ soundbox_enabled_a: "0", other: "1" })), false)
    assert.equal(soundboxOnHere(store({ soundbox_enabled_a: "0", soundbox_enabled_b: "1" })), true)
    assert.equal(soundboxOnHere(null), false)
  })

  it("the server pushes a sale only to subscriptions their own device switched on; off by default, every row reset", () => {
    const sql = read("supabase/migrations/20270255000000_sale_push_per_device.sql")
    assert.match(sql, /add column if not exists sale_alerts boolean not null default false;/)
    assert.match(sql, /update public\.push_subscriptions set sale_alerts = false where sale_alerts;/)
    assert.match(sql, /where s\.sale_alerts\s+and \(/)
    assert.match(sql, /update public\.push_subscriptions set sale_alerts = p_on where endpoint = p_endpoint and user_id = \(select auth\.uid\(\)\)/)
  })

  it("each device sets its own row: the chime or a SoundBox on here — at launch, at every switch, on a new subscription", () => {
    const l = read("src/components/payments/payment-chime-listener.tsx")
    assert.match(l, /void setSalePush\(usePrefsStore\.getState\(\)\.paymentChime \|\| soundboxOnHere\(local\)\)/)
    assert.match(l, /window\.addEventListener\(SOUNDBOX_SWITCH_EVENT, sync\)/)
    assert.match(read("src/app/(app)/soundbox/page.tsx"), /writeSoundboxEnabled\(store\(\), counterId, on\)\s+window\.dispatchEvent\(new Event\(SOUNDBOX_SWITCH_EVENT\)\)/)
    assert.match(read("src/lib/push.ts"), /window\.dispatchEvent\(new Event\(SOUNDBOX_SWITCH_EVENT\)\)\s+return "on"/)
  })
})
