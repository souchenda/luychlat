import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { busiestHours, hourRange, parseInsights } from "./customer-insights"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")

describe("«អតិថិជនទៀងទាត់» — KHQR regular customers (founder, 4/11/2026)", () => {
  it("reads the database's answer safely (numerics as strings, missing parts empty)", () => {
    const i = parseInsights({
      days: 90,
      sales: "41",
      payers: "12",
      regulars: [{ payer: "Tim Sreyleak", visits: "7", khr: "152500", usd: "12.50", last_at: "2026-11-03T05:00:00Z" }],
      missing: [{ payer: "Dara", visits: 5, last_at: "2026-10-01T05:00:00Z", days_since: "34" }],
      hours: [{ hour: 11, sales: "9" }, { hour: 25, sales: 3 }, { hour: 7, sales: 0 }],
    })
    assert.deepEqual(i.regulars[0], { payer: "Tim Sreyleak", visits: 7, khr: 152500, usd: 12.5, last_at: "2026-11-03T05:00:00Z" })
    assert.equal(i.missing[0].days_since, 34)
    assert.deepEqual(i.hours, [{ hour: 11, sales: 9 }]) // an impossible hour and an empty one dropped
    assert.deepEqual(parseInsights(null), { days: 90, sales: 0, payers: 0, regulars: [], missing: [], hours: [] })
  })

  it("the busiest hours, most sales first, the earlier hour on a tie; 0-9 digits", () => {
    assert.deepEqual(busiestHours([{ hour: 18, sales: 5 }, { hour: 11, sales: 9 }, { hour: 7, sales: 5 }, { hour: 12, sales: 1 }]), [
      { hour: 11, sales: 9 },
      { hour: 7, sales: 5 },
      { hour: 18, sales: 5 },
    ])
    assert.equal(hourRange(7), "07:00–08:00")
    assert.equal(hourRange(23), "23:00–00:00")
  })

  it("the owner of a Business workspace only — in the database and on the page; customer payments only", () => {
    const sql = read("supabase/migrations/20270286000000_khqr_customer_insights.sql")
    assert.match(sql, /m\.role = 'OWNER' and w\.type = 'BUSINESS'/)
    assert.match(sql, /raise exception 'owner_only'/)
    assert.match(sql, /t\.type = 'INCOME' and t\.debt_id is null and c\.preset_key = 'sales'/)
    assert.match(sql, /revoke all on function public\.khqr_customer_insights\(uuid, int\) from public, anon;/)
    const page = read("src/app/(app)/business/customers/page.tsx")
    assert.match(page, /enabled: Boolean\(workspace\?\.id && business && owner\)/)
    assert.match(page, /<Amount value=\{r\.khr\} currency="KHR" \/>/) // amounts follow the eye
    assert.match(read("src/components/layout/app-nav.tsx"), /\{ href: "\/business\/customers", label: "regulars\.title", icon: UsersRoundIcon \}/)
  })
})
