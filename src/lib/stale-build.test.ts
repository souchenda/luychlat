import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { STALE_HIDDEN_MS, shouldReloadForBuild } from "./stale-build"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")
const base = { running: "100", deployed: "200", hiddenMs: STALE_HIDDEN_MS, pathname: "/home", reloadedFor: null }

describe("Regression: the Maghrib Adhan from an app left open across the Task #525 deploy (Task #526)", () => {
  it("reloads once onto the new build when the app comes back on screen", () => {
    assert.equal(shouldReloadForBuild(base), true)
  })
  it("never reloads on the same build, or when either build is unknown", () => {
    assert.equal(shouldReloadForBuild({ ...base, deployed: "100" }), false)
    assert.equal(shouldReloadForBuild({ ...base, running: null }), false)
    assert.equal(shouldReloadForBuild({ ...base, deployed: undefined }), false)
  })
  it("never after a short glance away (a draft being typed survives)", () => {
    assert.equal(shouldReloadForBuild({ ...base, hiddenMs: STALE_HIDDEN_MS - 1 }), false)
  })
  it("never twice for the same build — no reload loop", () => {
    assert.equal(shouldReloadForBuild({ ...base, reloadedFor: "200" }), false)
    assert.equal(shouldReloadForBuild({ ...base, reloadedFor: "150" }), true)
  })
  it("never on the SoundBox — a reload would silence the sales alerts until the next tap", () => {
    assert.equal(shouldReloadForBuild({ ...base, pathname: "/soundbox" }), false)
    assert.equal(shouldReloadForBuild({ ...base, pathname: "/soundbox/setup" }), false)
  })
  it("is wired: one build id in the config, the health route and the app layout", () => {
    assert.match(read("next.config.ts"), /process\.env\.NEXT_PUBLIC_BUILD_ID \|\|= /)
    assert.match(read("src/app/api/health/route.ts"), /build: process\.env\.NEXT_PUBLIC_BUILD_ID/)
    assert.match(read("src/app/(app)/layout.tsx"), /<StaleBuildReload \/>/)
    assert.match(read("src/components/common/stale-build-reload.tsx"), /shouldReloadForBuild\(/)
  })
})
