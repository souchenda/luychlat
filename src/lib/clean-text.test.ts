import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { cleanJsonBody, cleanText, deepCleanText } from "./clean-text"

describe("clean text — what PostgreSQL rejects never leaves the app", () => {
  it("NUL bytes, the six characters «\\u0000», other C0 controls and DEL are removed", () => {
    assert.equal(cleanText("ABA\u0000 TRANSFER\u0007\u007f"), "ABA TRANSFER")
    assert.equal(cleanText("Ref\\u0000123"), "Ref123")
    assert.equal(cleanText("Ref\\U0000123"), "Ref123")
  })
  it("tab, line feed and carriage return stay; Khmer and emoji stay intact", () => {
    assert.equal(cleanText("a\tb\nc\r"), "a\tb\nc\r")
    assert.equal(cleanText("ផ្ទេរប្រាក់ ពី ស៊ូ ចិន្តា 💵"), "ផ្ទេរប្រាក់ ពី ស៊ូ ចិន្តា 💵")
  })
  it("a lone surrogate (half an emoji from a cut PDF string) is removed; a whole emoji is kept", () => {
    assert.equal(cleanText("x\uD83Dy"), "xy")
    assert.equal(cleanText("x\uDCB5y"), "xy")
    assert.equal(cleanText("x💵y"), "x💵y")
  })
  it("every string in a nested payload is cleaned (keys too); numbers, booleans and null untouched", () => {
    const out = deepCleanText({ "p_lines\u0000": [{ description: "Cafe\u0000", amount: 12.5, fee: false, bank_ref: null }] })
    assert.deepEqual(out, { p_lines: [{ description: "Cafe", amount: 12.5, fee: false, bank_ref: null }] })
  })
  it("a JSON request body is cleaned exactly; a non-JSON body only loses raw NULs", () => {
    const body = JSON.stringify({ p_lines: [{ description: "ABA\u0000 Cafe" }], note: "a\\u0000b" })
    assert.ok(body.includes("\\u0000"))
    const clean = cleanJsonBody(body)
    assert.ok(!clean.includes("\\u0000") && !clean.includes("\u0000"))
    assert.deepEqual(JSON.parse(clean), { p_lines: [{ description: "ABA Cafe" }], note: "ab" })
    assert.equal(cleanJsonBody("plain\u0000text"), "plaintext")
  })
})
