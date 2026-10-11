import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { Category, Transaction } from "@/lib/data/types"

import { patentDueInDays, taxEstimate } from "./tax"

const cat = (id: string, type: "INCOME" | "EXPENSE", preset_key: string | null): Category =>
  ({ id, workspace_id: "w", name: id, type, icon: null, color: null, preset_key, created_at: "" }) as Category
const tx = (category_id: string, type: "INCOME" | "EXPENSE" | "TRANSFER", amount: number, currency: "USD" | "KHR"): Transaction =>
  ({ id: `${category_id}-${amount}`, workspace_id: "w", wallet_id: "a", to_wallet_id: null, category_id, amount, to_amount: null, currency, type, exchange_rate: null, note: null, receipt_url: null, transaction_date: "2026-10-05T03:00:00Z", created_at: "", debt_id: null }) as Transaction

const CATS = [cat("sales", "INCOME", "sales"), cat("svc", "INCOME", "services"), cat("cap", "INCOME", "investment"), cat("rent", "EXPENSE", "rent"), cat("whRent", "EXPENSE", null), cat("food", "EXPENSE", "inventory")]

describe("GDT tax estimate — small taxpayer", () => {
  const rows = [
    tx("sales", "INCOME", 2_000_000, "KHR"),
    tx("sales", "INCOME", 500, "USD"), // 2,000,000 ៛ at 4,000
    tx("svc", "INCOME", 1_000_000, "KHR"),
    tx("cap", "INCOME", 10_000, "USD"), // the owner's capital: not sales
    tx("rent", "EXPENSE", 300, "USD"), // 1,200,000 ៛
    tx("whRent", "EXPENSE", 800_000, "KHR"), // the warehouse, paid from a RENT bill's category
    tx("food", "EXPENSE", 900_000, "KHR"),
  ]
  const e = taxEstimate(rows, CATS, 4000, "2026-10-11", ["whRent"])
  it("1% minimum tax on gross sales (sales + services; never capital)", () => {
    assert.equal(e.salesKhr, 5_000_000)
    assert.equal(e.minimumTaxKhr, 50_000)
  })
  it("10% withholding on rent (the rent category and the RENT bills' categories)", () => {
    assert.equal(e.rentKhr, 2_000_000)
    assert.equal(e.rentWhtKhr, 200_000)
  })
  it("the reserve: both, plus 1/12 of the 400,000 ៛ patent tax", () => {
    assert.equal(e.patentShareKhr, 33_333)
    assert.equal(e.reserveKhr, 283_333)
  })
  it("no sales, no rent: only the patent share", () => {
    const empty = taxEstimate([], CATS, 4000, "2026-10-11")
    assert.equal(empty.minimumTaxKhr + empty.rentWhtKhr, 0)
    assert.equal(empty.reserveKhr, 33_333)
  })
})

describe("patent tax reminder — due 31 March", () => {
  it("counts down from January to March, nothing after", () => {
    assert.equal(patentDueInDays("2027-01-01"), 89)
    assert.equal(patentDueInDays("2027-03-31"), 0)
    assert.equal(patentDueInDays("2026-10-11"), null)
  })
})
