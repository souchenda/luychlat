import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { drawCard, drawOutcome, isErpDrawCallback, parseDrawCallback } from "./erp-draw-card"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")
const card = drawCard({ amount: 500, currency: "USD", date: "2026-10-26", reference: "OE-14-v1-aba-USD", source: "ABA DL USD", personal: "ABA Bank", token: "0a1b2c3d4e" })

describe("The owner's draw from DL Staff waits for the founder's ✅ (founder, 26/10/2026 — Task #521, Option B)", () => {
  it("the card: amount, date, source account, the Personal wallet, the ERP reference; it says nothing changes until ✅", () => {
    assert.equal(
      card.text.split("\n\n")[0],
      ["🙋‍♂️ ម្ចាស់ដកចាយពី DL Staff", "💵 $500.00", "📅 26/10/2026", "🏦 ពីគណនី៖ ABA DL USD", "👛 ចូល៖ ABA Bank (ផ្ទាល់ខ្លួន)", "🔖 ERP #OE-14-v1-aba-USD"].join("\n"),
    )
    assert.match(card.text, /^បង ទទួលប្រាក់នេះចូលកាបូបផ្ទាល់ខ្លួនទេ\?/m)
    assert.doesNotMatch(card.text, /លោក|[០-៩]/) // «បង», digits 0-9 (CLAUDE.md)
  })
  it("the founder's two buttons, one per row; the callback fits Telegram's 64 bytes", () => {
    assert.deepEqual(card.reply_markup.inline_keyboard, [
      [{ text: "✅ យល់ព្រមទទួលចូលកាបូបផ្ទាល់ខ្លួន", callback_data: "ed:a:0a1b2c3d4e" }],
      [{ text: "❌ បដិសេធ", callback_data: "ed:r:0a1b2c3d4e" }],
    ])
    for (const b of card.reply_markup.inline_keyboard.flat()) assert.ok(Buffer.byteLength(b.callback_data) <= 64)
    assert.deepEqual([parseDrawCallback("ed:a:0a1b2c3d4e"), parseDrawCallback("ed:r:0a1b2c3d4e")], [{ approve: true, token: "0a1b2c3d4e" }, { approve: false, token: "0a1b2c3d4e" }])
    for (const bad of ["ed:x:0a1b2c3d4e", "ed:a:ZZZ", "ed:a:0a1b2c3d4e0", "sa:a:0a1b2c3d4e", undefined]) assert.equal(isErpDrawCallback(bad), false, String(bad))
  })
  it("what replaces the buttons: received, refused (the business keeps its draw), already decided, voided by DL Staff", () => {
    assert.equal(drawOutcome({ status: "approved", amount: 500, currency: "USD", wallet: "ABA Bank" }), "✅ បានទទួល $500.00 ចូល ABA Bank រួចហើយ")
    assert.equal(drawOutcome({ status: "rejected", amount: 40000, currency: "KHR" }), "❌ បានបដិសេធ — DL MEAT SUPPLY នៅតែកត់ការដក 40,000៛ ប៉ុន្តែគ្មានប្រាក់ចូលកាបូបផ្ទាល់ខ្លួនទេ")
    assert.equal(drawOutcome({ status: "already", state: "approved" }), "✅ បានទទួលចូលកាបូបផ្ទាល់ខ្លួនរួចហើយ")
    assert.match(drawOutcome({ status: "voided" }), /DL Staff បានលុប/)
  })
})

describe("The database decides: pending first, the owner only, once (Task #521)", () => {
  const sql = read("supabase/migrations/20270266000000_erp_draw_approval.sql")
  const apply = sql.slice(sql.indexOf("create or replace function public.erp_sync_apply"), sql.indexOf("create or replace function public.erp_draw_decide"))
  const decide = sql.slice(sql.indexOf("create or replace function public.erp_draw_decide"))
  it("the ERP's draw never writes the Personal wallet by itself any more: pending, a token, the owner's private chat", () => {
    assert.doesNotMatch(apply, /draw_of\)\s*\n?\s*values/) // no mirror insert in erp_sync_apply
    assert.match(apply, /draw_status := 'pending_approval';/)
    assert.match(apply, /select l\.chat_id into v_chat from public\.telegram_links l where l\.user_id = ws\.user_id;/)
    assert.match(apply, /case when v_token is not null then 'pending' end, v_token\);/)
  })
  it("erp_draw_decide: the business's owner from his own chat; once; a voided draw answers «voided»", () => {
    assert.match(decide, /if link\.uid is null or ws\.id is null or link\.uid <> ws\.user_id then raise exception 'not_owner'/)
    assert.match(decide, /if ev\.voided_at is not null then return jsonb_build_object\('status', 'voided'/)
    assert.match(decide, /if ev\.draw_state <> 'pending' then\n\s+return jsonb_build_object\('status', 'already'/)
  })
  it("✅ → the mirror into the Personal wallet configured now (re-checked); ❌ → none, the business entry flagged for the audit", () => {
    assert.match(decide, /pws\.type <> 'PERSONAL' or pws\.user_id <> ws\.user_id or pw\.currency <> t\.currency/)
    assert.match(decide, /set draw_state = 'approved', draw_decided_at = now\(\), mirror_id = mirror/)
    assert.match(decide, /'🚫 មិនទទួលចូលកាបូបផ្ទាល់ខ្លួន'/)
    const reject = decide.slice(decide.indexOf("if not p_approve then"), decide.indexOf("-- The Personal wallet as configured NOW"))
    assert.doesNotMatch(reject, /insert into public\.transactions/)
  })
  it("wired: the route sends the card and keeps the founder's chat and the token out of the ERP's answer; the webhook routes the taps", () => {
    const route = read("src/app/api/integrations/erp-sync/route.ts")
    assert.match(route, /if \(r\.draw === "pending_approval" && r\.draw_token && r\.currency\) \{\n\s+await sendDrawCard\(r\.owner_chat,/)
    assert.match(route, /const \{ owner_chat: _chat, draw_token: _token, \.\.\.answer \} = r/)
    assert.match(route, /NextResponse\.json\(\{ ok: true, \.\.\.answer \}/)
    assert.match(read("src/app/api/telegram/webhook/route.ts"), /\} else if \(isErpDrawCallback\(update\.callback_query\.data\)\) \{\n[^\n]*\n\s+await handleErpDrawCallback\(update\.callback_query\)/)
    const bot = read("src/lib/server/erp-draw-bot.ts")
    assert.match(bot, /if \(!parsed \|\| !chatId \|\| cb\.message\?\.chat\.type !== "private"\) return answer\(\)/) // his private chat only
  })
})
