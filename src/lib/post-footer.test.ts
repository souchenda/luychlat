import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { PHOTO_CAPTION_LIMIT, postFooter, withFooter } from "./post-footer"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

describe("The standard post footer (founder, 20/10/2026 — the Charge+ format)", () => {
  it("the community footer on Telegram, word for word", () => {
    assert.equal(
      postFooter("community"),
      [
        "📲 ប្រើប្រាស់ អេប លុយឆ្លាត ដោយឥតគិតថ្លៃ៖",
        "👉 Android (APK) ៖ app.luychlat.com/LuyChlat.apk",
        "👉 iPhone / Web ៖ app.luychlat.com",
        "👉 Telegram Bot ៖ @luychlat_bot",
        "",
        "👉 ចូលរួមសហគមន៍ ៖ @LuyChlatCommunity",
        "#LuyChlat #អេបលុយឆ្លាត #គ្រប់គ្រងហិរញ្ញវត្ថុ",
      ].join("\n"),
    )
  })
  it("the Islamic footer: the Islamic channel and Islamic hashtags — never the general community", () => {
    const f = postFooter("islamic")
    assert.match(f, /👉 ឆាណែលឥស្លាម ៖ @LuyChlatIslamic/)
    assert.match(f, /#LuyChlatIslamic #អេបលុយឆ្លាត #ហិរញ្ញវត្ថុហាឡាល់/)
    assert.doesNotMatch(f, /LuyChlatCommunity|សហគមន៍|#គ្រប់គ្រងហិរញ្ញវត្ថុ/)
  })
  it("on Facebook the handles are t.me links (a «@» is not a link there)", () => {
    const f = postFooter("community", "facebook")
    assert.match(f, /👉 Telegram Bot ៖ t\.me\/luychlat_bot/)
    assert.match(f, /👉 ចូលរួមសហគមន៍ ៖ t\.me\/LuyChlatCommunity/)
    assert.doesNotMatch(f, /@/)
  })
  it("below the caption when both fit Telegram's 1,024-character photo caption — else the caption alone, never cut", () => {
    assert.equal(withFooter("Hello", "F"), "Hello\n\nF")
    const long = "ក".repeat(PHOTO_CAPTION_LIMIT - 5)
    assert.equal(withFooter(long, postFooter("community")), long)
  })
  it("the posts that carry it — and not the royal / national commemorations, the Sil days or the market feeds", () => {
    const sp = read("src/lib/server/scheduled-posts.ts")
    assert.match(sp, /withFooter\(islamicCaptionHtml\(c\), postFooter\("islamic"\)\)/)
    assert.match(sp, /withFooter\(morningText\(day\), postFooter\("community"\)\)/)
    assert.match(sp, /withFooter\(holidayPostHtml\(m\), postFooter\("community"\)\)/)
    assert.match(sp, /withFooter\(dilemmaPostText\(d\), postFooter\("community"\), 4096\)/)
    const national = sp.slice(sp.indexOf('if (row.kind === "NATIONAL_DAY") {\n      // The commemoration poster'), sp.indexOf('if (row.kind === "ISLAMIC_BULLETIN")'))
    assert.doesNotMatch(national, /postFooter/)
    assert.match(read("src/lib/server/tip-bot.ts"), /postFooter\("community"\)/)
    assert.match(read("src/lib/server/facebook-publisher.ts"), /postFooter\("community", "facebook"\)/)
  })
})
