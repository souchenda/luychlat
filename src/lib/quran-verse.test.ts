import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { beforeEach, describe, it } from "node:test"

import { getQuranVerse, getQuranVerses, resetQuranCache } from "@/lib/server/quran-verses"

import { quranRefOf, verseCitation, type QuranEncVerse } from "./quran-verse"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
// QuranEnc's own answers for 1:1–7, 2:255 and 112:1–4 (khmer_cambodia), saved unmodified.
const fixture = JSON.parse(read("tests/fixtures/quranenc-khmer_cambodia.json")) as { version: string; suras: Record<string, { verses: QuranEncVerse[] }> }

/** QuranEnc as the fixture answers it; counts every call. */
function fakeQuranEnc() {
  const calls: string[] = []
  const fetch = async (url: string) => {
    calls.push(url)
    if (url.includes("/translations/list/km")) return new Response(JSON.stringify({ translations: [{ key: "khmer_cambodia", version: fixture.version }] }))
    const sura = /\/khmer_cambodia\/(\d+)/.exec(url)?.[1] ?? ""
    return new Response(JSON.stringify({ result: fixture.suras[sura]?.verses ?? [] }))
  }
  return { fetch, calls }
}

describe("The official Khmer translation for Islamic posts (founder, 22/10/2026 — Task #460)", () => {
  beforeEach(() => resetQuranCache())
  it("Al-Fatihah 1:1–7, Ayat al-Kursi 2:255, Al-Ikhlas 112:1–4 — QuranEnc's text exactly, Arabic and Khmer", async () => {
    const q = fakeQuranEnc()
    const fatihah = await getQuranVerses(1, 1, 7, { fetch: q.fetch })
    assert.equal(fatihah?.length, 7)
    assert.deepEqual(fatihah!.map((v) => v.ayaNumber), [1, 2, 3, 4, 5, 6, 7])
    for (const v of fatihah!) {
      const row = fixture.suras["1"].verses.find((r) => Number(r.aya) === v.ayaNumber)!
      assert.equal(v.khmer, row.translation.trim()) // unmodified
      assert.equal(v.arabic, row.arabic_text.trim())
    }
    const kursi = await getQuranVerse(2, 255, { fetch: q.fetch })
    assert.equal(kursi?.suraName, "Al-Baqarah")
    assert.equal(kursi?.khmer, fixture.suras["2"].verses[0].translation.trim())
    assert.equal(kursi!.arabic, fixture.suras["2"].verses[0].arabic_text.trim())
    const ikhlas = await getQuranVerses(112, 1, 4, { fetch: q.fetch })
    assert.deepEqual(ikhlas!.map((v) => v.khmer), fixture.suras["112"].verses.map((r) => r.translation.trim()))
    assert.match(ikhlas![0].khmer, /អល់ឡោះ/)
  })
  it("a surah is read once and held; the version is asked once a day; a new version clears what is held", async () => {
    const q = fakeQuranEnc()
    await getQuranVerse(112, 1, { fetch: q.fetch, now: 0 })
    await getQuranVerse(112, 4, { fetch: q.fetch, now: 1000 })
    assert.equal(q.calls.filter((u) => u.includes("/sura/")).length, 1)
    assert.equal(q.calls.filter((u) => u.includes("/translations/list")).length, 1)
    assert.match(q.calls.find((u) => u.includes("/sura/"))!, new RegExp(`\\?v=${fixture.version.replace(/\./g, "\\.")}$`))
  })
  it("never a partial or invented quotation: a missing verse, a bad number, QuranEnc down → null (the post keeps its link)", async () => {
    const q = fakeQuranEnc()
    assert.equal(await getQuranVerses(2, 254, 255, { fetch: q.fetch }), null) // 254 not given → no quotation at all
    assert.equal(await getQuranVerse(115, 1, { fetch: q.fetch }), null)
    assert.equal(await getQuranVerse(112, 5, { fetch: q.fetch }), null) // Al-Ikhlas has 4 verses
    resetQuranCache()
    const down = async () => {
      throw new Error("network")
    }
    assert.equal(await getQuranVerse(112, 1, { fetch: down }), null)
  })
  it("the founder's citation and a lesson's link read back", () => {
    assert.equal(verseCitation(2, 255), "(ស៊ូរ៉ាត់ Al-Baqarah : អាយ៉ាត់ 255)")
    assert.equal(verseCitation(62, 9, 10), "(ស៊ូរ៉ាត់ Al-Jumu'ah : អាយ៉ាត់ 9–10)")
    assert.deepEqual(quranRefOf("https://quran.com/62/9-10"), { sura: 62, from: 9, to: 10 })
    assert.deepEqual(quranRefOf("https://quran.com/2/255"), { sura: 2, from: 255, to: 255 })
    assert.equal(quranRefOf("https://sunnah.com/tirmidhi:747"), null)
    assert.equal(quranRefOf("https://quran.com/112/9"), null) // no such verse
  })
  it("wired: the daily lesson and Jumu'ah quote the verse from QuranEnc — only when the caption still fits; the caption shows it before the source", () => {
    const sp = read("src/lib/server/scheduled-posts.ts")
    assert.match(sp, /return withVerse\(islamicPostContent\(kind, day,/)
    assert.match(sp, /if \(c\.kind !== "ISLAMIC_DAILY" && c\.kind !== "ISLAMIC_JUMUAH"\) return c/)
    assert.match(sp, /const verses = await getQuranVerses\(ref\.sura, ref\.from, ref\.to\)\s*if \(!verses\) return c/)
    assert.match(sp, /return caption\.endsWith\(footer\) && caption\.length <= PHOTO_CAPTION_LIMIT \? withV : c/)
    assert.match(read("src/lib/islamic-channel.ts"), /\.\.\.\(c\.verse \? \["", `«\$\{esc\(c\.verse\.khmer\)\}»`, esc\(c\.verse\.citation\)\] : \[\]\),\s*"",\s*`📖 ប្រភព៖/)
  })
})
