import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { Debt } from "@/lib/data/types"

import { buildReminder } from "./reminder"

const debt = { party_name: "សុខា", currency: "USD", amount: 50, paid: 0, due_date: null } as unknown as Debt

describe("The debt reminder's greeting (founder, 20/10/2026)", () => {
  it("Islamic Mode: «អាស្សាឡាមុអាឡៃកុម», never «ជំរាបសួរ» / «ជម្រាបសួរ»", () => {
    const km = buildReminder(debt, "km", false, true)
    assert.ok(km.startsWith("អាស្សាឡាមុអាឡៃកុម សុខា!"), km)
    assert.doesNotMatch(km, /ជំរាបសួរ|ជម្រាបសួរ/)
    assert.ok(buildReminder(debt, "en", false, true).startsWith("Assalamu Alaikum សុខា!"))
  })
  it("otherwise as before", () => {
    assert.ok(buildReminder(debt, "km").startsWith("ជម្រាបសួរ សុខា!"))
    assert.ok(buildReminder(debt, "en").startsWith("Hello សុខា!"))
  })
})
