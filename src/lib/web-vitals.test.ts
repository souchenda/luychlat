import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { deviceOf, formatVital, normalizeRoute, parseVital, ratingOf } from "./web-vitals"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")

describe("The app's real speed on members' phones (founder, 14/11/2026)", () => {
  it("the screen, never the record: ids and numbers removed, no query, a short route", () => {
    assert.equal(normalizeRoute("/debts/0b8c3c9e-4a51-4c1e-9d3f-2b6f9a3d1e7a?tab=paid"), "/debts/:id")
    assert.equal(normalizeRoute("/invoice/123/print"), "/invoice/:n/print")
    assert.equal(normalizeRoute("/wallets/"), "/wallets")
    assert.equal(normalizeRoute("/"), "/")
    assert.ok(normalizeRoute(`/${"x".repeat(200)}`).length <= 80)
  })
  it("the device kind: the Android app, a phone browser, or a computer", () => {
    assert.equal(deviceOf("Mozilla/5.0 (Linux; Android 10; TNN-AN00; wv) … LuyChlatApp/16"), "apk")
    assert.equal(deviceOf("Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) … Mobile/15E148 Safari/604.1"), "mobile")
    assert.equal(deviceOf("Mozilla/5.0 (Windows NT 10.0; Win64; x64) … Chrome/143.0"), "desktop")
  })
  it("only valid reports are kept — an unknown metric, a negative or absurd value, no route, a stray field: dropped", () => {
    assert.deepEqual(parseVital({ metric: "LCP", value: 2412.6, route: "/wallets/x", device: "apk" }), { metric: "LCP", value: 2413, route: "/wallets/x", device: "apk" })
    assert.deepEqual(parseVital({ metric: "CLS", value: 0.04567, route: "/", device: "mobile" }), { metric: "CLS", value: 0.046, route: "/", device: "mobile" })
    for (const bad of [{ metric: "FID", value: 1, route: "/", device: "apk" }, { metric: "LCP", value: -1, route: "/", device: "apk" }, { metric: "LCP", value: 999_999, route: "/", device: "apk" }, { metric: "LCP", value: 1, route: "wallets", device: "apk" }, { metric: "LCP", value: 1, route: "/", device: "tv" }, null])
      assert.equal(parseVital(bad), null)
    const kept = parseVital({ metric: "INP", value: 120, route: "/", device: "desktop", user: "chenda", amount: 5 })
    assert.deepEqual(Object.keys(kept!).sort(), ["device", "metric", "route", "value"]) // nothing about the person
  })
  it("Google's thresholds and how a value reads", () => {
    assert.deepEqual([ratingOf("LCP", 2500), ratingOf("LCP", 3000), ratingOf("LCP", 4100)], ["good", "needs-improvement", "poor"])
    assert.deepEqual([ratingOf("INP", 150), ratingOf("CLS", 0.3)], ["good", "poor"])
    assert.deepEqual([formatVital("LCP", 2412), formatVital("INP", 180), formatVital("CLS", 0.046)], ["2.4 s", "180 ms", "0.05"])
  })
  it("wired: every screen reports by beacon; signed-in only, rate-limited; stored without the person; read only by a super admin", () => {
    assert.match(read("src/app/(app)/layout.tsx"), /<WebVitalsReporter \/>/)
    assert.match(read("src/components/common/web-vitals-reporter.tsx"), /navigator\.sendBeacon\("\/api\/vitals"/)
    const route = read("src/app/api/vitals/route.ts")
    assert.match(route, /if \(!auth\.user\) return NextResponse\.json\(\{ ok: false \}, \{ status: 401 \}\)/)
    assert.match(route, /guardRequest\(request, \{ name: "vitals", limit: 30/)
    assert.match(route, /\.slice\(0, 5\)\.map\(parseVital\)/)
    const sql = read("supabase/migrations/20270308000000_web_vitals.sql")
    assert.doesNotMatch(sql, /user_id|workspace_id/)
    assert.match(sql, /revoke all on public\.web_vitals from public, anon, authenticated;/)
    assert.match(sql, /perform public\.require_super_admin\(\);/)
    assert.match(read("src/app/(app)/admin/super/page.tsx"), /<WebVitalsCard \/>/)
  })
})
