import assert from "node:assert/strict"
import { before, beforeEach, describe, it } from "node:test"

// A minimal localStorage for the browser-only helpers.
const store = new Map<string, string>()
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
}

let m: typeof import("./passkey")

describe("the login's Face ID button follows this device's passkey", () => {
  before(async () => {
    m = await import("./passkey")
  })
  beforeEach(() => store.clear())
  it("hidden on a device that never made a passkey", () => {
    assert.equal(m.hasLocalPasskey(), false)
  })
  it("shown once one is registered here (kept under luychlat_has_passkey)", () => {
    m.rememberPasskey("cred-A")
    assert.equal(m.hasLocalPasskey(), true)
    assert.deepEqual(JSON.parse(store.get(m.PASSKEY_FLAG)!), ["cred-A"])
  })
  it("removing this device's passkey hides it; removing another device's keeps it", () => {
    m.rememberPasskey("cred-A")
    m.forgetPasskey("cred-B")
    assert.equal(m.hasLocalPasskey(), true)
    m.forgetPasskey("cred-A")
    assert.equal(m.hasLocalPasskey(), false)
    assert.equal(store.has(m.PASSKEY_FLAG), false)
  })
  it("a broken stored value counts as none", () => {
    store.set(m.PASSKEY_FLAG, "{not json")
    assert.equal(m.hasLocalPasskey(), false)
  })
})
