// The Islamic hub's wording (founder, 18/10/2026): «ស្រាយបួស» (never «បើកបួស»), «អ៊ឹមសាក់», the founder's
// spellings of the prayers and tabs, and the Arabic beside them; the fasting evidence cites real sources.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { dictionaries } from "../src/lib/i18n/dictionaries"
import { FASTING_HADITHS, FASTING_VERSES, ISLAMIC_ARABIC } from "../src/lib/islamic"

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
})
