import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { FIQH_DISCLAIMER, FIQH_REFERRAL, fiqhBoundary, fiqhSystemPrompt, finishFiqhAnswer, REFER_MARKER } from "./fiqh-guard"

describe("The guarded Islamic reference assistant (founder, 19/10/2026)", () => {
  it("divorce, inheritance and sectarian questions are referred at once — in Khmer, English and Arabic", () => {
    for (const q of ["ប្ដីខ្ញុំចង់លែងលះ តើត្រូវធ្វើយ៉ាងណា?", "តាឡាក់បីដងក្នុងពេលតែមួយ", "Can I divorce my wife by text?", "what is talaq", "حكم الطلاق"]) assert.equal(fiqhBoundary(q), "talaq", q)
    for (const q of ["ចែកមរតកឪពុកយ៉ាងម៉េច?", "How are the heirs' shares split?", "inheritance of a daughter", "الميراث"]) assert.equal(fiqhBoundary(q), "inheritance", q)
    for (const q of ["តើស៊ីអះខុសទេ?", "Are Wahhabis right?", "Is Imam San a deviant group?", "តើអ៊ីម៉ាមសានជានិកាយអ្វី?", "is he a kafir"]) assert.equal(fiqhBoundary(q), "sectarian", q)
  })

  it("everyday questions go through: wudu, prayer, fasting, zakat, halal trade", () => {
    for (const q of ["តើយកទឹកសំយាំងរបៀបណា?", "How many rak'ahs is Maghrib?", "ភ្លេចហើយផឹកទឹកពេលបួស តើខូចបួសទេ?", "Is zakat due on gold jewellery?", "Can I sell on credit with a higher price?"]) {
      assert.equal(fiqhBoundary(q), null, q)
    }
  })

  it("the founder's referral, word for word (the app's spelling of «អ៊ីម៉ាម»)", () => {
    assert.equal(FIQH_REFERRAL.km, "បញ្ហានេះទាមទារការសម្រេចផ្ទាល់ពីគណៈអ៊ីម៉ាម ឬលោកគ្រូ។ សូមពិគ្រោះជាមួយអ្នកជំនាញច្បាប់សាសនាដោយផ្ទាល់។")
  })

  it("every reply ends with the disclaimer; the model's marker or a boundary topic in its answer becomes the referral", () => {
    const ok = finishFiqhAnswer("តាមមាសហាប់សាហ្វីអ៊ី វូឌូមានផ្នែកកាតព្វកិច្ចប្រាំមួយ។", "km")!
    assert.equal(ok.kind, "answer")
    assert.ok(ok.text.endsWith(FIQH_DISCLAIMER.km))
    const marker = finishFiqhAnswer(` ${REFER_MARKER} `, "km")!
    assert.deepEqual(marker, { kind: "referral", text: `${FIQH_REFERRAL.km}\n\n${FIQH_DISCLAIMER.km}` })
    assert.equal(finishFiqhAnswer("In divorce the waiting period is…", "en")!.kind, "referral")
    assert.ok(finishFiqhAnswer("Fajr is two rak'ahs.", "en")!.text.endsWith(FIQH_DISCLAIMER.en))
    assert.equal(finishFiqhAnswer(null, "en"), null)
    assert.equal(finishFiqhAnswer("  ", "en"), null)
  })

  it("the system prompt: a navigator not a Mufti, the Shafi'i school, sources only when certain, the marker", () => {
    const p = fiqhSystemPrompt("km")
    assert.match(p, /NOT a Mufti/)
    assert.match(p, /Never issue a fatwa/)
    assert.match(p, /Shafi'i school followed in Cambodia/)
    assert.match(p, /ONLY when you are certain of the reference\. Never invent or guess a reference/)
    assert.ok(p.includes(`reply with exactly ${REFER_MARKER}`))
    assert.match(p, /divorce \(talaq\), inheritance/)
    assert.match(p, /Answer in Khmer/)
    assert.match(fiqhSystemPrompt("en"), /Answer in English/)
  })

  it("the server asks the model only after the boundary check, with the key from the server's environment", () => {
    const server = readFileSync(join(process.cwd(), "src/lib/server/fiqh-assistant.ts"), "utf8")
    assert.ok(server.indexOf("if (fiqhBoundary(q))") < server.indexOf("await fetch(GEMINI_URL"))
    assert.match(server, /process\.env\.GEMINI_API_KEY/)
    assert.doesNotMatch(server, /NEXT_PUBLIC_/)
    assert.match(server, /return finishFiqhAnswer\(plain\(text\), locale\) \?\? unavailable/)
    const route = readFileSync(join(process.cwd(), "src/app/api/islamic/fiqh/route.ts"), "utf8")
    assert.match(route, /if \(!auth\.user\) return NextResponse\.json\(\{ error: "unauthorized" \}, \{ status: 401 \}\)/)
  })
})
