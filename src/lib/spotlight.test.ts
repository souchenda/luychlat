import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { SPOTLIGHT_BOT, SPOTLIGHT_CALL, SPOTLIGHT_HOOK, SPOTLIGHT_SITE, spotlightCaption, spotlightDue, spotlightHtml } from "./spotlight"

describe("weekly spotlight — schedule", () => {
  it("Saturday 17:00–18:29 Cambodia time only", () => {
    assert.equal(spotlightDue("2026-10-17", 16 * 60 + 59), false) // Saturday 16:59
    assert.equal(spotlightDue("2026-10-17", 17 * 60), true) // Saturday 17:00
    assert.equal(spotlightDue("2026-10-17", 18 * 60 + 29), true)
    assert.equal(spotlightDue("2026-10-17", 18 * 60 + 30), false)
    assert.equal(spotlightDue("2026-10-16", 17 * 60), false) // Friday
    assert.equal(spotlightDue("2026-10-18", 17 * 60), false) // Sunday
  })
})

describe("weekly spotlight — the message", () => {
  it("the founder's hook, three pillars, the call and both official links", () => {
    const c = spotlightCaption()
    assert.ok(c.startsWith(SPOTLIGHT_HOOK))
    assert.match(c, /🎙️ .+Telegram/)
    assert.match(c, /💎 .+Net Worth.+Fixed Deposit/)
    assert.match(c, /🛡️ .+K-Score.+KHQR/)
    assert.ok(c.includes(SPOTLIGHT_CALL))
    assert.ok(c.includes(SPOTLIGHT_BOT) && c.includes(SPOTLIGHT_SITE))
    assert.match(c, /#អេបលុយឆ្លាត #AppLuyChlat/)
    assert.doesNotMatch(c, /អែប|កម្មវិធី|&/)
  })
  it("the Telegram caption: the hook in bold, no hashtags, under the 1024-character photo caption limit", () => {
    const h = spotlightHtml()
    assert.ok(h.startsWith(`<b>${SPOTLIGHT_HOOK}</b>`))
    assert.doesNotMatch(h, /#/)
    assert.ok(h.length < 1024, String(h.length))
  })
})
