import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { BANNED_IN_ISLAMIC_FILES, BANNED_TERMS } from "@/lib/islamic/glossary"
import { ISLAMIC_QUIZZES } from "@/lib/islamic-quiz"

import { LESSON_MODULES, LESSONS, lessonById, lessonsInModule, publishedLessons, quizzesFor, readMinutes, type Lesson } from "./lessons-data"

describe("Islamic bitesize lessons (founder, 19/10/2026)", () => {
  it("four modules in order: aqidah, wudu and salat, fasting, halal business and zakat — each with lessons", () => {
    assert.deepEqual(
      LESSON_MODULES.map((m) => m.id),
      ["aqidah", "salat", "fasting", "halal-business"],
    )
    assert.deepEqual(
      LESSON_MODULES.map((m) => m.order),
      [1, 2, 3, 4],
    )
    for (const m of LESSON_MODULES) assert.ok(lessonsInModule(m.id).length >= 2, m.id)
    assert.equal(new Set(LESSONS.map((l) => l.id)).size, LESSONS.length)
    assert.equal(lessonById("zakat-calculation")?.module, "halal-business")
    assert.equal(lessonById("nope"), null)
  })

  it("each lesson: a title, Khmer and English paragraphs side by side, a short read (3 minutes at most)", () => {
    for (const l of LESSONS) {
      assert.ok(l.title.km && l.title.en, l.id)
      assert.ok(l.body.km.length >= 4 && l.body.km.length === l.body.en.length, `${l.id}: paragraphs`)
      for (const locale of ["km", "en"] as const) {
        const minutes = readMinutes(l, locale)
        assert.ok(minutes >= 1 && minutes <= 3, `${l.id} ${locale}: ${minutes} min`)
      }
    }
  })

  it("every source is a Quran verse (quran.com) or a numbered hadith (sunnah.com) — never an unnumbered claim", () => {
    for (const l of LESSONS) {
      assert.ok(l.citations.length >= 1, l.id)
      for (const c of l.citations) {
        if (c.kind === "quran") assert.match(c.url, /^https:\/\/quran\.com\/\d{1,3}\/\d{1,3}$/, `${l.id}: ${c.label}`)
        else assert.match(c.url, /^https:\/\/sunnah\.com\/(bukhari|muslim|abudawud|tirmidhi|nasai|ibnmajah):\d+$/, `${l.id}: ${c.label}`)
        assert.match(c.label, /\d/)
      }
    }
  })

  it("the quiz links point to real quiz questions, and a lesson's quiz shares its sources", () => {
    for (const l of LESSONS) {
      for (const id of l.quizIds) assert.ok(ISLAMIC_QUIZZES.some((q) => q.id === id), `${l.id} → ${id}`)
      assert.equal(quizzesFor(l).length, l.quizIds.length)
    }
    const zakat = lessonById("zakat-calculation")!
    for (const q of quizzesFor(zakat)) assert.ok(zakat.citations.some((c) => c.label === q.source.label), q.id)
    assert.ok(LESSONS.filter((l) => l.quizIds.length > 0).length >= 6)
  })

  it("nothing is shown before a local Imam or teacher has read it", () => {
    assert.deepEqual(publishedLessons(), LESSONS.filter((l) => l.reviewedBy))
    const reviewed: Lesson = { ...LESSONS[0], reviewedBy: "Imam …, Masjid …, 20/10/2026" }
    assert.deepEqual(publishedLessons([reviewed, LESSONS[1]]), [reviewed])
    assert.deepEqual(publishedLessons([{ ...LESSONS[0], reviewedBy: "  " }]), [])
  })

  it("the glossary's spellings: no banned or machine-translated term", () => {
    const text = JSON.stringify(LESSONS) + JSON.stringify(LESSON_MODULES)
    for (const { term } of [...BANNED_TERMS, ...BANNED_IN_ISLAMIC_FILES]) assert.ok(!text.includes(term), term)
    assert.ok(!/កម្មវិធី|អែប/.test(text)) // the brand is «អេប លុយឆ្លាត»
  })
})
