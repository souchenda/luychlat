import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { crc16, isKhqr, khqrBank, khqrInfo } from "./khqr"

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
