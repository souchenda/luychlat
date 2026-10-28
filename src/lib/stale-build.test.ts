import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { STALE_HIDDEN_MS, isChunkError, shouldReloadForBuild, shouldReloadForChunk } from "./stale-build"

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

describe("Never stuck after an update: a page on the previous build that lost a code chunk (founder, 28/10/2026)", () => {
  const chunk = { message: "ChunkLoadError: Loading chunk 4821 failed.", running: "100", pathname: "/home", reloadedFor: null }
  it("recognises every browser's wording, and nothing else", () => {
    for (const m of [
      "ChunkLoadError: Loading chunk 4821 failed.",
      "Loading CSS chunk app-layout failed",
      "TypeError: Failed to fetch dynamically imported module: https://app.luychlat.com/_next/static/chunks/a.js",
      "TypeError: Importing a module script failed.",
      "TypeError: error loading dynamically imported module",
    ])
      assert.equal(isChunkError(m), true, m)
    for (const m of ["TypeError: Failed to fetch", "Cannot read properties of undefined", "", null, undefined]) assert.equal(isChunkError(m), false, String(m))
  })
  it("reloads once onto the live build — never twice for the same build, never on the SoundBox", () => {
    assert.equal(shouldReloadForChunk(chunk), true)
    assert.equal(shouldReloadForChunk({ ...chunk, reloadedFor: "100" }), false)
    assert.equal(shouldReloadForChunk({ ...chunk, reloadedFor: "99" }), true)
    assert.equal(shouldReloadForChunk({ ...chunk, pathname: "/soundbox" }), false)
    assert.equal(shouldReloadForChunk({ ...chunk, message: "TypeError: x is undefined" }), false)
  })
  it("is wired: the app listens for it, and the last safety net is a calm Khmer page, not «Application error»", () => {
    const hook = read("src/components/common/stale-build-reload.tsx")
    assert.match(hook, /window\.addEventListener\("error", onError\)/)
    assert.match(hook, /window\.addEventListener\("unhandledrejection", onRejection\)/)
    const page = read("src/app/global-error.tsx")
    assert.match(page, /shouldReloadForChunk\(/)
    assert.match(page, /អេប លុយឆ្លាត · App Luy Chlat/)
    assert.match(page, /ទិន្នន័យរបស់អ្នកមានសុវត្ថិភាព/)
  })
  it("the service worker keeps only real files — never a 404 chunk or the maintenance page as a page's offline copy", () => {
    const sw = read("public/sw.js")
    assert.equal((sw.match(/cache\.put\(request, copy\)/g) ?? []).length, 2)
    assert.equal((sw.match(/if \(res\.ok\) \{\n\s+const copy = res\.clone\(\)\n\s+caches\.open\(CACHE\)\.then\(\(cache\) => cache\.put\(request, copy\)\)/g) ?? []).length, 2)
    assert.match(sw, /const CACHE = "luysmart-v6"/)
  })
})
