import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import {
  answerQuestion,
  dailyQuizSet,
  EMPTY_PROGRESS,
  ISLAMIC_QUIZZES,
  progressFor,
  QUIZ_APP_URL,
  QUIZ_SET_SIZE,
  quizTeaserButtons,
  quizTeaserHtml,
  scoreOf,
} from "./islamic-quiz"

const D1 = "2026-10-19"
const D2 = "2026-10-20"
const D4 = "2026-10-22"

/** Play a whole day's set: `right` answers correct, the rest wrong. */
function play(p: typeof EMPTY_PROGRESS, day: string, right: number) {
  const set = dailyQuizSet(day)
  let s = progressFor(p, day)
  set.forEach((q, i) => (s = answerQuestion(s, day, set, q.id, i < right ? q.correct : (q.correct + 1) % 4)))
  return s
}

describe("In-app Islamic Quiz Challenge — the bank (founder, 18/10/2026)", () => {
  it("15–20 questions over fasting, Zakat, Salat and halal trade; four different answers each", () => {
    assert.ok(ISLAMIC_QUIZZES.length >= 15 && ISLAMIC_QUIZZES.length <= 20, String(ISLAMIC_QUIZZES.length))
    assert.deepEqual([...new Set(ISLAMIC_QUIZZES.map((q) => q.topic))].sort(), ["fasting", "salat", "trade", "zakat"])
    for (const q of ISLAMIC_QUIZZES) {
      assert.equal(new Set(q.options).size, 4, q.id)
      assert.ok(q.correct >= 0 && q.correct <= 3, q.id)
    }
    assert.equal(new Set(ISLAMIC_QUIZZES.map((q) => q.id)).size, ISLAMIC_QUIZZES.length)
  })
  it("every question names its exact source (Quran.com or sunnah.com) and cites it in the explanation", () => {
    for (const q of ISLAMIC_QUIZZES) {
      assert.match(q.source.url, /^https:\/\/(quran\.com\/\d+\/\d+|sunnah\.com\/[a-z]+:\d+)$/, q.id)
      assert.ok(q.explanation.includes(q.source.label), `${q.id}: «${q.source.label}»`)
    }
  })
})

describe("In-app quiz — the day's set, the score and the streak", () => {
  it("five questions a day, the same for everyone, different the next day, the whole bank over a few days", () => {
    assert.equal(dailyQuizSet(D1).length, QUIZ_SET_SIZE)
    assert.deepEqual(dailyQuizSet(D1).map((q) => q.id), dailyQuizSet(D1).map((q) => q.id))
    assert.notDeepEqual(dailyQuizSet(D1).map((q) => q.id), dailyQuizSet(D2).map((q) => q.id))
    const seen = new Set(Array.from({ length: 8 }, (_, i) => dailyQuizSet(new Date(Date.UTC(2026, 9, 19 + i)).toISOString().slice(0, 10))).flat().map((q) => q.id))
    assert.equal(seen.size, ISLAMIC_QUIZZES.length)
  })
  it("the first answer counts (no changing it); the score counts the right ones", () => {
    const set = dailyQuizSet(D1)
    let p = progressFor(null, D1)
    p = answerQuestion(p, D1, set, set[0].id, set[0].correct)
    p = answerQuestion(p, D1, set, set[0].id, (set[0].correct + 1) % 4) // ignored
    assert.equal(p.answers[set[0].id], set[0].correct)
    assert.equal(scoreOf(p, set), 1)
    assert.equal(answerQuestion(p, D1, set, "not-today", 0), p) // a question from another day: ignored
  })
  it("streak: +1 for each consecutive day the set is finished; a missed day starts again at 1", () => {
    let p = play(EMPTY_PROGRESS, D1, 5)
    assert.equal(p.streak, 1)
    assert.equal(scoreOf(p, dailyQuizSet(D1)), 5)
    p = play(p, D2, 2) // the streak counts playing, not perfect scores
    assert.equal(p.streak, 2)
    assert.equal(p.best, 2)
    assert.equal(progressFor(p, D4).streak, 0) // D3 missed
    p = play(p, D4, 3)
    assert.equal(p.streak, 1)
    assert.equal(p.best, 2)
  })
  it("a new day clears yesterday's answers but keeps the streak alive", () => {
    const p = play(EMPTY_PROGRESS, D1, 4)
    const next = progressFor(p, D2)
    assert.deepEqual(next.answers, {})
    assert.equal(next.streak, 1)
  })
})

describe("The channel's 12:30 teaser — a button into the app, no poll", () => {
  it("[ 🎮 ចូលលេងក្នុងអេបឥឡូវនេះ ] → https://app.luychlat.com/islamic?tab=quiz", () => {
    assert.deepEqual(quizTeaserButtons(), { inline_keyboard: [[{ text: "🎮 ចូលលេងក្នុងអេបឥឡូវនេះ", url: "https://app.luychlat.com/islamic?tab=quiz" }]] })
    assert.equal(QUIZ_APP_URL, "https://app.luychlat.com/islamic?tab=quiz")
  })
  it("the teaser names today's topics and the first question, short", () => {
    const html = quizTeaserHtml(D1)
    assert.ok(html.includes("ល្បងប្រាជ្ញាច្បាប់សាសនា"))
    assert.ok(html.includes(dailyQuizSet(D1)[0].question))
    assert.ok(html.length < 900)
  })
  it("published as a text message with that button (never sendPoll); the in-app card reads ?tab=quiz", () => {
    const sp = readFileSync(join(process.cwd(), "src/lib/server/scheduled-posts.ts"), "utf8")
    const quiz = sp.slice(sp.indexOf('if (row.kind === "ISLAMIC_QUIZ") {'), sp.indexOf("if (islamic) {", sp.indexOf('if (row.kind === "ISLAMIC_QUIZ") {')))
    assert.match(quiz, /"sendMessage"/)
    assert.match(quiz, /reply_markup: quizTeaserButtons\(\)/)
    assert.doesNotMatch(sp, /sendPoll/)
    const card = readFileSync(join(process.cwd(), "src/components/islamic/quiz-card.tsx"), "utf8")
    assert.match(card, /get\("tab"\) === "quiz"/)
    assert.match(readFileSync(join(process.cwd(), "src/app/(app)/islamic/page.tsx"), "utf8"), /<IslamicQuizCard \/>/)
  })
})
