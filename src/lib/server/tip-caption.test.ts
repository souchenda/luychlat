import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { CHANNEL_APP_BUTTON, CHANNEL_BOT_BUTTON } from "./channel-buttons"
import { tipCaption } from "./tip-bot"

describe("daily tip caption & the channel's buttons (poster branding)", () => {
  const caption = tipCaption({ title: "សន្សំ <៣០%> & ចំណាយ", body: "កុំចំណាយលើស ៧០% នៃចំណូល។" })
  it("ends with the poster's line and the signature", () => {
    assert.ok(caption.endsWith("📱 កត់ត្រាចំណូលចំណាយ រហ័សជាមួយ អេប លុយឆ្លាត\n\n— លុយឆ្លាត · LuyChlat"))
    assert.doesNotMatch(caption, /@luychlat_bot/)
  })
  it("stays valid Telegram HTML (text escaped) and under the 1,024-character caption limit", () => {
    assert.match(caption, /សន្សំ &lt;៣០%&gt; &amp; ចំណាយ/)
    assert.ok(caption.length < 1024)
  })
  it("the buttons", () => {
    assert.equal(CHANNEL_BOT_BUTTON, "🤖 កត់ត្រាតាម Telegram ↗")
    assert.equal(CHANNEL_APP_BUTTON, "📱 បើកកម្មវិធី ↗")
  })
})
