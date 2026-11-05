import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { siteContact, siteEntry, siteLang, siteQuestion, siteQuick, siteReply } from "./site"
import { KNOWLEDGE } from "./knowledge"

describe("the helpline on luychlat.com — the app's approved knowledge for visitors (founder, 5/11/2026)", () => {
  it("Khmer, else English (Chinese readers get English: the knowledge is km / en)", () => {
    assert.equal(siteLang("km"), "km")
    assert.equal(siteLang("zh"), "en")
    assert.equal(siteLang(undefined), "en")
  })

  it("an app screen becomes a link into the app; «upgrade» becomes the website's prices", () => {
    const tg = siteEntry(KNOWLEDGE.find((k) => k.id === "telegram")!, "km")
    assert.deepEqual(tg.link, { href: "https://app.luychlat.com/settings", label: "បើកការកំណត់" })
    assert.deepEqual(siteEntry(KNOWLEDGE.find((k) => k.id === "ultra")!, "en").link, { href: "https://luychlat.com/en/#pricing", label: "See the prices" })
    assert.equal(siteQuick("km").length, 6)
  })

  it("the same on-the-subject rules as the app: an answer, a courteous word, never advice, the team only when on topic", () => {
    const a = siteReply("ភ្លេចពាក្យសម្ងាត់", "km")
    assert.equal(a.kind, "answer")
    assert.ok(a.kind === "answer" && a.entry.id === "forgot" && a.more.every((m) => m.id !== "forgot"))
    assert.equal(siteReply("សួស្តី", "km").kind, "greeting")
    assert.equal(siteReply("should I buy bitcoin?", "en").kind, "advice")
    const off = siteReply("who won the football yesterday", "en")
    assert.equal(off.kind, "offtopic")
    assert.ok(!("offerHuman" in off)) // off the subject: never sent to the team
    const on = siteReply("my bank slip upload shows an error", "en")
    assert.equal(on.kind, "ontopic")
    assert.equal(siteReply("I want to talk to a real person", "en").kind, "human")
  })

  it("a way to reach the visitor: a Cambodian phone or a Telegram username — nothing else", () => {
    assert.equal(siteContact("012 345 678"), "012345678")
    assert.equal(siteContact("+855 96 123 4567"), "0961234567")
    assert.equal(siteContact("@sok_dara"), "@sok_dara")
    assert.equal(siteContact("sok_dara"), "@sok_dara")
    assert.equal(siteContact("12345"), null)
    assert.equal(siteContact("hello there"), null)
    assert.equal(siteContact(42), null)
  })

  it("the question: one paragraph, at most 1,000 characters, never empty", () => {
    assert.equal(siteQuestion("  a\n\nb  c "), "a b c")
    assert.equal(siteQuestion("x".repeat(1200))!.length, 1000)
    assert.equal(siteQuestion("  "), null)
  })
})
