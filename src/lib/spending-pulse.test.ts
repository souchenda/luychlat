import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { readFileSync } from "node:fs"
import { join } from "node:path"

import { dictionaries } from "@/lib/i18n/dictionaries"

import { pulseTheme, rielTick, spendingPulse } from "./spending-pulse"

// Friday 17 October 2026, 21:00 in Cambodia.
const NOW = Date.parse("2026-10-17T14:00:00Z")
const tx = (ict: string, amount: number, currency = "KHR", type = "EXPENSE", category_id: string | null = null) => ({
  type, amount, currency, category_id, transaction_date: new Date(Date.parse(`${ict}+07:00`)).toISOString(),
})

describe("spending pulse — per day, week or month, in riel", () => {
  it("daily: the last 7 Cambodian days, Khmer weekdays, today last", () => {
    const r = spendingPulse([tx("2026-10-17T09:00:00", 50_000), tx("2026-10-11T08:00:00", 20_000)], "day", { now: NOW, khrPerUsd: 4000 })
    assert.equal(r.points.length, 7)
    assert.deepEqual(r.points.map((p) => p.label), ["អាទិត្យ", "ច័ន្ទ", "អង្គារ", "ពុធ", "ព្រហស្បតិ៍", "សុក្រ", "សៅរ៍"])
    assert.equal(r.points.at(-1)!.khr, 50_000)
    assert.equal(r.points[0].khr, 20_000)
    assert.equal(r.total, 70_000)
  })
  it("a transaction at 23:30 in Phnom Penh counts on that Cambodian day (not UTC's)", () => {
    const r = spendingPulse([tx("2026-10-16T23:30:00", 10_000)], "day", { now: NOW, khrPerUsd: 4000 })
    assert.equal(r.points.find((p) => p.key === "2026-10-16")!.khr, 10_000)
  })
  it("dollars count at the rate; income, transfers and adjustment categories never count", () => {
    const r = spendingPulse(
      [tx("2026-10-17T09:00:00", 10, "USD"), tx("2026-10-17T09:00:00", 99_000, "KHR", "INCOME"), tx("2026-10-17T09:00:00", 99_000, "KHR", "TRANSFER"), tx("2026-10-17T09:00:00", 5_000, "KHR", "EXPENSE", "adj")],
      "day",
      { now: NOW, khrPerUsd: 4100, exclude: new Set(["adj"]) },
    )
    assert.equal(r.total, 41_000)
  })
  it("the change against the same span before; none when that span was empty", () => {
    const r = spendingPulse([tx("2026-10-17T09:00:00", 150_000), tx("2026-10-08T09:00:00", 100_000)], "day", { now: NOW, khrPerUsd: 4000 })
    assert.equal(r.previous, 100_000)
    assert.equal(r.pct, 50)
    assert.equal(spendingPulse([tx("2026-10-17T09:00:00", 1)], "day", { now: NOW, khrPerUsd: 4000 }).pct, null)
  })
  it("weekly: 8 weeks starting Monday; monthly: 6 months with Khmer month names", () => {
    const w = spendingPulse([], "week", { now: NOW, khrPerUsd: 4000 })
    assert.equal(w.points.length, 8)
    assert.equal(w.points.at(-1)!.key, "2026-10-12")
    const m = spendingPulse([tx("2026-10-02T10:00:00", 30_000)], "month", { now: NOW, khrPerUsd: 4000 })
    assert.equal(m.points.length, 6)
    assert.equal(m.points.at(-1)!.label, "តុលា")
    assert.equal(m.points.at(-1)!.khr, 30_000)
  })
})

describe("riel guide labels", () => {
  it("«10 ម៉ឺន», «1.5 លាន» in Khmer (international digits — founder, 21/10/2026); K / M in English", () => {
    assert.equal(rielTick(100_000, "km"), "10 ម៉ឺន")
    assert.equal(rielTick(1_500_000, "km"), "1.5 លាន")
    assert.equal(rielTick(200_000, "en"), "200K")
    assert.equal(rielTick(0, "km"), "0")
  })
})

describe("one tap between spending and income (founder, 21/10/2026 — Task #446)", () => {
  const mix = [
    tx("2026-10-17T09:00:00", 50_000),
    tx("2026-10-17T10:00:00", 120_000, "KHR", "INCOME"),
    tx("2026-10-16T10:00:00", 25, "USD", "INCOME"),
    tx("2026-10-16T11:00:00", 9_000, "KHR", "TRANSFER"),
    tx("2026-10-15T10:00:00", 40_000, "KHR", "INCOME", "adj"),
  ]
  it("income: only the income, the same buckets, dollars at the rate, adjustments left out — for day, week and month", () => {
    const inc = spendingPulse(mix, "day", { now: NOW, khrPerUsd: 4000, exclude: new Set(["adj"]), kind: "INCOME" })
    assert.equal(inc.total, 220_000) // 120,000 ៛ + $25 × 4,000
    assert.equal(inc.points.at(-1)!.khr, 120_000)
    assert.equal(spendingPulse(mix, "day", { now: NOW, khrPerUsd: 4000, exclude: new Set(["adj"]) }).total, 50_000) // spending is the default
    for (const p of ["week", "month"] as const) assert.equal(spendingPulse(mix, p, { now: NOW, khrPerUsd: 4000, exclude: new Set(["adj"]), kind: "INCOME" }).total, 220_000, p)
  })
  it("each kind's look and words: coral for spending, emerald for income; a rise is good news only for income", () => {
    const e = pulseTheme("EXPENSE")
    const i = pulseTheme("INCOME")
    assert.deepEqual([e.color, i.color], ["var(--viz-expense)", "var(--viz-income)"])
    assert.notEqual(e.fill, i.fill) // two gradients, never one id for both colours
    assert.deepEqual([e.riseIsGood, i.riseIsGood], [false, true])
    const km = dictionaries.km as Record<string, string>
    assert.deepEqual([km[e.title], km[i.title]], ["ចំណាយ", "ចំណូល"])
    assert.deepEqual([km[`${e.total}.day`], km[`${i.total}.day`], km[`${i.total}.week`], km[`${i.total}.month`]], ["ចំណាយ 7 ថ្ងៃចុងក្រោយ", "ចំណូល 7 ថ្ងៃចុងក្រោយ", "ចំណូល 8 សប្តាហ៍ចុងក្រោយ", "ចំណូល 6 ខែចុងក្រោយ"])
    for (const l of ["en", "zh"] as const) assert.ok((dictionaries[l] as Record<string, string>)[`${i.total}.month`], l)
  })
  it("wired: the switch beside the title, the series, total, tooltip and change pill follow it; the period tabs stay", () => {
    const card = readFileSync(join(process.cwd(), "src/components/dashboard/spending-trend-card.tsx"), "utf8")
    assert.match(card, /<Segmented\s+aria-label=\{t\("home\.pulseKind"\)\}\s+value=\{kind\}\s+onChange=\{setKind\}/)
    assert.match(card, /\{ value: "EXPENSE", label: t\("tx\.EXPENSE"\) \},\s+\{ value: "INCOME", label: t\("tx\.INCOME"\) \}/)
    assert.match(card, /spendingPulse\(transactions, period, \{ khrPerUsd, exclude: adjustmentCategoryIds\(categories\), locale, kind \}\)/)
    assert.match(card, /stroke=\{theme\.color\} strokeWidth=\{2\} fill=\{`url\(#\$\{theme\.fill\}\)`\}/)
    assert.match(card, /const good = up === theme\.riseIsGood/)
    assert.match(card, /\{ value: "day", label: t\("home\.pulseDay"\) \}/)
  })
})
