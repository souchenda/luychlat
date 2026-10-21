import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { NATIONAL_DAYS, royalNumerals } from "@/lib/calendar/cambodia-holidays"
import { fuelCaption, newPricesText } from "@/lib/fuel-post"
import { islamicCaptionHtml, islamicPostContent } from "@/lib/islamic-channel"
import { keepsKhmerDigits, outgoingPayload, outgoingText, withKhmerDigits } from "@/lib/server/numerals"

import { latinCanvas, latinForm, latinMarkup, latinPayload } from "./numerals"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

describe("International numerals on the channel, the posters and the bot (founder, 21/10/2026 — Task #440)", () => {
  it("a Telegram payload: the message, caption, poll, buttons and an edited photo's caption in 0-9; callback data and ids untouched", () => {
    const out = latinPayload({
      chat_id: -100123,
      text: "⏰ សាហួរ ៖ ០៤:២៣ · ស្រាយបួស ៖ ១៧:៤១ · សាំង ៥,០៥០ ៛",
      caption: "២១ តុលា ២០២៦ · ១០ ជុម៉ាដាល់អូឡា ១៤៤៨ ហ.ស.",
      question: "តើ ៣ ឬ ៤?",
      options: ["១", { text: "២" }],
      media: { type: "photo", caption: "Tirmidhi ៧៤៧" },
      reply_markup: { inline_keyboard: [[{ text: "✅ អនុម័ត (ផ្សាយម៉ោង ០៧:០០ ព្រឹក)", callback_data: "sp:a:៤២" }]] },
    })
    assert.equal(out.text, "⏰ សាហួរ ៖ 04:23 · ស្រាយបួស ៖ 17:41 · សាំង 5,050 ៛")
    assert.equal(out.caption, "21 តុលា 2026 · 10 ជុម៉ាដាល់អូឡា 1448 ហ.ស.")
    assert.deepEqual([out.question, out.options, out.media], ["តើ 3 ឬ 4?", ["1", { text: "2" }], { type: "photo", caption: "Tirmidhi 747" }])
    assert.deepEqual(out.reply_markup, { inline_keyboard: [[{ text: "✅ អនុម័ត (ផ្សាយម៉ោង 07:00 ព្រឹក)", callback_data: "sp:a:៤២" }]] })
    assert.equal(out.chat_id, -100123)
    assert.deepEqual(latinMarkup({ keyboard: [["១ ២"], [{ text: "៣" }]] }), { keyboard: [["1 2"], [{ text: "3" }]] })
  })
  it("a photo upload (sendPhoto / editMessageMedia): its caption, keyboard and media JSON", () => {
    const form = new FormData()
    form.append("caption", "⛽ ៥,០៥០ ៛")
    form.append("reply_markup", JSON.stringify({ inline_keyboard: [[{ text: "២០:០០", url: "https://t.me/x" }]] }))
    form.append("chat_id", "-100")
    latinForm(form)
    assert.deepEqual([form.get("caption"), form.get("reply_markup"), form.get("chat_id")], ["⛽ 5,050 ៛", '{"inline_keyboard":[[{"text":"20:00","url":"https://t.me/x"}]]}', "-100"])
  })
  it("a poster's canvas draws and measures 0-9 (patched once)", () => {
    const drawn: string[] = []
    const ctx = { fillText: (...a: [string, number, number]) => void drawn.push(`f:${a[0]}`), strokeText: (...a: [string, number, number]) => void drawn.push(`s:${a[0]}`), measureText: (t: string) => ({ width: t.length, t }) }
    latinCanvas(latinCanvas(ctx)).fillText("០៤:២៣", 0, 0)
    ctx.strokeText("២០២៦", 0, 0)
    assert.deepEqual(drawn, ["f:04:23", "s:2026"])
    assert.deepEqual(ctx.measureText("៥,០៥០ ៛"), { width: 7, t: "5,050 ៛" })
  })
  it("everyday posts leave in 0-9: the fasting reminder, the fuel notice — as the channel receives them", () => {
    const fast = outgoingText(islamicCaptionHtml(islamicPostContent("ISLAMIC_FAST", "2026-10-18", { day: 7, month: 5, year: 1448 })))
    assert.match(fast, /• សាហួរ \(អ៊ឹមសាក់\) ៖ 04:23 ទៀបភ្លឺ/)
    assert.match(fast, /Tirmidhi 747/)
    assert.doesNotMatch(fast, /[០-៩]/)
    const fuel = outgoingPayload({ caption: fuelCaption(newPricesText({ regular: 5050, diesel: 5550, from: "2026-10-21", to: "2026-11-01" }, { regular: 5350, diesel: 5550 }, 36200), "telegram") })
    assert.doesNotMatch(String(fuel.caption), /[០-៩]/)
    assert.match(String(fuel.caption), /5,050/)
    assert.match(String(fuel.caption), /សម្រាប់ថ្ងៃទី 21 ខែតុលា ដល់ 01 ខែវិច្ឆិកា ឆ្នាំ 2026 \(អនុវត្តចាប់ពីម៉ោង 1 រសៀល\)/)
  })
  it("the single exception: the royal and national commemorations keep the Khmer numerals — nothing else", () => {
    const keep = (key: string) => royalNumerals(NATIONAL_DAYS.find((d) => d.key === key)!)
    for (const key of ["coronation", "independence", "constitution-day", "king-birthday", "water-festival", "victory-day"]) assert.equal(keep(key), true, key)
    for (const key of ["new-year", "labor-day", "visak-bochea", "khmer-new-year"]) assert.equal(keep(key), false, key)
    for (const d of NATIONAL_DAYS.filter((x) => x.kind === "islamic" || x.kind === "chinese" || x.kind === "international")) assert.equal(royalNumerals(d), false, d.key)
    assert.equal(keepsKhmerDigits(), false)
    assert.equal(withKhmerDigits(() => outgoingText("ថ្ងៃទី ២៩ តុលា")), "ថ្ងៃទី ២៩ តុលា")
    assert.deepEqual(withKhmerDigits(() => outgoingPayload({ text: "៩ វិច្ឆិកា" })), { text: "៩ វិច្ឆិកា" })
    assert.equal(outgoingText("ថ្ងៃទី ២៩ តុលា"), "ថ្ងៃទី 29 តុលា")
  })
  it("wired: every Telegram call and upload, the Page, every poster but the commemorations', the scheduler's royal scope", () => {
    assert.match(read("src/lib/server/telegram-bot.ts"), /payload = outgoingPayload\(payload\)\n[\s\S]{0,400}?\n {2}try \{\n {4}const res = await fetch\(`https:\/\/api\.telegram\.org/)
    const server = readdirSync(join(process.cwd(), "src/lib/server")).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    for (const f of server) {
      const src = read(`src/lib/server/${f}`)
      // Every direct upload to Telegram (outside tg) sends a converted form.
      for (const m of src.matchAll(/fetch\(`https:\/\/api\.telegram\.org\/bot[^`]*`, \{[\s\S]{0,200}?body: (\w+(?:\(\w+\))?)/g)) if (f !== "telegram-bot.ts") assert.equal(m[1], "outgoingForm(form)", f)
      // Every poster canvas draws 0-9 — the commemorations through royalNumerals; bill-ocr only reads pixels.
      if (/getContext\("2d"\)/.test(src) && f !== "bill-ocr.ts") assert.match(src, /latinCanvas\(|numerals\(d, canvas\.getContext\("2d"\)\)/, f)
    }
    const fb = read("src/lib/server/facebook-publisher.ts")
    assert.match(fb, /form\.set\("caption", outgoingText\(caption\)\)/)
    assert.match(fb, /form\.set\("message", outgoingText\(message\)\)/)
    assert.match(read("src/lib/server/national-day-poster.ts"), /const numerals = \(d: NationalDay, ctx: SKRSContext2D\) => \(royalNumerals\(d\) \? ctx : latinCanvas\(ctx\)\)/)
    const sp = read("src/lib/server/scheduled-posts.ts")
    assert.match(sp, /scope: \(row, fn\) => \(royalRow\(row\) \? withKhmerDigits\(fn\) : fn\(\)\)/)
    for (const fn of ["sendPreviews", "refresh", "publishTaken", "remindFounder"]) assert.match(sp, new RegExp(`const ${fn} = \\(row: PostRow[^)]*\\) =>\\s*scoped\\(row,`), fn)
    assert.match(sp, /edited = await scoped\(row, \(\) => r\.editInPlace\(row, \(\) => d\.publish\(row\)\)\)/) // an update, inside the same scope
  })
})
