import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { presetFromWords } from "@/lib/bot/parse-entry"

import { looksLikeNote, mentionsChild, recentNoteText, savedCard } from "./entry-card"

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
    assert.equal(text, "✏️ បានបន្ថែមចំណាំ៖ «ចំណាយសំភារៈសិក្សាកូន» ទៅលើប្រតិបត្តិការ 51,500៛\n📁 ប្រភេទ៖ ការសិក្សា") // the founder's wording (Task #497)
  })
  it("the flow: a loan named first, then the recent-entry note, then the «no amount» hint; every saved card remembered", () => {
    const c = read("src/lib/server/bot-commands.ts")
    const fail = c.slice(c.indexOf("if (!parsed.ok) {"), c.indexOf("return reply(failureText(parsed, ws, lang))", c.indexOf("if (!parsed.ok) {")))
    assert.ok(fail.indexOf("paidDebtProposal") < fail.indexOf("noteOnRecentEntry"), "a named loan first")
    assert.ok(fail.indexOf("noteOnRecentEntry") < fail.indexOf("bot.voiceNoAmount"), "the note before the hint")
    assert.match(c, /await rememberCard\(chatId, savedTx\.id, cb\.message!\.message_id\)/)
    const s = read("src/lib/server/slip-bot.ts")
    assert.equal((s.match(/await rememberCard\(chatId, r\.tx_id, /g) ?? []).length, 3) // the zero-click card, the uncategorised one, the category tap (Task #497)
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

describe("A note about a child tags «👶 សម្រាប់កូន» (founder, 20/10/2026)", () => {
  it("the founder's words — and «កូន» inside words that are not a child does not count", () => {
    for (const t of ["ចំណាយសំភារៈសិក្សាកូន", "កូនតូច", "ទិញអាវកូនស្រី", "កូនប្រុសឈឺ", "នំកូនៗ", "ទឹកដោះគោទារក", "kid shoes", "baby milk", "for my child", "宝宝奶粉"]) assert.equal(mentionsChild(t), true, t)
    for (const t of ["ធ្វើកូនសោ", "សងកូនបំណុល", "ឈ្នួលកូនជាង", "ទិញកូនមាន់", "កាហ្វេ", "kidney beans", "babylon"]) assert.equal(mentionsChild(t), false, t)
  })
  it("both note paths tag it (the 5-minute follow-up and a reply to the card); the card turns it off in one tap", () => {
    const c = readFileSync(join(process.cwd(), "src/lib/server/bot-commands.ts"), "utf8")
    const s = readFileSync(join(process.cwd(), "src/lib/server/slip-bot.ts"), "utf8")
    for (const f of [c, s]) assert.match(f, /!r\.for_child && mentionsChild\(r\.user_note \?\? note\) \? \(await tagTransaction\(chatId, r\.tx_id, null, null, true\)\)\.data : null/)
    // The saved card's toggle: ✓ when on, and its tap sends K0 (off).
    const card = savedCard("km", "00000000-0000-0000-0000-000000000000", { amount: 1, currency: "KHR", wallet: "w", label: "l", food: false, subcategory: null, need_want: null, for_child: true, note: "កូន" })
    const buttons = card.reply_markup.inline_keyboard.flat()
    assert.ok(buttons.some((b) => b.text === "✓ 👶 សម្រាប់កូន" && b.callback_data.endsWith(":K0")))
  })
})

describe("The note right after a slip saved by a category tap (founder, 24/10/2026 — Task #497)", () => {
  it("regression: the 4,000 ៛ TIA parking slip — «ចំណតនៅព្រលានទទួលគ្រួសារមកពីយកូកុន», then «ចំណតឡាន», are notes", () => {
    for (const t of ["ចំណតនៅព្រលានទទួលគ្រួសារមកពីយកូកុន", "ចំណតឡាន"]) assert.ok(looksLikeNote(t), t)
    const s = read("src/lib/server/slip-bot.ts")
    const tap = s.slice(s.indexOf("export async function handleSlipCallback"), s.indexOf("async function handleWalletCallback"))
    assert.match(tap, /await tg\("editMessageText", \{ chat_id: chatId, message_id: cb\.message!\.message_id, \.\.\.card \}\)\n[^\n]*\n[^\n]*\n\s+if \(r\.tx_id\) await rememberCard\(chatId, r\.tx_id, cb\.message!\.message_id\)/)
    const text = recentNoteText("km", { note: "ចំណតឡាន", amount: 4000, currency: "KHR", category: null, preset: null })
    assert.equal(text.split("\n")[0], "✏️ បានបន្ថែមចំណាំ៖ «ចំណតឡាន» ទៅលើប្រតិបត្តិការ 4,000៛")
  })
  it("a second note within the 5 minutes is added, never replacing the first; the slip line stays last; the same text once", () => {
    const sql = read("supabase/migrations/20270256000000_recent_note_append.sql")
    assert.match(sql, /where s not like '🧾%' and btrim\(s\) <> '' and s <> clean;/)
    assert.match(sql, /set note = left\(concat_ws\(' · ', kept, clean, slip\), 500\)/)
    assert.match(sql, /created_at > now\(\) - interval '5 minutes'/)
  })
  it("the [📝 បន្ថែមចំណាំ] button still asks and takes a reply (text or voice)", () => {
    const s = read("src/lib/server/slip-bot.ts")
    assert.match(s, /async function askForNote\(chatId: number, txId: string, cardMsg: number/)
    assert.match(s, /export async function handleNoteReply\(chatId: number, replyTo: number, text: string, voice = false\)/)
  })
})

describe("A typed text corrects the voice note just heard (founder, 26/10/2026 — Task #507)", () => {
  const sql = read("supabase/migrations/20270261000000_voice_note_correction.sql")
  it("regression: «បាយព្រឹកកូនពៅ» after the 9,000 ៛ slip failed — the two enums are compared as text", () => {
    // «operator does not exist: public.category_type = public.transaction_type» — every note naming a category failed.
    assert.match(sql, /where workspace_id = t\.workspace_id and type::text = t\.type::text and preset_key = p_preset/)
    assert.doesNotMatch(sql, /and type = t\.type and/)
    assert.equal(presetFromWords("បាយព្រឹកកូនពៅ"), "food")
    assert.ok(looksLikeNote("បាយព្រឹកកូនពៅ"))
    assert.ok(mentionsChild("បាយព្រឹកកូនពៅ"))
  })
  it("a voice note is remembered on the card (both paths), and the next text replaces that heard part — never appended to it", () => {
    assert.match(sql, /alter table public\.bot_note_prompts add column if not exists voice_note text;/)
    assert.equal((sql.match(/set voice_note = case when coalesce\(p_voice, false\) then clean end,/g) ?? []).length, 2) // bot_tx_note_recent and bot_tx_note
    assert.match(sql, /corrected := not coalesce\(p_voice, false\) and pr\.voice_note is not null and pr\.voice_note <> clean/)
    assert.match(sql, /and s <> clean and not \(corrected and s = pr\.voice_note\);/)
    assert.match(sql, /grant execute on function public\.bot_tx_note_recent\(text, bigint, text, text, boolean\) to anon, authenticated;/)
    assert.match(sql, /grant execute on function public\.bot_tx_note\(text, bigint, bigint, text, boolean\) to anon, authenticated;/)
    // The 5 minutes count from the voice note (a slow typist is still in time).
    assert.match(sql, /created_at = case when coalesce\(p_voice, false\) and card_msg = message_id then now\(\) else created_at end/)
  })
  it("the bot passes who spoke: a voice reply to [📝], a voice note after a card; the reply is the founder's wording", () => {
    assert.match(read("src/app/api/telegram/webhook/route.ts"), /\(text\) => handleNoteReply\(chatId, replyTo, text, true\)/)
    assert.match(read("src/lib/server/slip-bot.ts"), /p_note: note, p_voice: voice \}\)/)
    assert.match(read("src/lib/server/bot-commands.ts"), /p_preset: presetFromWords\(note\), p_voice: voice \}\)/)
    const text = recentNoteText("km", { note: "បាយព្រឹកកូនពៅ", amount: 9000, currency: "KHR", category: "Food", preset: "food", corrected: true })
    assert.equal(text.split("\n")[0], "✏️ បានកែសម្រួលចំណាំជា៖ «បាយព្រឹកកូនពៅ» (ប្រតិបត្តិការ 9,000៛)")
    assert.match(recentNoteText("en", { note: "x y z", amount: 1, currency: "USD", category: null, preset: null, corrected: true }), /^✏️ Note corrected to: «x y z»/)
  })
})
