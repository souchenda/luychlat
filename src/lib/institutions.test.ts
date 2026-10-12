import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { getInstitutionLogo, hueOf, initialOf, resolveParty } from "./institutions"

describe("who a debt / bill is with", () => {
  it("PPCBank loans (house and car) → PPCBank's official logo", () => {
    assert.equal(getInstitutionLogo("PPCBank កម្ចីផ្ទះ 35 (1-224-00006341-4)"), "/banks/ppcbank.png")
    assert.deepEqual(resolveParty("PPCBank · New Car Loan to Individual-USD"), { kind: "logo", key: "ppcbank", logo: "/banks/ppcbank.png", name: "PPCBank" })
    assert.equal(resolveParty("Chip Mong Bank FD ***0102").kind, "logo")
  })
  it("Cambodian Labor Care PLC and EDC → their monogram tiles (no logo file yet), never a silhouette", () => {
    assert.deepEqual(resolveParty("Cambodian Labor Care PLC"), { kind: "institution", key: "clc", mark: "CLC" })
    assert.deepEqual(resolveParty("EDC · ផ្ទះ"), { kind: "institution", key: "edc", mark: "EDC" })
    // A local electricity supplier is not EDC.
    assert.equal(resolveParty("អគ្គិសនី គួរស្រូវ · ផ្ទះ 35").kind, "person")
  })
  it("a person → a coloured initial (a whole Khmer letter), the same colour every time", () => {
    const p = resolveParty("បងហ៊ុយ")
    assert.equal(p.kind, "person")
    assert.equal(initialOf("បងហ៊ុយ"), "ប")
    assert.equal(initialOf("sokha"), "S")
    assert.equal(hueOf("បងហ៊ុយ"), hueOf(" បងហ៊ុយ "))
  })
})
