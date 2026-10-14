import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { clearShownNotifications } from "./app-badge"

describe("app badge — the bell clears Android's notification bar", () => {
  it("closes every notification the service worker still shows, once the worker is ready", async () => {
    const closed: string[] = []
    const shown = ["bill", "sale"].map((id) => ({ close: () => void closed.push(id) }))
    const n = await clearShownNotifications({ serviceWorker: { ready: Promise.resolve({ getNotifications: async () => shown }) } })
    assert.equal(n, 2)
    assert.deepEqual(closed, ["bill", "sale"])
  })
  it("no service worker, or one that never becomes ready: nothing to close, never stuck", async () => {
    assert.equal(await clearShownNotifications({}), 0)
    const started = Date.now()
    assert.equal(await clearShownNotifications({ serviceWorker: { ready: new Promise(() => {}) } }), 0)
    assert.ok(Date.now() - started < 4_000)
  })
})
