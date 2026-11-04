import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { detectRecurring, payeeKey, type RecurringTx } from "./recurring-detect"

const TODAY = "2026-11-04"
const tx = (date: string, amount: number, note: string | null, extra: Partial<RecurringTx> = {}): RecurringTx => ({ amount, currency: "USD", type: "EXPENSE", category_id: "phone", note, transaction_date: `${date}T10:00:00+07:00`, ...extra })
const smart = [tx("2026-08-05", 5, "Smart 5$"), tx("2026-09-04", 5, "smart $5.00"), tx("2026-10-06", 5, "Smart 5 ដុល្លារ"), tx("2026-11-03", 5, "Smart 5$")]

describe("«💡 រកឃើញការបង់ប្រចាំខែ» — a monthly payment noticed, offered as a reminder (founder, 4/11/2026)", () => {
  it("the payee without its amount or currency words", () => {
    assert.equal(payeeKey("Smart 5$"), "smart")
    assert.equal(payeeKey("smart $5.00"), "smart")
    assert.equal(payeeKey("ថ្លៃអ៊ីនធឺណិត 15000 រៀល"), "ថ្លៃអ៊ីនធឺណិត")
    assert.equal(payeeKey(null), "")
  })

  it("the same payee, about the same amount and day, 3+ months in a row → one suggestion, day the middle one", () => {
    const f = detectRecurring({ transactions: smart, bills: [], today: TODAY })
    assert.equal(f.length, 1)
    assert.deepEqual({ title: f[0].title, amount: f[0].amount, currency: f[0].currency, dueDay: f[0].dueDay, months: f[0].months }, { title: "Smart", amount: 5, currency: "USD", dueDay: 5, months: 4 })
  })

  it("not a bill: only 2 months, a gap month, a daily coffee, days far apart, an old pattern, a loan repayment", () => {
    assert.equal(detectRecurring({ transactions: smart.slice(2), bills: [], today: TODAY }).length, 0)
    assert.equal(detectRecurring({ transactions: [smart[0], smart[1], smart[3]], bills: [], today: TODAY }).length, 0) // October missing
    const coffee = ["08", "09", "10", "11"].flatMap((m) => ["01", "02", "03", "04"].map((d) => tx(`2026-${m}-${d}`, 2, "កាហ្វេ 2$", { category_id: "food" })))
    assert.equal(detectRecurring({ transactions: coffee, bills: [], today: TODAY }).length, 0)
    assert.equal(detectRecurring({ transactions: [tx("2026-08-01", 5, "Smart"), tx("2026-09-15", 5, "Smart"), tx("2026-10-28", 5, "Smart")], bills: [], today: TODAY }).length, 0)
    assert.equal(detectRecurring({ transactions: smart, bills: [], today: "2027-02-01" }).length, 0)
    assert.equal(detectRecurring({ transactions: smart.map((t) => ({ ...t, debt_id: "loan" })), bills: [], today: TODAY }).length, 0)
  })

  it("never offered twice: an active bill with that category or name and amount already covers it", () => {
    assert.equal(detectRecurring({ transactions: smart, bills: [{ title: "ទូរស័ព្ទ", amount: 5, currency: "USD", category_id: "phone", is_active: true }], today: TODAY }).length, 0)
    assert.equal(detectRecurring({ transactions: smart, bills: [{ title: "SMART", amount: 5.2, currency: "USD", category_id: null, is_active: true }], today: TODAY }).length, 0)
    assert.equal(detectRecurring({ transactions: smart, bills: [{ title: "Smart", amount: 5, currency: "USD", category_id: "phone", is_active: false }], today: TODAY }).length, 1)
  })

  it("no note: the category names it; riel and dollars apart; a changed price follows the latest", () => {
    const rent = ["2026-08-01", "2026-09-01", "2026-10-02"].map((d) => tx(d, 150_000, null, { currency: "KHR", category_id: "rent" }))
    const f = detectRecurring({ transactions: rent, bills: [], today: TODAY, categoryName: (id) => (id === "rent" ? "ជួលផ្ទះ" : "") })
    assert.equal(f[0]?.title, "ជួលផ្ទះ")
    assert.equal(f[0]?.currency, "KHR")
    const up = [tx("2026-08-05", 5, "Smart"), tx("2026-09-05", 5.3, "Smart"), tx("2026-10-05", 5.5, "Smart")]
    assert.equal(detectRecurring({ transactions: up, bills: [], today: TODAY })[0]?.amount, 5.5)
  })
})

describe("the Cambodian day, not UTC", () => {
  it("00:30 on 1 September in Cambodia (17:30 UTC on 31 August) counts as September", () => {
    const list = [tx("2026-08-01", 5, "Smart"), { ...tx("2026-09-01", 5, "Smart"), transaction_date: "2026-08-31T17:30:00Z" }, tx("2026-10-01", 5, "Smart")]
    assert.equal(detectRecurring({ transactions: list, bills: [], today: TODAY })[0]?.months, 3)
  })
})

describe("wired on /bills — Personal only, nothing created without the tap", () => {
  it("the card shows in a Personal book only; ✕ remembered on the phone; the bill made only by «រំលឹកខ្ញុំ»", async () => {
    const { readFileSync } = await import("node:fs")
    const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n")
    assert.match(read("src/app/(app)/bills/page.tsx"), /\{workspace\?\.type === "PERSONAL" && editable && ws && bills\.data && <RecurringSuggestions /)
    const card = read("src/components/bills/recurring-suggestions.tsx")
    assert.match(card, /if \(!found\.length\) return null/)
    assert.equal((card.match(/save\.mutateAsync\(/g) ?? []).length, 1)
    assert.match(card, /onClick=\{\(\) => void remind\(f\)\}/)
  })
})
