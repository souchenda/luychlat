import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { matchDebt, sameName } from "./khqr-debt-match"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")
const debts = [
  { id: "a", party_name: "Tim Sreyleak", remaining: 200_000 },
  { id: "b", party_name: "ហាងបាយ សុខា", remaining: 50 },
  { id: "c", party_name: "Dara", remaining: 30 },
]

describe("KHQR payment ↔ customer debt — a suggestion, never booked without ✅ (founder, 4/11/2026)", () => {
  it("the same name in any order, case and punctuation aside; Khmer too", () => {
    assert.ok(sameName("TIM SREYLEAK", "Sreyleak Tim"))
    assert.ok(sameName("TIM SREYLEAK", "Tim Sreyleak (ហាងបាយ)"))
    assert.ok(sameName("សុខា", "ហាងបាយ សុខា"))
    assert.ok(!sameName("TIM DARA", "Tim Sreyleak")) // one shared word is not the same person
    assert.ok(!sameName("SO", "So Phalla")) // too short to mean anything
    assert.ok(!sameName("", "Dara"))
  })

  it("one debt that matches and fits → offered; none, or two, → nothing (never a guess between customers)", () => {
    assert.equal(matchDebt({ amount: 150_000, payer: "TIM SREYLEAK" }, debts)?.id, "a")
    assert.equal(matchDebt({ amount: 250_000, payer: "TIM SREYLEAK" }, debts), null) // more than is owed
    assert.equal(matchDebt({ amount: 10, payer: "SOK CHEA" }, debts), null)
    assert.equal(matchDebt({ amount: 10, payer: null }, debts), null)
    const twins = [...debts, { id: "d", party_name: "Tim Sreyleak", remaining: 100_000 }]
    assert.equal(matchDebt({ amount: 50_000, payer: "Tim Sreyleak" }, twins), null)
    assert.equal(matchDebt({ amount: 30, payer: "Dara" }, debts)?.id, "c") // exactly what is left
  })

  it("the database: the owner only, checked again at the tap; the sale's own income becomes the repayment — never a second income", () => {
    const sql = read("supabase/migrations/20270287000000_khqr_debt_match.sql")
    assert.match(sql, /m\.role = 'OWNER'\) then\n\s+return jsonb_build_object\('status', 'not_owner'\)/)
    assert.match(sql, /d\.total_amount - d\.paid_amount < tx\.amount then/)
    // Linked first (guard_debt_repayment), then the repayment row — no new transaction is inserted.
    const settle = sql.slice(sql.indexOf("function public.bot_khqr_debt_settle"), sql.indexOf("revoke all on function public.bot_khqr_debt_candidates"))
    assert.ok(settle.indexOf("update public.transactions") < settle.indexOf("insert into public.debt_repayments"))
    assert.doesNotMatch(settle, /insert into public\.transactions/)
    assert.match(sql, /d\.type = 'RECEIVABLE' and d\.currency = t\.currency/)
  })

  it("wired: after the sale is told, not awaited (the SoundBox never waits); the buttons in the private chat only", () => {
    const ingest = read("src/app/api/khqr/ingest/route.ts")
    assert.match(ingest, /if \(r\.status === "ok" && r\.transaction_id\) void offerDebtMatch\(r\.transaction_id\)\.catch\(/)
    assert.ok(ingest.indexOf("void offerDebtMatch") < ingest.indexOf('rpc("bot_soundbox_emit"'))
    const bot = read("src/lib/server/khqr-debt-bot.ts")
    assert.match(bot, /cb\.message\?\.chat\.type !== "private"/)
    assert.match(bot, /reached \$\{reached\} of \$\{owners\.length\} owner chat/) // never a bare «sent»
    assert.match(read("src/app/api/telegram/webhook/route.ts"), /isKhqrDebtCallback\(update\.callback_query\.data\)/)
  })
})
