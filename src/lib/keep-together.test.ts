import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { BRAND_KEEP, splitKeep } from "./keep-together"

describe("splitKeep — phrases that must not break across lines", () => {
  it("the copyright with the brand stays in one piece", () => {
    assert.deepEqual(splitKeep("រក្សាសិទ្ធិគ្រប់យ៉ាង © 2026 អេប លុយឆ្លាត", BRAND_KEEP), [
      { text: "រក្សាសិទ្ធិគ្រប់យ៉ាង ", keep: false },
      { text: "© 2026 អេប លុយឆ្លាត", keep: true },
    ])
    assert.deepEqual(splitKeep("All Rights Reserved © 2026 App Luy Chlat", BRAND_KEEP).at(-1), { text: "© 2026 App Luy Chlat", keep: true })
  })
  it("a phrase in the middle; text without it is one plain part", () => {
    const parts = splitKeep("ត្រូវបានរក្សាការសម្ងាត់ ១០០% ដាច់ដោយឡែកពីគ្នា", /ដាច់ដោយឡែកពីគ្នា|១០០%/)
    assert.deepEqual(parts.filter((p) => p.keep).map((p) => p.text), ["១០០%", "ដាច់ដោយឡែកពីគ្នា"])
    assert.equal(parts.map((p) => p.text).join(""), "ត្រូវបានរក្សាការសម្ងាត់ ១០០% ដាច់ដោយឡែកពីគ្នា")
    assert.deepEqual(splitKeep("hello", BRAND_KEEP), [{ text: "hello", keep: false }])
  })
})
