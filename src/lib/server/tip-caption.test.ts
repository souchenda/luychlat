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
    // The links are in the text: «Android (APK) || iOS / Web || Telegram Bot».
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
