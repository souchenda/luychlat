import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { APP_LINKS, compactFooter, hashtagLines, PHOTO_CAPTION_LIMIT, postFooter, withFooter } from "./post-footer"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

describe("The standard post footer (founder, 20–21/10/2026 — the Charge+ format, compact)", () => {
  it("the community footer on Telegram, word for word: the three ways in ONE line of inline links (HTML)", () => {
    assert.equal(
      postFooter("community"),
      [
        "📲 ប្រើប្រាស់ អេប លុយឆ្លាត ដោយឥតគិតថ្លៃ៖",
        '<a href="https://app.luychlat.com/LuyChlat.apk">Android (APK)</a> || <a href="https://app.luychlat.com">iOS / Web</a> || <a href="https://t.me/luychlat_bot">Telegram Bot</a>',
        "",
        "👉 ចូលរួមសហគមន៍ ៖ @LuyChlatCommunity",
        "#LuyChlat #អេបលុយឆ្លាត",
        "#គ្រប់គ្រងហិរញ្ញវត្ថុ", // its own line: never broken in two on an iPhone (21/10/2026)
      ].join("\n"),
    )
    assert.deepEqual(APP_LINKS.map((l) => l.url), ["https://app.luychlat.com/LuyChlat.apk", "https://app.luychlat.com", "https://t.me/luychlat_bot"])
  })
  it("regression: four lines of bare URLs looked cluttered next to Charge+ — the links on one line, no raw URL on Telegram", () => {
    for (const channel of ["community", "islamic"] as const) {
      const f = postFooter(channel)
      assert.equal(f.split("\n").length, 6) // the links line, the channel and two short hashtag lines
      const visible = f.replace(/<a href="[^"]+">([^<]+)<\/a>/g, "$1")
      assert.doesNotMatch(visible, /app\.luychlat\.com|https?:|t\.me\//, channel) // only link labels are seen
    }
  })
  it("the Islamic footer: the Islamic channel and Islamic hashtags — never the general community", () => {
    const f = postFooter("islamic")
    assert.match(f, /👉 ឆាណែលឥស្លាម ៖ @LuyChlatIslamic/)
    assert.match(f, /\n#LuyChlat #LuyChlatIslamic\n#អេបលុយឆ្លាត #ហិរញ្ញវត្ថុហាឡាល់$/) // #LuyChlat too (founder, 21/10/2026)
    assert.doesNotMatch(f, /LuyChlatCommunity|សហគមន៍|#គ្រប់គ្រងហិរញ្ញវត្ថុ/)
  })
  it("regression: «#អេរលុយឆ្លាត» (រ for ប) was reported — the brand hashtag is «#អេបលុយឆ្លាត» in every footer and every source", () => {
    for (const channel of ["community", "islamic"] as const)
      for (const platform of ["telegram", "facebook"] as const) assert.match(postFooter(channel, platform), /#អេបលុយឆ្លាត(\s|$)/)
    const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : /\.(ts|tsx)$/.test(f) ? [join(d, f)] : []))
    for (const f of walk(join(process.cwd(), "src"))) if (!f.endsWith("post-footer.test.ts") && !f.endsWith("post-footer.ts")) assert.ok(!readFileSync(f, "utf8").includes("អេរលុយឆ្លាត"), f)
  })
  it("on Facebook (no inline links): one line of names with short addresses; the handles are t.me links", () => {
    const f = postFooter("community", "facebook")
    assert.ok(f.includes("Android (APK): app.luychlat.com/LuyChlat.apk || iOS / Web: app.luychlat.com || Telegram Bot: t.me/luychlat_bot"))
    assert.match(f, /👉 ចូលរួមសហគមន៍ ៖ t\.me\/LuyChlatCommunity/)
    assert.doesNotMatch(f, /@|<a /)
  })
  it("the plain-text posts now go as HTML: the words escaped, the footer's links intact (edited caption, money dilemma)", () => {
    const sp = read("src/lib/server/scheduled-posts.ts")
    assert.match(sp, /const tgText = footer \? withFooter\(esc\(words\), footer\("telegram"\), png \? 1024 : 4096\) : esc\(words\)/)
    assert.match(sp, /sendPosterPhoto\(chat, png, tgText, \{ reply_markup: buttons\.reply_markup \}\)\) \?\? \(await sentText\(tgText, true\)\)\) : await sentText\(tgText, true\)/)
    assert.match(sp, /const text = withFooter\(esc\(dilemmaPostText\(d\)\), postFooter\("community"\), 4096\)/)
    assert.match(sp, /sendPosterPhoto\(chat, png, text, \{ reply_markup: buttons\.reply_markup \}\)\) \?\? \(await sentText\(text, true\)\)\) : await sentText\(text, true\)/)
    assert.doesNotMatch(sp, /esc\(tgText\)|esc\(text\)/) // never the footer's HTML escaped
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
    assert.match(sp, /withFooter\(esc\(dilemmaPostText\(d\)\), postFooter\("community"\), 4096\)/)
    const national = sp.slice(sp.indexOf('if (row.kind === "NATIONAL_DAY") {\n      // The commemoration poster'), sp.indexOf('if (row.kind === "ISLAMIC_BULLETIN")'))
    assert.doesNotMatch(national, /postFooter/)
    // The 12:00 tip: the community footer, plus its series' hashtag when it has one («Smart Spending», 21/10/2026).
    assert.match(read("src/lib/server/tip-bot.ts"), /postFooter\("community", "telegram", tipSeriesTags\(t\.tip_id\)\)/)
    assert.match(read("src/lib/server/facebook-publisher.ts"), /postFooter\("community", "facebook"\)/)
  })
})

describe("Hashtags never broken on a phone (founder, 21/10/2026)", () => {
  it("regression: «#គ្រប់គ្រងហិរញ្ញវត្ថុ» split in two on an iPhone — tags packed in lines of at most 34 characters, each whole", () => {
    assert.deepEqual(hashtagLines(["#LuyChlat", "#អេបលុយឆ្លាត", "#គ្រប់គ្រងហិរញ្ញវត្ថុ"]), ["#LuyChlat #អេបលុយឆ្លាត", "#គ្រប់គ្រងហិរញ្ញវត្ថុ"])
    assert.deepEqual(hashtagLines(["@LuyChlatIslamic", "#LuyChlatIslamic", "#អេបលុយឆ្លាត", "#ហិរញ្ញវត្ថុហាឡាល់"]), ["@LuyChlatIslamic #LuyChlatIslamic", "#អេបលុយឆ្លាត #ហិរញ្ញវត្ថុហាឡាល់"])
    for (const f of [postFooter("community"), postFooter("islamic"), postFooter("community", "facebook"), compactFooter("islamic")])
      for (const line of f.split("\n").filter((l) => l.startsWith("#") || l.startsWith("@"))) assert.ok(line.length <= 34, line)
    // The tags keep their own characters (an invisible joiner would end the hashtag link).
    assert.doesNotMatch(postFooter("community"), /[​-‍⁠﻿]/)
  })
})
