// GOLDEN PATH 7 — Ask, never guess, which wallet money goes into (founder, 14/10/2026).
//   KHQR sale with no wallet of the receiving bank → held, the owner picks (never Cash / another bank).
//   Bank alert whose last digits match two or more wallets → held, the person picks.
// The database functions live in a migration; the guard reads the LATEST definition of each.
import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { heldButtons, parseHeldCallback } from "../../src/lib/bot/held"

const dir = join(process.cwd(), "supabase", "migrations")
/** The body of the newest `create or replace function public.<name>(` across the migrations. */
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
const src = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8")

describe("GOLDEN 7 · ask, never guess the wallet", () => {
  it("KHQR: only the receiving bank's wallet is chosen by itself — no fallback to any other wallet", () => {
    const k = latest("khqr_record")
    // The automatic pick is filtered to the bank (icon or name) …
    assert.match(k, /and \(lower\(coalesce\(x\.icon, ''\)\) = lower\(v_bank\) or lower\(x\.name\) ~ bank_re\)\s*order by/)
    // … and the old «else one in the currency, else the first» ordering is gone.
    assert.doesNotMatch(k, /\(x\.currency::text = v_cur\) desc, x\.created_at\s*limit 1;\s*if w\.id is null then\s*return jsonb_build_object\('status', 'no_wallet'/)
    // No bank wallet → held and asked.
    assert.match(k, /insert into public\.bot_held_payments[\s\S]{0,1600}'status', 'ask'/)
    assert.match(k, /insert into public\.notifications/)
  })
  it("bank alert: two or more wallets with the same digits are asked, not ordered and picked", () => {
    const b = latest("bot_bank_alert")
    assert.match(b, /elsif n > 1 then[\s\S]{0,400}'status', 'ambiguous'/)
    assert.doesNotMatch(b, /order by \(x\.currency::text = cur\) desc, x\.created_at\s*limit 1/)
  })
  it("a tap books only a wallet that was offered, through the same checks", () => {
    const h = latest("bot_held_book")
    assert.match(h, /wallet_id := h\.choices -> p_idx ->> 'id'/)
    assert.match(h, /public\.khqr_record\(h\.workspace_id, link\.uid/)
    assert.match(h, /h\.chat_id is distinct from p_chat_id/)
    const rows = heldButtons("b7a12090-d9a5-481f-b639-437943ce5501", [{ id: "w", name: "ACLEDA ••6222" }])
    assert.deepEqual(parseHeldCallback(rows[0][0].callback_data), { id: "b7a12090-d9a5-481f-b639-437943ce5501", idx: 0 })
  })
  it("a held KHQR sale booked later never rings the SoundBox — a late chime would look like a new payment (founder, 14/10/2026)", () => {
    const held = src("lib/server/held-bot.ts")
    assert.doesNotMatch(held, /soundbox|sendPaymentVoice|sendSoundboxPush/i)
  })
  it("every caller handles the hold: the API, the bank group and the bank-alert chat", () => {
    assert.match(src("app/api/khqr/ingest/route.ts"), /r\.status === "ask"[\s\S]{0,300}askHeldKhqr/)
    assert.match(src("lib/server/biz-group-bot.ts"), /r\.status === "ask"[\s\S]{0,300}askHeldKhqr/)
    assert.match(src("lib/server/bank-alert-bot.ts"), /case "ambiguous":[\s\S]{0,200}askBankWallet/)
    assert.match(src("app/api/telegram/webhook/route.ts"), /isHeldCallback\(update\.callback_query\.data\)[\s\S]{0,250}handleHeldCallback/)
  })
})
