import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { cleanDate, cleanIdCard, expiryState, hasUnread, isOfficialCode, KIND_SPECS } from "./id-card"

describe("card vault — reading", () => {
  it("a national ID: verbatim Khmer, Latin, number, dates", () => {
    const c = cleanIdCard({ is_card: true, holder_kh: "ស៊ូ ចិន្តា", holder_en: "Sou Chenda", number: "០១០២០៣០៤៥", dob: "1990-05-12", gender: "M", issued: "2020-01-02", expiry: "2030-01-01" }, "NATIONAL_ID")!
    assert.deepEqual(
      { kh: c.holderKh, en: c.holderEn, no: c.number, dob: c.dob, g: c.gender, exp: c.expiry, unsure: c.uncertain },
      { kh: "ស៊ូ ចិន្តា", en: "SOU CHENDA", no: "010203045", dob: "1990-05-12", g: "MALE", exp: "2030-01-01", unsure: false },
    )
  })
  it("an unclear character stays «?» and marks the reading uncertain; saving waits", () => {
    const c = cleanIdCard({ is_card: true, holder_kh: "ចិន្?ា យូរ៉ាវីដ", number: "1160926-52976?8-7", is_uncertain: true }, "NATIONAL_ID")!
    assert.equal(c.holderKh, "ចិន្?ា យូរ៉ាវីដ")
    assert.equal(c.number, "1160926-52976?8-7")
    assert.equal(c.uncertain, true)
    assert.ok(hasUnread(c.holderKh))
    assert.ok(!hasUnread("ចិន្តា", null))
    // A "?" alone makes it uncertain even when the model didn't say so.
    assert.equal(cleanIdCard({ is_card: true, holder_en: "CHEN?A" }, "NATIONAL_ID")!.uncertain, true)
  })
  it("a bank card keeps the last 4 digits only, and stores no photo", () => {
    const c = cleanIdCard({ is_card: true, holder_en: "SOU CHENDA", issuer: "ABA Bank", expiry: "08/29", number: "4111111111111111", details: { last4: "4111 1111 1111 1234" } }, "BANK_CARD")!
    assert.equal(c.number, null)
    assert.equal(c.details.last4, "1234")
    assert.equal(c.expiry, "2029-08-31")
    assert.equal(KIND_SPECS.BANK_CARD.storesPhotos, false)
  })
  it("a vehicle card's details; fields the kind doesn't have are dropped", () => {
    const c = cleanIdCard({ is_card: true, holder_kh: "ស៊ូ ចិន្តា", number: "PP-123", dob: "1990-01-01", details: { plate: "ភ្នំពេញ 2AB-1234", make: "MG", model: "Marvel R", ignored: "x" } }, "VEHICLE_REG")!
    assert.equal(c.dob, null)
    assert.deepEqual(c.details, { plate: "ភ្នំពេញ 2AB-1234", make: "MG", model: "Marvel R" })
    assert.equal(cleanIdCard({ is_card: false }, "VEHICLE_REG"), null)
  })
})

describe("card vault — dates, official codes, expiry", () => {
  it("dates", () => {
    assert.equal(cleanDate("២០៣០-០១-០១"), "2030-01-01")
    assert.equal(cleanDate("02/28"), "2028-02-29")
    assert.equal(cleanDate("13/28"), null)
    assert.equal(cleanDate("01/02/2030"), null)
  })
  it("only a *.gov.kh address counts as official", () => {
    assert.ok(isOfficialCode("https://verify.gov.kh/abc"))
    assert.ok(isOfficialCode("https://verify.nssf.gov.kh/?id=1"))
    assert.ok(!isOfficialCode("https://gov.kh.example.com/"))
    assert.ok(!isOfficialCode("11609265297628"))
  })
  it("expiry", () => {
    assert.equal(expiryState("2026-10-01", "2026-10-10"), "expired")
    assert.equal(expiryState("2026-11-01", "2026-10-10"), "soon")
    assert.equal(expiryState("2027-10-01", "2026-10-10"), null)
  })
})
