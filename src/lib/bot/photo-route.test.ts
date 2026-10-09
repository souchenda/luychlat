import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { isEvUsage, photoRoute } from "./photo-route"

describe("a photo: the caption first, then the picture", () => {
  it("home charging, with or without «នៅផ្ទះ»", () => {
    assert.equal(photoRoute("សាកឡាននៅផ្ទះ 56.9kwh"), "ev")
    assert.equal(photoRoute("សាកឡាន 56.9 kwh"), "ev")
    assert.equal(photoRoute("សាកឡាន ៥៦.៩ kW·h"), "ev")
  })
  it("paid charging at a station is an expense, not usage", () => {
    assert.equal(isEvUsage("សាកឡាន 8$ 20kwh"), false)
    assert.equal(photoRoute("សាកឡាន 8$ 20kwh"), "entry")
  })
  it("a caption with an amount is that entry (the photo is its receipt)", () => {
    assert.equal(photoRoute("កាហ្វេ 2$"), "entry")
    assert.equal(photoRoute("លក់បាន 120$"), "entry")
    assert.equal(photoRoute("បាយថ្ងៃ ១៥០០០៛"), "entry")
  })
  it("no caption, or one that only describes: the picture is read", () => {
    assert.equal(photoRoute(null), "slip")
    assert.equal(photoRoute("   "), "slip")
    assert.equal(photoRoute("ទិញសម្ភារៈសិក្សាឱ្យកូន"), "slip")
  })
})
