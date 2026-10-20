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

describe("The quiz lives in the app only — never in the Telegram channel (founder, 20/10/2026)", () => {
  it("regression: the 12:30 text teaser (no choices, read as clickbait) is gone — no slot, no kind, no send", async () => {
    const { ISLAMIC_KINDS, ISLAMIC_SCHEDULE } = await import("@/lib/islamic-channel")
    assert.ok(!(ISLAMIC_KINDS as readonly string[]).includes("ISLAMIC_QUIZ"))
    assert.ok(!("ISLAMIC_QUIZ" in ISLAMIC_SCHEDULE))
    const sp = readFileSync(join(process.cwd(), "src/lib/server/scheduled-posts.ts"), "utf8")
    assert.doesNotMatch(sp, /ISLAMIC_QUIZ|quizTeaser|sendPoll/)
    const mod = await import("./islamic-quiz")
    assert.ok(!("quizTeaserHtml" in mod) && !("quizTeaserButtons" in mod))
    assert.match(readFileSync(join(process.cwd(), "supabase/migrations/20270215000000_no_channel_quiz.sql"), "utf8"), /where kind = 'ISLAMIC_QUIZ' and status in \('PENDING', 'APPROVED'\)/)
  })
  it("the in-app card: /islamic?tab=quiz scrolls to it, on the Islamic hub", () => {
    assert.equal(QUIZ_APP_URL, "https://app.luychlat.com/islamic?tab=quiz")
    const card = readFileSync(join(process.cwd(), "src/components/islamic/quiz-card.tsx"), "utf8")
    assert.match(card, /get\("tab"\) === "quiz"/)
    assert.match(readFileSync(join(process.cwd(), "src/app/(app)/islamic/page.tsx"), "utf8"), /<IslamicQuizCard \/>/)
  })
})
