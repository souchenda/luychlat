import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { isEvHome, kwhOf, parseAmountText } from "./parse-entry"

describe("a photo captioned with home charging", () => {
  it("«សាកឡាននៅផ្ទះ 56.9kwh» is a home charge of 56.9 kWh (logged, never read as a slip)", () => {
    assert.equal(isEvHome("សាកឡាននៅផ្ទះ 56.9kwh"), true)
    assert.equal(kwhOf("សាកឡាននៅផ្ទះ 56.9kwh"), 56.9)
  })
  it("the charger's own spelling: 56.9 kW·h", () => {
    assert.equal(kwhOf("សាកឡាននៅផ្ទះ 56.9 kW·h"), 56.9)
  })
  it("a caption that is an ordinary entry falls back to the typed-entry path", () => {
    assert.ok(parseAmountText("កាហ្វេ 2$"))
    assert.equal(isEvHome("កាហ្វេ 2$"), false)
  })
})
