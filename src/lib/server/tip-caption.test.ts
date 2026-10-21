import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { CHANNEL_APP_BUTTON, CHANNEL_BOT_BUTTON } from "./channel-buttons"
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
  it("the buttons", () => {
    assert.equal(CHANNEL_BOT_BUTTON, "🤖 កត់ត្រាតាម Telegram ↗")
    assert.equal(CHANNEL_APP_BUTTON, "📱 បើកក្នុងអេប លុយឆ្លាត ↗")
  })
})

describe("The daily tip's approval card — clean and thumb-friendly (founder, 21/10/2026)", () => {
  it("regression: «🔒 មិនផ្សាយទេ …» and «✏️ ចុច «កែអត្ថបទ» …» cluttered the card — gone; ✅ full width · ✏️ | 🔄 · ❌ full width", async () => {
    const { TIPS } = await import("@/lib/tips")
    const { previewCaption, previewKeyboard } = await import("./tip-bot")
    const lib = TIPS.find((t) => !("ref" in t))!
    const tip = { day: "2099-01-01", tip_id: lib.id, title: lib.title.km, body: lib.body.km, poster_path: null, status: "DRAFT" as const, version: 1, previews: [] }
    const caption = previewCaption(tip, "2099-01-01", false)
    assert.doesNotMatch(caption, /🔒|មិនផ្សាយទេ ប្រសិនបើ|ជួរទី ១ = ចំណងជើង|ចុច «/)
    assert.ok(caption.endsWith(postFooter("community"))) // the post itself is the last thing on the card
    const rows = previewKeyboard(tip, false)
    assert.deepEqual(rows.map((r) => r.map((b) => b.text)), [["✅ អនុម័ត (ផ្សាយម៉ោង ១២:០០ ថ្ងៃត្រង់)"], ["✏️ កែអត្ថបទ", "🔄 ប្តូរគន្លឹះថ្មី"], ["❌ ផ្អាកថ្ងៃនេះ"]])
    // An edited tip still says so (a warning, not an instruction).
    assert.match(previewCaption({ ...tip, title: "កែរួច" }, "2099-01-01", false), /⚠️ អត្ថបទត្រូវបានកែ ឬមិនទាន់ពេញលេញ — ពិនិត្យឱ្យបានល្អ។$/)
  })
})
