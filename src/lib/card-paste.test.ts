import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { FAST_HADITH, islamicCaptionHtml, islamicPostContent } from "./islamic-channel"
import { pastedCardBody } from "./scheduled-posts"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

describe("Yerny's fasting correction and the pasted card (founder, 21/10/2026)", () => {
  it("the Monday / Thursday reminder quotes the hadith in Yerny's verified wording", () => {
    assert.equal(
      FAST_HADITH,
      "អំពើល្អទាំងឡាយត្រូវបានលើកយកទៅបង្ហាញនៅថ្ងៃច័ន្ទ និងថ្ងៃព្រហស្បតិ៍ ហើយខ្ញុំចង់ឱ្យអំពើល្អរបស់ខ្ញុំត្រូវបានលើកយកទៅបង្ហាញ ខណៈពេលដែលខ្ញុំកំពុងតមអាហារ។",
    )
    for (const day of ["2026-10-21", "2026-10-18"]) {
      const caption = islamicCaptionHtml(islamicPostContent("ISLAMIC_FAST", day, { day: 10, month: 5, year: 1448 }))
      assert.ok(caption.includes(`ហើយមានប្រសាសន៍ថា «${FAST_HADITH}»`), day)
      assert.doesNotMatch(caption, /អំពើរបស់មនុស្សត្រូវបានបង្ហាញនៅថ្ងៃទាំងពីរនេះ/)
      assert.match(caption, /Jami' at-Tirmidhi 747/) // the source stays
    }
  })

  it("a card pasted back without swiping to reply: its body, without the card's own lines", () => {
    const pasted = ["📢 គោលដៅផ្សាយ៖ [ ✈️ @LuyChlatIslamic ]", "👀 មើលជាមុន · រំលឹកបួសស៊ុណ្ណះ (ច័ន្ទ / ព្រហស្បតិ៍)", "", "🌙 រំលឹក…", "កែរួច។", "", "(✏️ បានកែសម្រួលដោយ @someone ម៉ោង ១៩:០០)"].join("\n")
    assert.equal(pastedCardBody(pasted), "🌙 រំលឹក…\nកែរួច។")
    assert.equal(pastedCardBody(pasted.replace("📢", "📣")), "🌙 រំលឹក…\nកែរួច។") // the founder's 📣 too
    assert.equal(pastedCardBody("សួស្តី — just chatting"), null) // an ordinary message is never an edit
    assert.equal(pastedCardBody("📢 គោលដៅផ្សាយ៖ [ x ]\n👀 មើលជាមុន · y"), null) // nothing left to save
  })

  it("wired: a non-reply text in the group goes to the latest waiting card in that chat, with the reply's approver check", () => {
    const hook = read("src/app/api/telegram/webhook/route.ts")
    assert.match(hook, /if \(message\.text && !message\.reply_to_message\) \{[\s\S]*?editLatestCardByPaste\(message\.chat\.id, message\.from\?\.id, editor, message\.text\)/)
    const sp = read("src/lib/server/scheduled-posts.ts")
    assert.match(sp, /export async function editLatestCardByPaste[\s\S]*?filter\(\(p\) => p\.chat === chatId\)[\s\S]*?editCardByReply\(chatId, Math\.max\(\.\.\.cards\), actor, editor, body\)/)
  })
})
