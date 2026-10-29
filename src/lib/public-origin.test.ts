import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { APP_ORIGIN, publicOrigin } from "./public-origin"

const h = (o: Record<string, string>) => new Headers(o)

describe("redirects go to the address people used, never the container's (29/10/2026 — reset link → 0.0.0.0:3000)", () => {
  it("the real host from nginx, https", () => {
    assert.equal(publicOrigin(h({ host: "app.luychlat.com", "x-forwarded-proto": "https" })), "https://app.luychlat.com")
    assert.equal(publicOrigin(h({ host: "app.luychlat.com" })), "https://app.luychlat.com")
    assert.equal(publicOrigin(h({ host: "luy.ibmserp.com", "x-forwarded-proto": "https" })), "https://luy.ibmserp.com")
  })
  it("the container's own address or a forged host → the app, never elsewhere", () => {
    assert.equal(publicOrigin(h({ host: "0.0.0.0:3000" })), APP_ORIGIN)
    assert.equal(publicOrigin(h({ host: "evil.example" })), APP_ORIGIN)
    assert.equal(publicOrigin(h({ host: "app.luychlat.com", "x-forwarded-host": "evil.example" })), APP_ORIGIN)
    assert.equal(publicOrigin(h({})), APP_ORIGIN)
  })
  it("local development stays on http://localhost", () => {
    assert.equal(publicOrigin(h({ host: "localhost:3000" })), "http://localhost:3000")
  })
  it("the auth callback uses it, not request.url's origin", () => {
    const src = readFileSync(join(process.cwd(), "src/app/auth/callback/route.ts"), "utf8")
    assert.match(src, /publicOrigin\(/)
    assert.doesNotMatch(src, /origin\s*\}\s*=\s*new URL\(request\.url\)/)
  })
})
