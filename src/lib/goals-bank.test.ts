import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { goalShowsBank } from "./goals"
import { providerForName } from "./wallets/providers"

describe("savings goals — a bank deposit shows the bank's logo", () => {
  it("a fixed deposit at a bank: the logo (by its icon, or by its name)", () => {
    assert.ok(goalShowsBank("chipmong", "Chip Mong Bank FD ***0102", providerForName))
    assert.ok(goalShowsBank("wing", "Wing FD", providerForName))
    assert.ok(goalShowsBank("other", "Chip Mong Bank FD ***0102", providerForName))
  })
  it("a personal goal keeps its emoji", () => {
    assert.ok(!goalShowsBank("goal_house", "ផ្ទះ", providerForName))
    assert.ok(!goalShowsBank(null, "Emergency fund", providerForName))
    assert.ok(!goalShowsBank("other", "ទិញឡាន", providerForName))
  })
})
