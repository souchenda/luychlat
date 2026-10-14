import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { heldButtons, isHeldCallback, parseHeldCallback } from "./held"

const ID = "b7a12090-d9a5-481f-b639-437943ce5501"

describe("held payments — ask, never guess", () => {
  it("one button per offered wallet, carrying only its place in the list", () => {
    const rows = heldButtons(ID, [
      { id: "w1", name: "ACLEDA ••6222", workspace: "DL MEAT SUPPLY" },
      { id: "w2", name: "ACLEDA ••6262" },
    ])
    assert.equal(rows.length, 2)
    assert.equal(rows[0][0].text, "👛 ACLEDA ••6222 · DL MEAT SUPPLY")
    assert.equal(rows[0][0].callback_data, `hk:${ID}:0`)
    assert.equal(rows[1][0].callback_data, `hk:${ID}:1`)
    // Telegram's 64-byte callback limit.
    assert.ok(Buffer.byteLength(rows[1][0].callback_data!) <= 64)
  })
  it("at most 8 wallets, then the optional create-wallet link", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `w${i}`, name: `W${i}` }))
    const rows = heldButtons(ID, many, { text: "➕ ABA", url: "https://app.luychlat.com/wallets" })
    assert.equal(rows.length, 9)
    assert.equal(rows[8][0].url, "https://app.luychlat.com/wallets")
  })
  it("callbacks parse strictly", () => {
    assert.deepEqual(parseHeldCallback(`hk:${ID}:3`), { id: ID, idx: 3 })
    assert.equal(isHeldCallback(`hk:${ID}:12`), false)
    assert.equal(isHeldCallback("hk:not-a-uuid:0"), false)
    assert.equal(isHeldCallback(`bu:${ID}`), false)
  })
})
