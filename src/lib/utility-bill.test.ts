import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { cleanUtilityBill, dueDayOf, providerShort, utilityBillTitle } from "./utility-bill"

// The two AKISANI KOUR SROV bills (October 2026), as Vision reads them.
const house37 = {
  is_bill: true,
  kind: "ELECTRICITY",
  provider: "ក្រុមហ៊ុន អគ្គិសនី គួរស្រូវ ឯ.ក (AKISANI KOUR SROV)",
  customer_id: "539-011685",
  customer_name: "ស៊ូ ចិន្តា",
  location: "ផ្ទះ 37 ( 3A ) បុរីពិភពថ្មីគួរស្រូវ 3",
  invoice_no: "CINV26-256297",
  due_date: "2026-10-15",
  amount_due: "692,100",
  currency: "KHR",
  consumption: 948,
  rate: "730",
}
const shop = { ...house37, customer_id: "៥៣៩-០១១៦៨៧", customer_name: "ហាង ភីវ", amount_due: 886900, consumption: "1,215", invoice_no: "CINV26-256298" }

describe("utility bill OCR (AKISANI KOUR SROV)", () => {
  it("reads the house bill", () => {
    const b = cleanUtilityBill(house37)!
    assert.equal(b.amount, 692100)
    assert.equal(b.currency, "KHR")
    assert.equal(b.usage, 948)
    assert.equal(b.rate, 730)
    assert.equal(b.dueDate, "2026-10-15")
    assert.equal(b.invoiceNo, "CINV26-256297")
    assert.equal(dueDayOf(b.dueDate), 15)
    // 948 kWh × 730៛ = 692,040៛ ≈ the bill (rounded / fees)
    assert.ok(Math.abs(b.usage! * b.rate! - b.amount) < 1000)
  })
  it("reads the shop bill (Khmer digits, a comma in the kWh)", () => {
    const b = cleanUtilityBill(shop)!
    assert.equal(b.customerId, "539-011687")
    assert.equal(b.amount, 886900)
    assert.equal(b.usage, 1215)
  })
  it("names the bill by provider and place", () => {
    assert.equal(providerShort(house37.provider, "ELECTRICITY"), "អគ្គិសនី គួរស្រូវ")
    assert.equal(utilityBillTitle({ provider: house37.provider, location: house37.location, kind: "ELECTRICITY" }), "អគ្គិសនី គួរស្រូវ · ផ្ទះ 37 (3A) បុរីពិភពថ្មីគួរស្រូវ")
    assert.equal(providerShort("ELECTRICITE DU CAMBODGE (EDC)", "ELECTRICITY"), "EDC")
  })
  it("refuses what is not a bill or has no amount; drops a bad date", () => {
    assert.equal(cleanUtilityBill({ is_bill: false }), null)
    assert.equal(cleanUtilityBill({ ...house37, amount_due: "—" }), null)
    assert.equal(cleanUtilityBill({ ...house37, due_date: "15/10/2026" })!.dueDate, null)
  })
})
