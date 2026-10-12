import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { liabilitiesUsd } from "./debts"

describe("loans owed (the net worth card's separate line)", () => {
  const d = (over: Partial<{ type: "PAYABLE" | "RECEIVABLE"; status: "ACTIVE" | "PARTIALLY_PAID" | "SETTLED" | "OVERDUE"; total_amount: number; paid_amount: number; currency: "USD" | "KHR" }>) => ({
    type: "PAYABLE" as const, status: "ACTIVE" as const, total_amount: 0, paid_amount: 0, currency: "USD" as const, ...over,
  })
  it("open loans only (not settled, not money owed to me), riel at the rate", () => {
    const usd = liabilitiesUsd(
      [
        d({ total_amount: 38000 }), // PPCBank house loan
        d({ total_amount: 9599, paid_amount: 1358, status: "PARTIALLY_PAID" }), // CLC
        d({ total_amount: 4_000_000, currency: "KHR" }), // 1,000 $ at 4,000
        d({ total_amount: 500, status: "SETTLED" }),
        d({ type: "RECEIVABLE", total_amount: 700 }),
      ],
      4000,
    )
    assert.equal(usd, 38000 + 8241 + 1000)
  })
})
