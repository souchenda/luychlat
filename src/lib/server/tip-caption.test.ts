import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { getChannelPostButtons } from "./channel-buttons"
import { postFooter } from "@/lib/post-footer"

import { tipCaption } from "./tip-bot"

describe("daily tip caption & the channel's buttons (poster branding)", () => {
  const caption = tipCaption({ title: "សន្សំ <៣០%> & ចំណាយ", body: "កុំចំណាយលើស ៧០% នៃចំណូល។" })
  it("ends with the standard footer (founder, 20/10/2026 — lib/post-footer.ts)", () => {
    assert.ok(caption.endsWith(postFooter("community")))
    assert.ok(caption.includes('<a href="https://t.me/luychlat_bot">Telegram Bot</a>')) // the inline link (HTML caption)
  })
  it("stays valid Telegram HTML (text escaped) and under the 1,024-character caption limit", () => {
    assert.match(caption, /សន្សំ &lt;៣០%&gt; &amp; ចំណាយ/)
    assert.ok(caption.length < 1024)
  })
  it("no URL buttons under a channel post (founder, 22/10/2026 — Task #454): the caption's footer already links the app and the bot", async () => {
    assert.deepEqual(await getChannelPostButtons(), {})
    // The links are in the text: «Android (APK) · iOS / Web · Telegram Bot».
    assert.ok(caption.includes('<a href="https://app.luychlat.com">iOS / Web</a>') && caption.includes('<a href="https://t.me/luychlat_bot">Telegram Bot</a>'))
    // No publisher builds its own channel keyboard with those two buttons.
    const dir = join(process.cwd(), "src/lib/server")
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts") && !x.endsWith(".test.ts"))) {
      // The code only (a comment may name the old buttons to explain why they are gone).
      const src = readFileSync(join(dir, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
      assert.doesNotMatch(src, /បើកប្រើ អេប លុយឆ្លាត ↗|កត់ត្រាតាម Telegram Bot ↗/, f)
    }
  })
})

describe("The daily tip's approval card — clean and thumb-friendly (founder, 21/10/2026)", () => {
  it("regression: «🔒 មិនផ្សាយទេ …» and «✏️ ចុច «កែអត្ថបទ» …» cluttered the card — gone; ✅ full width · ✏️ | 🔄 · ❌ full width", async () => {
    const { TIPS } = await import("@/lib/tips")
    const { previewCaption, previewKeyboard, tipSeriesTags } = await import("./tip-bot")
    const lib = TIPS.find((t) => !("ref" in t))!
    const tip = { day: "2099-01-01", tip_id: lib.id, title: lib.title.km, body: lib.body.km, poster_path: null, status: "DRAFT" as const, version: 1, previews: [] }
    const caption = previewCaption(tip, "2099-01-01", false)
    assert.doesNotMatch(caption, /🔒|មិនផ្សាយទេ ប្រសិនបើ|ជួរទី ១ = ចំណងជើង|ចុច «/)
    // The post itself is the last thing on the card (a series tip's footer carries its hashtag — tipSeriesTags).
    assert.ok(caption.endsWith(postFooter("community", "telegram", tipSeriesTags(lib.id))))
    const rows = previewKeyboard(tip, false)
    assert.deepEqual(rows.map((r) => r.map((b) => b.text)), [["✅ អនុម័ត (ផ្សាយម៉ោង ១២:០០ ថ្ងៃត្រង់)"], ["✏️ កែអត្ថបទ", "🔄 ប្តូរគន្លឹះថ្មី"], ["❌ ផ្អាកថ្ងៃនេះ"]])
    // An edited tip still says so (a warning, not an instruction).
    assert.match(previewCaption({ ...tip, title: "កែរួច" }, "2099-01-01", false), /⚠️ អត្ថបទត្រូវបានកែ ឬមិនទាន់ពេញលេញ — ពិនិត្យឱ្យបានល្អ។$/)
  })
})

describe("✏️ on the daily tip's card in «LCA Approval» (founder, 25/10/2026 — Task #503)", () => {
  const src = () => readFileSync(join(process.cwd(), "src/lib/server/tip-bot.ts"), "utf8").replace(/\r\n/g, "\n")
  it("regression: the popup sent Nuryerny to a private chat that held nothing — now the founder's words, and the text in her DM", async () => {
    const { TIP_EDIT_GROUP_HINT, TIP_EDIT_DM_SENT } = await import("./tip-bot")
    assert.equal(TIP_EDIT_GROUP_HINT, "✏️ ដើម្បីកែសម្រួល សូមចុច Reply លើសារកាតនេះក្នុងគ្រុប រួចវាយអត្ថបទថ្មីផ្ញើចូលជាការស្រេច។")
    assert.ok(`${TIP_EDIT_GROUP_HINT}\n${TIP_EDIT_DM_SENT}`.length <= 190, "fits Telegram's popup")
    const s = src()
    assert.doesNotMatch(s, /សូមកែក្នុងសារឯកជនជាមួយ bot ឬក្នុងអេប/)
    assert.match(s, /const dm = cb\.from\?\.id \? await askInPrivate\(cb\.from\.id, current\) : false/)
    assert.match(s, /"អត្ថបទបច្ចុប្បន្ន \(ចម្លងយកទៅកែបាន\)៖",\n\s+t\.title,\n\s+t\.body,/)
    assert.match(s, /\{ chat: userId, msg: sent\.result\.message_id, prompt: true, at: Date\.now\(\), open: true \}/)
  })
  it("the new text: an approver's reply to the card in the group, or the next DM within 15 min (once) — never applied before ✅", () => {
    const s = src()
    assert.match(s, /if \(group\) \{\s+const \{ data: ok \} = group\.from \? await db\.rpc\("bot_is_approver", \{ p_key: botKey\(\), p_tg: group\.from \}\) : \{ data: false \}\s+if \(ok !== true\) return false/)
    assert.match(s, /p\.chat === chatId && p\.prompt && p\.open && p\.at && Date\.now\(\) - p\.at < TIP_EDIT_DM_MINUTES \* 60_000/)
    assert.match(s, /p === prompt \? \{ \.\.\.p, open: false \} : p/) // once
    assert.match(s, /await db\.rpc\("bot_tip_set_pending", \{ p_key: botKey\(\), p_day: day, p_pending: \{ title, body \} \}\)/) // a proposal, ✅ / ❌ first
    const w = readFileSync(join(process.cwd(), "src/app/api/telegram/webhook/route.ts"), "utf8")
    assert.match(w, /await handleTipReply\(message\.chat\.id, message\.reply_to_message\.message_id, message\.text, \{ from: message\.from\?\.id \}\)/)
    assert.match(w, /if \(!message\.reply_to_message && !menuCommand\(message\.text\) && \(await handleTipEditText\(chatId, message\.text\)\)\)/)
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/20270259000000_bot_is_approver.sql"), "utf8")
    assert.match(sql, /tip_chat_super_admin\(p_tg\) is not null\s+or exists \(select 1 from public\.content_approvers a where a\.telegram_user_id = p_tg and a\.active\)/)
  })
})
