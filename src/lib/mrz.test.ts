import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { checkDigit, parseTd1, parseValidity, reconcileIdDates } from "./mrz"

const NOW = new Date("2026-10-15T00:00:00Z")
// Line 2 as on the founder's scan (15/10/2026); lines 1 and 3 built to the TD1 rules (check digits right).
const L1 = `IDKHM010203045${checkDigit("010203045")}<<<<<<<<<<<<<<<`
const L2 = "8701071M2711058KHM<<<<<<<<<<<0"
const L3 = "SOU<<CHENDA<<<<<<<<<<<<<<<<<<<"

describe("MRZ (TD1) — decoded in code, check digits first", () => {
  it("the ICAO 7-3-1 check digit", () => {
    assert.equal(checkDigit("870107"), 1)
    assert.equal(checkDigit("271105"), 8)
  })
  it("the scan's line 2: born 1987-01-07, male, MRZ expiry 2027-11-05", () => {
    const m = parseTd1([L1, L2, L3], NOW)!
    assert.equal(m.dob, "1987-01-07")
    assert.equal(m.sex, "MALE")
    assert.equal(m.expiry, "2027-11-05")
    assert.equal(m.number, "010203045")
    assert.equal(m.nameEn, "SOU CHENDA")
  })
  it("spaces, lower case and a «« for << are tolerated; lines in any order", () => {
    const m = parseTd1([L3.toLowerCase(), "8701071 M 2711058 KHM", L1], NOW)!
    assert.equal(m.dob, "1987-01-07")
    assert.equal(m.expiry, "2027-11-05")
  })
  it("a wrong check digit gives null for that field — never a guess", () => {
    const m = parseTd1(["8701072M2711051KHM<<<<<<<<<<<0"], NOW)!
    assert.equal(m.dob, null)
    assert.equal(m.expiry, null)
    assert.equal(parseTd1(["not an mrz"], NOW), null)
  })
})

describe("printed validity — Khmer digits parsed in code", () => {
  it("«សុពលភាព៖ ០៨.១១.២០១៧ ដល់ថ្ងៃ ០៤.១១.២០២៧» → 2017-11-08 to 2027-11-04 (day first)", () => {
    assert.deepEqual(parseValidity("សុពលភាព៖ ០៨.១១.២០១៧ ដល់ថ្ងៃ ០៤.១១.២០២៧"), { issued: "2017-11-08", expiry: "2027-11-04" })
  })
  it("Latin digits and slashes too; nothing readable → null", () => {
    assert.deepEqual(parseValidity("08/11/2017 - 04/11/2027"), { issued: "2017-11-08", expiry: "2027-11-04" })
    assert.deepEqual(parseValidity(null), { issued: null, expiry: null })
  })
})

describe("the national ID's dates — the scan of 15/10/2026 comes out right", () => {
  const wrong = { dob: "1987-01-07", issued: "2009-03-08", expiry: "2019-03-08", number: "010203045", nameEn: "SOU CHENDA" }
  it("printed line + MRZ: 08/11/2017 → 04/11/2027 (the model's 2009 / 2019 discarded); MRZ +1 day is consistent", () => {
    const r = reconcileIdDates({ model: wrong, validityText: "សុពលភាព៖ ០៨.១១.២០១៧ ដល់ថ្ងៃ ០៤.១១.២០២៧", mrz: parseTd1([L1, L2, L3], NOW) })
    assert.equal(r.issued, "2017-11-08")
    assert.equal(r.expiry, "2027-11-04")
    assert.equal(r.uncertain, false)
  })
  it("no printed line, only the model's wrong dates: the MRZ corrects the expiry to 04/11/2027 and flags it; the issue date that isn't ~10 years before is dropped", () => {
    const r = reconcileIdDates({ model: wrong, mrz: parseTd1([L2], NOW) })
    assert.equal(r.expiry, "2027-11-04")
    assert.equal(r.issued, null)
    assert.equal(r.uncertain, true)
  })
  it("no MRZ: the printed line still fixes the dates", () => {
    const r = reconcileIdDates({ model: wrong, validityText: "០៨.១១.២០១៧ ដល់ថ្ងៃ ០៤.១១.២០២៧" })
    assert.equal(r.issued, "2017-11-08")
    assert.equal(r.expiry, "2027-11-04")
  })
  it("the MRZ's date of birth and Latin name win over the model's", () => {
    const r = reconcileIdDates({ model: { ...wrong, dob: "1987-07-01", nameEn: "SO CHENDA" }, mrz: parseTd1([L1, L2, L3], NOW) })
    assert.equal(r.dob, "1987-01-07")
    assert.equal(r.nameEn, "SOU CHENDA")
  })
})
