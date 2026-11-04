import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { crc16, isKhqr, khqrBank, khqrInfo, khqrWithAmount } from "./khqr"

/** A well-formed KHQR with its checksum: account tag 29 (Bakong ID, account, acquirer), currency, name. */
function payload(account: [string, string, string], currency: "116" | "840", name: string): string {
  const tlv = (id: string, v: string) => `${id}${String(v.length).padStart(2, "0")}${v}`
  const body = ["000201", "010211", tlv("29", tlv("00", account[0]) + tlv("01", account[1]) + tlv("02", account[2])), "52045999", tlv("53", currency), "5802KH", tlv("59", name), "6010Phnom Penh", "6304"].join("")
  return body + crc16(body)
}

describe("KHQR — bank and currency from the code", () => {
  const aba = payload(["dlmeat@abaa", "000123456", "ABA Bank"], "840", "DL MEAT SUPPLY")
  const acleda = payload(["dlmeat@aclb", "386000001", "ACLEDA Bank Plc."], "116", "DL MEAT SUPPLY")
  const wing = payload(["sou@wing", "102667083", "Wing Bank"], "116", "SOU CHENDA")
  it("well-formed", () => {
    for (const p of [aba, acleda, wing]) assert.ok(isKhqr(p))
  })
  it("the bank from the Bakong ID / acquirer, the currency from tag 53", () => {
    assert.equal(khqrBank(aba), "ABA")
    assert.equal(khqrInfo(aba).currency, "USD")
    assert.equal(khqrBank(acleda), "ACLEDA")
    assert.equal(khqrInfo(acleda).currency, "KHR")
    assert.equal(khqrBank(wing), "WING")
    assert.equal(khqrBank(payload(["x@cadi", "1", "Canadia Bank"], "116", "Shop")), "CANADIA")
    assert.equal(khqrBank(payload(["x@sbpl", "1", "Sathapana Bank"], "116", "Shop")), "SATHAPANA")
  })
  it("the merchant's own name never decides the bank; an unknown bank is OTHER", () => {
    assert.equal(khqrBank(payload(["shop@prin", "1", "Prince Bank"], "116", "ABA SHOP ACLEDA")), "OTHER")
    assert.equal(khqrBank("not a code"), "OTHER")
  })
})

describe("Order-ahead — the shop's KHQR with the order's amount (founder, 4/11/2026)", () => {
  const usd = payload(["cafe@abaa", "000123456", "ABA Bank"], "840", "MY CAFE")
  const khr = payload(["cafe@aclb", "386000001", "ACLEDA Bank Plc."], "116", "MY CAFE")

  it("a valid KHQR again: dynamic (01 = 12), the amount in tag 54, a fresh checksum, everything else unchanged", () => {
    const q = khqrWithAmount(usd, 3.5)!
    assert.ok(isKhqr(q))
    assert.equal(khqrInfo(q).amount, 3.5)
    assert.equal(khqrInfo(q).name, "MY CAFE")
    assert.equal(khqrBank(q), "ABA")
    assert.match(q, /^000201010212/)
    assert.match(q, /5303840540[0-9]3\.50/) // currency, then the amount: dollars to the cent
    assert.equal(khqrInfo(khqrWithAmount(khr, 12500)!).amount, 12500) // riel whole
    assert.match(khqrWithAmount(khr, 12500)!, /5303116540512500/)
  })

  it("never: a broken code, no amount, or a code that already holds another amount", () => {
    assert.equal(khqrWithAmount("000201nonsense", 5), null)
    assert.equal(khqrWithAmount(usd, 0), null)
    const fixed = khqrWithAmount(usd, 2)!
    assert.equal(khqrWithAmount(fixed, 3), null)
    assert.equal(khqrWithAmount(fixed, 2), fixed)
  })
})
