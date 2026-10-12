import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { describe, it } from "node:test"

import { billCategory, CATEGORY_BADGE, getInstitutionLogo, INSTITUTIONS } from "./institution-logos"
import { hueOf, initialOf, resolveParty } from "./institutions"

describe("institution registry — who a debt / bill is with", () => {
  it("PPCBank by name or by its account number (1-223-, 1-224-) → PPCBank's official logo", () => {
    assert.equal(getInstitutionLogo("PPCBank កម្ចីផ្ទះ 35 (1-224-00006341-4)").logoUrl, "/banks/ppcbank.png")
    assert.equal(getInstitutionLogo("កម្ចីឡាន 1-223-00004253-8").logoUrl, "/banks/ppcbank.png")
    assert.deepEqual(resolveParty("PPCBank · New Car Loan to Individual-USD"), { kind: "logo", key: "ppcbank", logo: "/banks/ppcbank.png", name: "PPCBank" })
    assert.equal(resolveParty("Chip Mong Bank FD ***0102").kind, "logo")
  })
  it("CLC, EDC and Kour Srov Electricity (either spelling) → their own badge, never a silhouette", () => {
    assert.equal(getInstitutionLogo("Cambodian Labor Care PLC").key, "clc")
    assert.equal(getInstitutionLogo("EDC · ផ្ទះ").key, "edc")
    assert.equal(getInstitutionLogo("អគ្គិសនីកម្ពុជា").key, "edc")
    for (const n of ["អគ្គិសនី គួរស្រូវ · ផ្ទះ 35", "អគ្គិសនី កួរស្រូវ", "Kour Srov Electricity"]) {
      const l = getInstitutionLogo(n)
      assert.equal(l.key, "kour-srov", n)
      assert.equal(l.category, "ELECTRICITY")
    }
    assert.deepEqual(resolveParty("Cambodian Labor Care PLC"), { kind: "institution", key: "clc", mark: "CLC", bg: CATEGORY_BADGE.BANK.bg })
    assert.equal(resolveParty("អគ្គិសនី កួរស្រូវ").kind, "institution")
  })
  it("water, waste, tax, telco, insurance and car makers by their Khmer or English names", () => {
    const keys = (names: string[]) => names.map((n) => getInstitutionLogo(n).key)
    assert.deepEqual(keys(["រដ្ឋាករទឹកស្វយ័តក្រុងភ្នំពេញ", "SRWSA", "រដ្ឋាករទឹកសៀមរាប"]), ["ppwsa", "srwsa", "srwsa"])
    assert.deepEqual(keys(["Cintri", "ស៊ីនទ្រី", "មីហ្ស៊ូដា", "800 Super"]), ["cintri", "cintri", "mizuda", "800super"])
    assert.deepEqual(keys(["ពន្ធដារ ប្រចាំឆ្នាំ", "ពន្ធផ្លូវ", "NSSF", "ប.ស.ស."]), ["gdt", "mpwt", "nssf", "nssf"])
    assert.deepEqual(keys(["Smart Axiata", "Cellcard", "EZECOM 50Mbps", "Forte"]), ["smart", "cellcard", "ezecom", "forte"])
    assert.deepEqual(keys(["MG Marvel R · 2AB-1234", "Toyota Prius", "Lexus RX"]), ["mg", "toyota", "lexus"])
    assert.equal(getInstitutionLogo("ABA").logoUrl, "/banks/aba.png")
    assert.equal(getInstitutionLogo("EDC · ផ្ទះ").logoUrl, "/logos/edc.png")
    assert.equal(getInstitutionLogo("MG Marvel R · 2AB-1234").logoUrl, "/logos/mg.png")
  })
  it("an unknown vendor with a category → the category's badge (blue «ទ» water, gold «អ» power, green «ស» trash)", () => {
    assert.deepEqual(getInstitutionLogo("ទឹកបុរី ពិភពថ្មី", "WATER").fallbackBadge, { bg: "#0284C7", text: "ទ" })
    assert.deepEqual(resolveParty("អគ្គិសនី ភូមិ", billCategory("ELECTRICITY")), { kind: "institution", mark: "អ", bg: "#D97706" })
    assert.equal(resolveParty("សំរាម", billCategory("WASTE")).kind, "institution")
    assert.equal(billCategory("INTERNET"), "TELCO")
  })
  it("a person (no category) → a coloured initial (a whole Khmer letter), the same colour every time", () => {
    assert.equal(resolveParty("បងហ៊ុយ").kind, "person")
    assert.equal(initialOf("បងហ៊ុយ"), "ប")
    assert.equal(initialOf("sokha"), "S")
    assert.equal(hueOf("បងហ៊ុយ"), hueOf(" បងហ៊ុយ "))
    assert.equal(resolveParty("SmartLuy").kind, "person")
  })
})

describe("institution logos — files", () => {
  it("every logo the registry names exists in public/", () => {
    for (const i of INSTITUTIONS) if (i.logo) assert.ok(existsSync(`public${i.logo}`), i.logo)
  })
})
