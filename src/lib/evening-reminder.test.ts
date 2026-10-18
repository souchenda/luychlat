import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { eveningButtons, eveningHtml, eveningLines } from "./evening-reminder"

describe("20:00 reminder — short, a different one each day of the week", () => {
  it("Monday 12/10/2026 … Sunday 18/10/2026: the day's own lines", () => {
    assert.equal(eveningLines("2026-10-12")[0], "🌙 រំលឹកចុងថ្ងៃ • ចន្ទ")
    assert.equal(eveningLines("2026-10-15")[0], "🌙 រំលឹកចុងថ្ងៃ • ព្រហស្បតិ៍")
    assert.equal(eveningLines("2026-10-18")[0], "🌙 រំលឹកចុងថ្ងៃ • អាទិត្យ")
  })
  it("never the same two nights running; seven different reminders", () => {
    const week = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18", "2026-10-19"].map((d) => eveningLines(d).join("\n"))
    for (let i = 1; i < week.length; i++) assert.notEqual(week[i], week[i - 1])
    assert.equal(new Set(week.slice(0, 7)).size, 7)
  })
  it("three lines, the title bold; HTML-safe; the brand never misspelt", () => {
    const html = eveningHtml("2026-10-14")
    assert.equal(html.split("\n").length, 3)
    assert.match(html, /^<b>🌙 រំលឹកចុងថ្ងៃ • ពុធ<\/b>\n/)
    for (let d = 12; d <= 18; d++) assert.doesNotMatch(eveningHtml(`2026-10-${d}`), /អែប|កម្មវិធី/)
  })
})

describe("the 20:00 post's button to the bot (founder, 18/10/2026)", () => {
  it("one inline URL button «🤖 ចុចទីនេះដើម្បីបិទបញ្ជី» → https://t.me/luychlat_bot", () => {
    assert.deepEqual(eveningButtons(), { inline_keyboard: [[{ text: "🤖 ចុចទីនេះដើម្បីបិទបញ្ជី", url: "https://t.me/luychlat_bot" }]] })
  })
  it("the publisher sends the 20:00 post as text with that keyboard", () => {
    const sp = readFileSync(join(process.cwd(), "src/lib/server/scheduled-posts.ts"), "utf8")
    const evening = sp.slice(sp.indexOf('if (row.kind === "EVENING") {', sp.indexOf("async publish(row)")), sp.indexOf('if (row.kind === "SPOTLIGHT") {', sp.indexOf("async publish(row)")))
    assert.match(evening, /tg<\{ message_id: number \}>\("sendMessage", \{/)
    assert.match(evening, /text: eveningText\(String\(row\.payload\.day\)\)/)
    assert.match(evening, /reply_markup: eveningButtons\(\)/)
    assert.doesNotMatch(evening, /sendPosterPhoto/) // light text, no poster
  })
})

