import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { GUIDE } from "@/lib/guide/content"

import { bestAnswer, classify, KIND_REPLY, KNOWLEDGE, QUICK_IDS, staffHours, wantsHuman } from "./knowledge"

describe("Helpline — answers only from approved knowledge (founder, 4/11/2026)", () => {
  it("every guide answer is in it word for word (one source), the quick chips all exist", () => {
    const guideCount = GUIDE.reduce((a, s) => a + s.items.length, 0)
    assert.ok(KNOWLEDGE.length >= guideCount)
    for (const s of GUIDE) for (const [i, item] of s.items.entries()) assert.deepEqual(KNOWLEDGE.find((k) => k.id === `${s.id}-${i}`)?.a, item.a)
    for (const id of QUICK_IDS) assert.ok(KNOWLEDGE.some((k) => k.id === id), id)
  })

  it("the common questions, Khmer and English, find their answer", () => {
    assert.equal(bestAnswer("PRO តម្លៃប៉ុន្មាន?")?.id, "plans-0")
    assert.equal(bestAnswer("how much is pro")?.id, "plans-0")
    assert.equal(bestAnswer("ខ្ញុំភ្លេចពាក្យសម្ងាត់")?.id, "forgot")
    assert.equal(bestAnswer("can't sign in")?.id, "forgot")
    assert.equal(bestAnswer("តើដកលុយបានទេ")?.id, "start-0")
    assert.equal(bestAnswer("ភ្ជាប់ telegram យ៉ាងម៉េច")?.id, "telegram")
    assert.equal(bestAnswer("ULTRA ជាអ្វី")?.id, "ultra")
  })

  it("never a guess: nothing that matches → null (a person answers instead)", () => {
    assert.equal(bestAnswer("សួស្តី"), null)
    assert.equal(bestAnswer("x"), null)
    assert.equal(bestAnswer("តើភ្លៀងថ្ងៃនេះទេ"), null)
  })

  it("selling: the plan answers carry «ជាវឥឡូវ»; a person when asked in so many words", () => {
    assert.equal(KNOWLEDGE.find((k) => k.id === "plans-0")?.action, "upgrade")
    assert.equal(KNOWLEDGE.find((k) => k.id === "ultra")?.action, "upgrade")
    assert.ok(wantsHuman("ចង់និយាយជាមួយមនុស្ស"))
    assert.ok(wantsHuman("talk to a human"))
    assert.ok(!wantsHuman("PRO តម្លៃប៉ុន្មាន"))
  })

  it("a person answers Monday to Friday, 08:00–17:00 in Phnom Penh (corrected from 24/7)", () => {
    assert.equal(staffHours(Date.parse("2026-11-04T08:00:00+07:00")), true) // Wednesday 08:00
    assert.equal(staffHours(Date.parse("2026-11-04T16:59:00+07:00")), true)
    assert.equal(staffHours(Date.parse("2026-11-04T17:00:00+07:00")), false)
    assert.equal(staffHours(Date.parse("2026-11-04T07:59:00+07:00")), false)
    assert.equal(staffHours(Date.parse("2026-11-07T10:00:00+07:00")), false) // Saturday
    assert.equal(staffHours(Date.parse("2026-11-08T10:00:00+07:00")), false) // Sunday
  })
})

describe("wired — the chat button in the app, behind the flag; the team gets what it can't answer", () => {
  it("never the person's money data, never on the support or advisor pages; a ticket for the team", async () => {
    const { readFileSync } = await import("node:fs")
    const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n")
    const chat = read("src/components/helpline/helpline-chat.tsx")
    assert.match(chat, /if \(!allowed \|\| pathname\.startsWith\("\/support"\) \|\| pathname\.startsWith\("\/advisor"\)\) return null/)
    assert.match(chat, /rpc\("submit_support_ticket"/)
    assert.doesNotMatch(chat, /useWallets|useTransactions|balance/) // no money data in the helpline
    assert.match(chat, /staffHours\(Date\.now\(\)\) \? T\.sentOpen : T\.sentClosed/)
    assert.match(read("src/app/(app)/layout.tsx"), /<HelplineChat \/>/)
    assert.match(read("supabase/migrations/20270292000000_helpline_flag.sql"), /\('helpline', 'ADMIN_ONLY'\)/)
  })
})

describe("On the subject only — off it, answered with respect as one team (founder, 4/11/2026)", () => {
  it("the kinds: an answer, a greeting, thanks, investment advice, on the subject without an answer, off the subject", () => {
    assert.equal(classify("PRO តម្លៃប៉ុន្មាន?").kind, "answer")
    assert.equal(classify("សួស្តី").kind, "greeting")
    assert.equal(classify("hello!").kind, "greeting")
    assert.equal(classify("អរគុណច្រើន").kind, "thanks")
    assert.equal(classify("គួរទិញមាសឥឡូវទេ?").kind, "advice")
    assert.equal(classify("should I buy bitcoin").kind, "advice")
    assert.equal(classify("ហេតុអ្វីរបាយការណ៍ខែនេះបង្ហាញខុស?").kind, "ontopic") // the app, no approved answer → a person
    assert.equal(classify("my shop's sales screen is slow").kind, "ontopic")
    assert.equal(classify("ថ្ងៃនេះភ្លៀងទេ?").kind, "offtopic")
    assert.equal(classify("who will win the football match").kind, "offtopic")
    assert.equal(classify("ច្រៀងចម្រៀងមួយឱ្យខ្ញុំស្តាប់").kind, "offtopic")
  })

  it("the courteous replies: «សូមអភ័យទោស», the team's voice, «លោកអ្នក», never advice, never a number or a joke", () => {
    assert.match(KIND_REPLY.offtopic.km, /^សូមអភ័យទោស ក្រុមការងារ អេប លុយឆ្លាត/)
    assert.match(KIND_REPLY.offtopic.km, /លោកអ្នក/)
    assert.match(KIND_REPLY.advice.km, /មិនមែនជាអ្នកប្រឹក្សាហិរញ្ញវត្ថុដែលមានអាជ្ញាប័ណ្ណទេ/)
    for (const r of Object.values(KIND_REPLY)) {
      assert.doesNotMatch(r.km + r.en, /\d/)
      assert.doesNotMatch(r.km, /កម្មវិធី|អែប/) // the brand, always «អេប លុយឆ្លាត»
    }
  })

  it("off the subject never reaches the team; only an on-topic question without an answer, or a person asked for", async () => {
    const { readFileSync } = await import("node:fs")
    const chat = readFileSync("src/components/helpline/helpline-chat.tsx", "utf8").replace(/\r\n/g, "\n")
    assert.match(chat, /if \(c\.kind === "ontopic"\) return setMsgs\(\(m\) => \[\.\.\.m, \{ from: "me", text: q \}, \{ from: "bot", text: L\(T\.unknown\), offerHuman: true \}\]\)/)
    assert.equal((chat.match(/offerHuman: true/g) ?? []).length, 2) // the on-topic unknown and a person asked for — nothing else
  })
})
