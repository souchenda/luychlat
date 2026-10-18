import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { channelFor, ISLAMIC_KINDS } from "./islamic-channel"
import { ISLAMIC_QUIZZES, quizOfDay, quizPollBody, quizPreviewText } from "./islamic-quiz"
import { plannedIslamicPosts } from "./scheduled-posts"

/** Telegram counts UTF-16 code units. */
const len = (s: string) => s.length

describe("@LuyChlatIslamic quiz polls (founder, 18/10/2026)", () => {
  it("every quiz fits Telegram's limits: question ≤ 300, each of 4 answers ≤ 100, explanation ≤ 200", () => {
    for (const q of ISLAMIC_QUIZZES) {
      const body = quizPollBody("@LuyChlatIslamic", q)
      assert.ok(len(body.question) <= 300, `${q.id} question ${len(body.question)}`)
      assert.equal(body.options.length, 4, q.id)
      for (const o of body.options) assert.ok(len(o.text) >= 1 && len(o.text) <= 100, `${q.id} option «${o.text}»`)
      assert.ok(len(q.explanation) <= 200, `${q.id} explanation ${len(q.explanation)}`)
      assert.ok(q.correct >= 0 && q.correct <= 3)
      assert.equal(new Set(q.options).size, 4, `${q.id}: answers must differ`)
    }
  })
  it("every quiz names its exact source (Quran.com or sunnah.com) and cites it in the explanation", () => {
    for (const q of ISLAMIC_QUIZZES) {
      assert.match(q.source.url, /^https:\/\/(quran\.com\/\d+\/\d+|sunnah\.com\/[a-z]+:\d+)$/, q.id)
      assert.ok(q.explanation.includes(q.source.label), `${q.id}: «${q.source.label}» in the explanation`)
    }
    assert.equal(new Set(ISLAMIC_QUIZZES.map((q) => q.id)).size, ISLAMIC_QUIZZES.length)
  })
  it("a native quiz: type quiz, the correct answer's index, anonymous (channel polls are)", () => {
    const q = ISLAMIC_QUIZZES[0]
    const body = quizPollBody("@LuyChlatIslamic", q)
    assert.equal(body.type, "quiz")
    assert.equal(body.correct_option_id, q.correct)
    assert.equal(body.is_anonymous, true)
    assert.equal(body.explanation, q.explanation)
  })
  it("the founder's preview marks the correct answer ✅ and shows the explanation and source", () => {
    const q = ISLAMIC_QUIZZES[0]
    const text = quizPreviewText(q)
    assert.ok(text.includes(`✅ ខ. ${q.options[1]}`))
    assert.ok(text.includes(q.source.url))
  })
  it("Tuesday and Saturday at 12:00, to the Islamic channel only; the same quiz for a day, walking through the bank", () => {
    const quiz = (day: string, min: number) => plannedIslamicPosts(day, min, () => null).some((p) => p.kind === "ISLAMIC_QUIZ")
    assert.ok(quiz("2026-10-20", 11 * 60 + 20)) // Tuesday
    assert.ok(quiz("2026-10-24", 11 * 60 + 20)) // Saturday
    assert.ok(!quiz("2026-10-21", 11 * 60 + 20)) // Wednesday
    assert.ok(ISLAMIC_KINDS.includes("ISLAMIC_QUIZ"))
    assert.equal(channelFor("ISLAMIC_QUIZ"), "islamic")
    assert.equal(quizOfDay("2026-10-20").id, quizOfDay("2026-10-20").id)
    assert.notEqual(quizOfDay("2026-10-20").id, quizOfDay("2026-10-24").id)
  })
  it("published with sendPoll through the approved Islamic channel; the database accepts the kind", () => {
    const sp = readFileSync(join(process.cwd(), "src/lib/server/scheduled-posts.ts"), "utf8")
    assert.match(sp, /tg<\{ message_id: number \}>\("sendPoll", quizPollBody\(chat, quizOfDay\(String\(row\.payload\.day\)\)\)\)/)
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/20270175000000_islamic_quiz_posts.sql"), "utf8")
    assert.match(sql, /'ISLAMIC_QUIZ'/)
  })
})
