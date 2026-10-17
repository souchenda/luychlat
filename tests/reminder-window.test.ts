// Reminders only in the last week, never for what is paid (founder, 16/10/2026). The database rule is
// asserted inside its own migration (a wrong rule fails the deploy); here: the latest definitions in the
// migrations keep it, and the app never re-renders a loan's installment alert with the maturity date.
import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { format } from "date-fns"

import { alertText, parseAlertKey } from "../src/lib/alerts"
import type { Debt } from "../src/lib/data/types"

const dir = join(process.cwd(), "supabase", "migrations")
function latest(name: string): string {
  const head = new RegExp(`create or replace function public\\.${name}\\(`, "i")
  let found = ""
  for (const f of readdirSync(dir).sort()) {
    const sql = readFileSync(join(dir, f), "utf8")
    const m = head.exec(sql)
    if (!m) continue
    const rest = sql.slice(m.index)
    const end = rest.search(/\n\$(function)?\$;?/)
    found = rest.slice(0, end > 0 ? end : undefined)
  }
  assert.ok(found, `${name} not found`)
  return found
}

describe("bill reminders — the last week only, never every day", () => {
  it("run_bill_alerts: snoozed is coalesced (NULL snooze_on made every bill alert daily) and the rule is bill_alert_due", () => {
    const f = latest("run_bill_alerts")
    assert.match(f, /snoozed := coalesce\(b\.snooze_on = today, false\)/)
    assert.match(f, /continue when not public\.bill_alert_due\(left_days, b\.remind_days, snoozed\)/)
    assert.doesNotMatch(f, /snoozed := b\.snooze_on = today;/)
  })
  it("bill_alert_due: due day, chosen days within 1..7, snooze within the week — and asserted in its migration", () => {
    const f = latest("bill_alert_due")
    assert.match(f, /p_left between 1 and 7/)
    const mig = readFileSync(join(dir, "20270167000000_reminder_window.sql"), "utf8")
    assert.match(mig, /assert public\.bill_alert_due\(60, '\{2\}', null\) = false/)
  })
  it("paid → its reminders are deleted (bills by paid_until, loans by the next installment / settled)", () => {
    assert.match(latest("bill_clear_paid_alerts"), /split_part\(n\.alert_key, ':', 2\)::date <= new\.paid_until/)
    const d = latest("debt_clear_paid_alerts")
    assert.match(d, /new\.status = 'SETTLED'/)
    assert.match(d, /split_part\(n\.alert_key, ':', 2\)::date < next_due/)
  })
})

describe("loan alerts in the bell — the installment, never the loan's maturity", () => {
  it("parses «D7:2026-10-20» (an installment) and «D3» (a plain debt); anything else → null", () => {
    assert.deepEqual(parseAlertKey("D7:2026-10-20"), { stage: "D7", due: "2026-10-20" })
    assert.deepEqual(parseAlertKey("D3"), { stage: "D3", due: null })
    assert.equal(parseAlertKey("BILL:2026-12-15:60"), null)
    assert.equal(parseAlertKey(null), null)
  })
  it("a PPCBank installment due in 4 days reads «4 days», not «3 years 4 months (1,246 days)»", () => {
    const today = new Date()
    // The device's own calendar date, exactly as the app counts days (todayDate in lib/debts.ts) — a fixed
    // UTC or ICT date made this test fail in some hours on a Cambodian PC or in the UTC build container.
    const iso = (d: Date) => format(d, "yyyy-MM-dd")
    const due = iso(new Date(today.getTime() + 4 * 86_400_000))
    const maturity = iso(new Date(today.getTime() + 1246 * 86_400_000))
    const debt = { id: "l", type: "PAYABLE", party_name: "PPCBank", currency: "USD", total_amount: 20000, paid_amount: 4000, due_date: maturity, status: "PARTIALLY_PAID" } as unknown as Debt
    const key = parseAlertKey(`D7:${due}`)!
    const text = alertText({ ...debt, due_date: key.due! }, key.stage, "en")
    assert.doesNotMatch(text.title, /year/)
    assert.match(text.title, /4 days/)
  })
})
