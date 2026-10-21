// The Islamic hub's wording (founder, 18/10/2026): «ស្រាយបួស» (never «បើកបួស»), «អ៊ឹមសាក់», the founder's
// spellings of the prayers and tabs, and the Arabic beside them; the fasting evidence cites real sources.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { dictionaries } from "../src/lib/i18n/dictionaries"
import { FASTING_HADITHS, FASTING_VERSES, fastingRuling, formatHijri, ISLAMIC_ARABIC, SUNNAH_FAST_HADITH, toHijri } from "../src/lib/islamic"
import { islamicCaptionHtml, islamicPostContent } from "../src/lib/islamic-channel"

const km = dictionaries.km as Record<string, string>
const all = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8")

describe("Islamic hub — the founder's terms", () => {
  it("«ស្រាយបួស», never «បើកបួស», anywhere in the Khmer copy", () => {
    assert.equal(km["fasting.iftar"], "ស្រាយបួស")
    assert.equal(km["fasting.iftarIn"], "ស្រាយបួសក្នុង {time}")
    assert.equal(km["fasting.imsak"], "អ៊ឹមសាក់")
    for (const f of ["lib/i18n/dictionaries.ts", "lib/duas.ts", "lib/scripture.ts"]) assert.ok(!all(f).includes("បើកបួស"), f)
  })
  it("tabs and prayers in the founder's spelling, each with its Arabic", () => {
    assert.deepEqual(
      ["prayer", "tasbih", "duas", "quran", "finance", "qibla"].map((k) => km[`islamic.tab.${k}`]),
      ["ម៉ោងសឡាត", "តេសប៊ីស", "ឌុអា", "គម្ពីរគូអាន", "ហ្សាកាត់", "គីបឡា"],
    )
    assert.deepEqual(["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"].map((k) => km[`prayer.${k}`]), ["ស៊ុពហ៍", "ថ្ងៃរះ", "ហ្សូហ៊ួរ", "អាសារ", "ម៉ាហ្គ្រិប", "អ៊ីស្យា"])
    assert.equal(ISLAMIC_ARABIC.fajr, "الفجر")
    assert.equal(ISLAMIC_ARABIC.iftar, "الإفطار")
    assert.equal(ISLAMIC_ARABIC.imsak, "الإمساك")
  })
  it("the evidence: Al-Baqarah 2:183 and 2:187 (from the Quran reader), Bukhari 1894, 38 and 1896", () => {
    assert.deepEqual(FASTING_VERSES.map((v) => v.aya), [183, 187])
    assert.deepEqual(FASTING_HADITHS.map((h) => h.source), ["Sahih al-Bukhari 1894", "Sahih al-Bukhari 38", "Sahih al-Bukhari 1896"])
    for (const h of FASTING_HADITHS) assert.match(h.url, /^https:\/\/sunnah\.com\/bukhari:\d+$/)
  })
  it("the tab row scrolls without the grey scrollbar", () => {
    assert.match(all("app/(app)/islamic/layout.tsx"), /\[scrollbar-width:none\] \[&::-webkit-scrollbar\]:hidden/)
  })
  it("the fasting card: Wajib in Ramadan, Sunnah in every other month; no date → no badge", () => {
    assert.equal(fastingRuling({ day: 1, month: 9, year: 1448 }), "wajib")
    assert.equal(fastingRuling({ day: 29, month: 9, year: 1448 }), "wajib")
    assert.equal(fastingRuling(toHijri(new Date(2026, 9, 18))), "sunnah") // 7 Jumada al-Ula 1448
    assert.equal(fastingRuling(null), null)
    assert.match(km["fasting.badgeWajib"], /^🔴 វ៉ាជីប \(Wajib \/ واجب\) — កាតព្វកិច្ច/)
    assert.match(km["fasting.badgeSunnah"], /^🟢 ស៊ូណាត់ \(Sunnah \/ سنة\) — ស្ម័គ្រចិត្ត/)
  })
  it("the evidence sheet explains Wajib, Sunnah (Bukhari 2840) and Imsak", () => {
    const sheet = all("components/islamic/fasting-wisdom-sheet.tsx")
    for (const key of ["fasting.rulingTitle", "fasting.wajibBody", "fasting.sunnahBody", "fasting.imsakBody"]) assert.ok(sheet.includes(key), key)
    assert.equal(SUNNAH_FAST_HADITH.url, "https://sunnah.com/bukhari:2840")
  })
  it("the channel (founder, 18/10/2026): អ៊ឹមសាក់ / ស្រាយបួស / ហូបបាយបួស (សាហួរ) / នីយ៉ាត់ / ជូម៉ាអះ / បារ៉ាកាត់ with their Arabic; never the machine words", () => {
    const fast = islamicCaptionHtml(islamicPostContent("ISLAMIC_FAST", "2026-10-18", null))
    const jumuah = islamicCaptionHtml(islamicPostContent("ISLAMIC_JUMUAH", "2026-10-23", { day: 12, month: 5, year: 1448 }))
    // The fasting reminder's plain labels (founder, 21/10/2026): «សាហួរ (អ៊ឹមសាក់)», «ស្រាយបួស (អ៊ីហ្វតារ)», «នីយ៉ាត់».
    assert.match(fast, /• សាហួរ \(អ៊ឹមសាក់\) ៖ [០-៩]{2}:[០-៩]{2} ទៀបភ្លឺ\n• ស្រាយបួស \(អ៊ីហ្វតារ\) ៖ [០-៩]{2}:[០-៩]{2} ល្ងាច/)
    assert.match(fast, /តាំងចិត្តនីយ៉ាត់ពីយប់នេះ/)
    assert.match(fast, /ព្យាការី មូហាំម៉ាត់ ﷺ/)
    assert.match(jumuah, /ជូម៉ាអះ \(Jumu'ah \/ الجُمُعَة\)/)
    assert.match(jumuah, /បារ៉ាកាត់ \(Barakah \/ بَرَكَة\)/)
    const poster = all("lib/server/islamic-poster.ts")
    assert.ok(poster.includes("[G.IMSAK_CARD, c.fast.imsak]") && poster.includes("[G.IFTAR_CARD, c.fast.iftar]"))
    for (const f of ["lib/islamic-channel.ts", "lib/server/islamic-poster.ts", "lib/scheduled-posts.ts", "lib/islamic.ts", "lib/islamic-tips.ts"])
      for (const bad of ["ឈប់ញ៉ាំ", "បើកបួស", "ស្ទូហួរ", "ស៊ូហួរ", "អាហារសាហួរ", "ជុមអះ", "ម.ស.", "មហាម៉ាត់សករាជ"]) assert.ok(!all(f).includes(bad), `${f}: ${bad}`)
  })
  it("the Hijri era is «ហ.ស.» (ហ៊ីចរ៉ោះសករាជ) — «ម.ស.» is the Buddhist Maha Sakaraj", () => {
    // 0-9 on the app's screens (rule 7); a channel post keeps Khmer digits.
    assert.equal(formatHijri({ day: 7, month: 5, year: 1448 }, "km", { short: true }), "7 ជុម៉ាដាល់អូឡា 1448 ហ.ស.")
    assert.equal(formatHijri({ day: 7, month: 5, year: 1448 }, "km", { short: true, khmerDigits: true }), "៧ ជុម៉ាដាល់អូឡា ១៤៤៨ ហ.ស.")
    assert.match(formatHijri({ day: 7, month: 5, year: 1448 }, "km"), /ហ៊ីចរ៉ោះសករាជ \(ហ\.ស\.\)$/)
  })
})
