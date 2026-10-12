import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { allowedOrigins, deviceLabel, relyingParty } from "./passkey-rp"

describe("passkeys — only our own origins run a ceremony", () => {
  it("production: app.luychlat.com only (no localhost); extra https origins by PASSKEY_ORIGINS", () => {
    assert.deepEqual(allowedOrigins({ NODE_ENV: "production" }), ["https://app.luychlat.com"])
    assert.deepEqual(allowedOrigins({ NODE_ENV: "production", PASSKEY_ORIGINS: "https://luychlat.com, http://insecure.example, javascript:alert(1)" }), [
      "https://app.luychlat.com",
      "https://luychlat.com",
    ])
    assert.ok(allowedOrigins({ NODE_ENV: "development" }).includes("http://localhost:3000"))
  })
  it("the relying-party id is the origin's hostname; a foreign or missing origin gets nothing", () => {
    const allowed = allowedOrigins({ NODE_ENV: "production" })
    assert.deepEqual(relyingParty("https://app.luychlat.com", allowed), { origin: "https://app.luychlat.com", rpID: "app.luychlat.com" })
    assert.equal(relyingParty("https://evil.example", allowed), null)
    assert.equal(relyingParty("https://app.luychlat.com.evil.example", allowed), null)
    assert.equal(relyingParty(null, allowed), null)
  })
  it("a short device label for the Settings list", () => {
    assert.equal(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"), "iPhone")
    assert.equal(deviceLabel("Mozilla/5.0 (Linux; Android 15; Pixel 9)"), "Android")
    assert.equal(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"), "Windows")
    assert.equal(deviceLabel(null), "ឧបករណ៍")
  })
})
