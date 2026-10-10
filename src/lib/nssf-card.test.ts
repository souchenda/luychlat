import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { ageOn, cardName, cleanNssfCard, cleanNssfId, guessRelationship, qrConfirmsId } from "./nssf-card"

describe("NSSF card OCR", () => {
  const raw = { is_card: true, name_kh: "ស៊ូ ចិន្តា", name_en: "Sou Chenda", id_number: "1870219-1998577-ឈ", dob: "1990-05-12", gender: "M" }

  it("cleans the reading and keeps a Khmer letter in the ID", () => {
    const c = cleanNssfCard(raw)!
    assert.equal(c.nameEn, "SOU CHENDA")
    assert.equal(c.idNumber, "1870219-1998577-ឈ")
    assert.equal(c.gender, "MALE")
    // The member name is the Khmer name only; the Latin name stays on the card reading.
    assert.equal(cardName(c), "ស៊ូ ចិន្តា")
    assert.equal(cardName({ ...c, nameKh: null }), "SOU CHENDA")
  })
  it("a dependent child's card: the verbatim Khmer name, never «(LATIN)» appended", () => {
    const c = cleanNssfCard({ is_card: true, name_kh: "ចិន្តា យូរ៉ាវីដ", name_en: "CHENDA YOURAVID", id_number: "1160926-5297628-7", dob: "2016-01-20", gender: "MALE" })!
    assert.equal(cardName(c), "ចិន្តា យូរ៉ាវីដ")
    assert.equal(c.nameEn, "CHENDA YOURAVID")
    assert.equal(c.idNumber, "1160926-5297628-7")
    assert.equal(guessRelationship(c, "SOU CHENDA", "2026-10-10"), "child")
  })
  it("Khmer digits in the ID and date become Latin; junk is dropped", () => {
    assert.equal(cleanNssfId("១៨៧០២១៩-១៩៩៨៥៧៧"), "1870219-1998577")
    assert.equal(cleanNssfId("N/A"), null)
    assert.equal(cleanNssfCard({ ...raw, dob: "១៩៩០-០៥-១២" })!.dob, "1990-05-12")
    assert.equal(cleanNssfCard({ ...raw, dob: "12/05/1990" })!.dob, null)
    assert.equal(cleanNssfCard({ is_card: false }), null)
  })
  it("guesses the relationship: own name → self; under 18 → child; another adult → spouse", () => {
    const c = cleanNssfCard(raw)!
    assert.equal(guessRelationship(c, "ស៊ូ ចិន្ដា", "2026-10-08"), "self") // ្ដ and ្ត are the same letter in names
    assert.equal(guessRelationship(c, "ស៊ូ ចិន្តា", "2026-10-08"), "self")
    assert.equal(guessRelationship(c, "SOU CHENDA", "2026-10-08"), "self")
    assert.equal(guessRelationship({ ...c, nameKh: "ស៊ូ ដារ៉ា", nameEn: "SOU DARA", dob: "2015-01-01" }, "SOU CHENDA", "2026-10-08"), "child")
    assert.equal(ageOn("2008-10-09", "2026-10-08"), 17)
    assert.equal(ageOn("2008-10-08", "2026-10-08"), 18)
  })
  it("the card's QR confirms the ID when it carries its digits", () => {
    assert.ok(qrConfirmsId("https://verify.nssf.gov.kh/?id=18702191998577", "1870219-1998577-ឈ"))
    assert.ok(!qrConfirmsId("https://example.com", "1870219-1998577"))
  })
})
