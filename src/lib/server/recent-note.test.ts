import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { presetFromWords } from "@/lib/bot/parse-entry"

import { looksLikeNote, recentNoteText } from "./entry-card"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")

describe("A follow-up note on the entry just recorded (founder, 20/10/2026)", () => {
  it("regression: «ចំណាយសំភារៈសិក្សាកូន» after an ABA slip got «រកមិនឃើញចំនួនទឹកប្រាក់ទេ» — it is a note, and names education", () => {
    assert.ok(looksLikeNote("ចំណាយសំភារៈសិក្សាកូន"))
    assert.equal(presetFromWords("ចំណាយសំភារៈសិក្សាកូន"), "education")
    assert.equal(presetFromWords("ទិញម្ហូបនៅផ្សារ"), "food")
    assert.equal(presetFromWords("ចាក់សាំង"), "transport")
    assert.equal(presetFromWords("សម្រាប់ម៉ាក់"), null) // no category named → only the note
    assert.equal(presetFromWords("ប្រាក់ខែ"), null) // an income word never moves an expense
    assert.equal(presetFromWords("ប្រាក់ខែ", "INCOME"), "salary")
  })
  it("not a note: thanks, yes, greetings, a question, a command, too short", () => {
    for (const t of ["អរគុណ", "អរគុណច្រើន!", "ok", "👍", "បាទ", "ចាស", "hi", "សួស្តី", "thanks", "តើខ្ញុំចាយប៉ុន្មាន?", "/help", "ab"]) assert.equal(looksLikeNote(t), false, t)
  })
  it("the reply: the founder's words — the note, the amount, the category", () => {
    const text = recentNoteText("km", { note: "ចំណាយសំភារៈសិក្សាកូន", amount: 51500, currency: "KHR", category: "Education", preset: "education" })
    assert.equal(text, "✅ បានបន្ថែមចំណាំ៖ «ចំណាយសំភារៈសិក្សាកូន» លើប្រតិបត្តិការ 51,500៛ រួចរាល់!\n📁 ប្រភេទ៖ ការសិក្សា")
  })
  it("the flow: a loan named first, then the recent-entry note, then the «no amount» hint; every saved card remembered", () => {
    const c = read("src/lib/server/bot-commands.ts")
    const fail = c.slice(c.indexOf("if (!parsed.ok) {"), c.indexOf("return reply(failureText(parsed, ws, lang))", c.indexOf("if (!parsed.ok) {")))
    assert.ok(fail.indexOf("paidDebtProposal") < fail.indexOf("noteOnRecentEntry"), "a named loan first")
    assert.ok(fail.indexOf("noteOnRecentEntry") < fail.indexOf("bot.voiceNoAmount"), "the note before the hint")
    assert.match(c, /await rememberCard\(chatId, savedTx\.id, cb\.message!\.message_id\)/)
    const s = read("src/lib/server/slip-bot.ts")
    assert.equal((s.match(/await rememberCard\(chatId, r\.tx_id, /g) ?? []).length, 2) // the zero-click card and the uncategorised one
    // [📝 បន្ថែមចំណាំ] under the zero-click slip card, and kept after a category change.
    assert.match(s, /const note = \[\{ text: tr\(lang, t\.note \? "bot\.noteBtnEdit" : "bot\.noteBtn"\), callback_data: `st:\$\{txId\}:T` \}\]/)
    assert.match(s, /inline_keyboard: \[row, note\]/)
    assert.match(s, /inline_keyboard: \[row, \[\{ text: tr\(lang, noted \? "bot\.noteBtnEdit" : "bot\.noteBtn"\), callback_data: `st:\$\{txId\}:T` \}\]\]/)
  })
  it("the database: the newest card of the last 5 minutes, the linked user's own entry, the category by its preset in the entry's workspace", () => {
    const sql = read("supabase/migrations/20270233000000_recent_tx_note.sql")
    assert.match(sql, /where chat_id = p_chat_id and card_msg = message_id and created_at > now\(\) - interval '5 minutes'\n   order by created_at desc limit 1;/)
    assert.match(sql, /t := public\.bot_own_recent_tx\(p_chat_id, pr\.tx_id\);/)
    assert.match(sql, /where workspace_id = t\.workspace_id and type = t\.type and preset_key = p_preset/)
    assert.match(sql, /grant execute on function public\.bot_tx_note_recent\(text, bigint, text, text\) to anon, authenticated;/)
  })
})
