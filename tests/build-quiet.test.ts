// Builds are not incidents (founder, 21/10/2026): every deploy raised «Alert: cpu» at 93–98% while the new version built.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { BUILD_MARKERS, buildActive, duringBuild, findIssues, LIMITS, type Sample } from "../src/lib/server/health-watchdog"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const hot = (): Sample => ({ cpu_pct: 97, ram_pct: 70, disk_pct: 30, app_mem_pct: 40, db_ms: 40, tg_ms: 100, pending_updates: 0 }) as unknown as Sample
const now = Date.parse("2026-10-21T09:00:00Z")

describe("watchdog — quiet about CPU and RAM while a build runs", () => {
  it("a build is running while its marker is under 90 minutes old; a crashed build's older marker is ignored", () => {
    assert.equal(buildActive([now - 5 * 60_000, null], now), true)
    assert.equal(buildActive([null, now - 30 * 60_000], now), true) // the APK build
    assert.equal(buildActive([null, null], now), false)
    assert.equal(buildActive([now - 91 * 60_000, null], now), false)
  })

  it("five minutes of build load raise nothing — and do not count towards an alert just after it", () => {
    const during = Array.from({ length: LIMITS.sustainedMinutes + 2 }, () => duringBuild(hot(), true))
    assert.deepEqual(findIssues(during), [])
    // The build ends: CPU still high for a minute or two is not yet «sustained».
    assert.deepEqual(findIssues([...during, hot(), hot()]), [])
    // Real load for 5 minutes after the build still alerts.
    assert.deepEqual(findIssues([...during, ...Array.from({ length: LIMITS.sustainedMinutes }, hot)]), ["cpu"])
  })

  it("everything else is watched during a build: a full disk still alerts", () => {
    const full = { ...hot(), disk_pct: 95 } as Sample
    assert.ok(findIssues([duringBuild(full, true)]).includes("disk"))
  })

  it("the deploy and the APK build write their marker into the mounted folder and remove it however they end", () => {
    assert.deepEqual(BUILD_MARKERS, ["/run/luysmart/building-deploy", "/run/luysmart/building-apk"])
    assert.match(read("docker-compose.yml"), /- \.\/deploy\/run:\/run\/luysmart:ro/)
    const update = read("deploy/update.sh")
    assert.match(update, /date \+%s > deploy\/run\/building-deploy\necho "→ Building/)
    assert.match(update, /notify_failure\(\) \{\n  local code=\$\?\n  rm -f deploy\/run\/building-deploy/)
    assert.match(update, /trap 'rm -f deploy\/run\/building-deploy' EXIT/)
    const apk = read("deploy/build-apk.sh")
    assert.match(apk, /date \+%s > "\$REPO\/deploy\/run\/building-apk"\ntrap 'rm -f "\$REPO\/deploy\/run\/building-apk"' EXIT/)
  })
})
