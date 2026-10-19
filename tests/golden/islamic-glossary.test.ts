// GOLDEN GUARD — one Islamic glossary for the whole app (founder, 18/10/2026: «stop piecemeal fixes»). Every Islamic
// term in the UI, the posters, the Telegram captions and the AI advisor comes from src/lib/islamic/glossary.ts:
//   1. a banned (machine-translated or wrong) word anywhere in the code fails the build;
//   2. «ម.ស.» (the Buddhist era) in an Islamic file fails it;
//   3. a glossary term typed by hand outside the glossary fails it — import it instead.
// Comments are not scanned (they may name a banned word to explain the rule); test files are not scanned.
import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, it } from "node:test"

import * as G from "../../src/lib/islamic/glossary"

const SRC = join(process.cwd(), "src")
const GLOSSARY = "lib/islamic/glossary.ts"

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : []
  })
}

/** The code without its comments (block, JSX and line comments; «https://» is kept). */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\w])\/\/.*$/gm, "$1")

const files = walk(SRC)
  .map((p) => ({ f: relative(SRC, p).replace(/\\/g, "/"), src: code(readFileSync(p, "utf8")) }))
  .filter((x) => x.f !== GLOSSARY)

/** Files about Islamic practice (where «ម.ស.» is wrong). */
const ISLAMIC_FILE = /islamic|adhan|prayer|nasheed|quran|qibla|fasting|duas|scripture|zakat|hijri|tasbih/i

describe("GOLDEN · the Islamic glossary is the single source of truth", () => {
  it("no banned word anywhere in the app (UI, posters, captions, bot, AI prompt)", () => {
    const hits = files.flatMap(({ f, src }) => G.BANNED_TERMS.filter((b) => src.includes(b.term)).map((b) => `${f}: «${b.term}» → use «${b.use}»`))
    assert.deepEqual(hits, [])
  })
  it("never «ម.ស.» in an Islamic file — the Hijri era is «ហ.ស.»", () => {
    const hits = files.filter(({ f }) => ISLAMIC_FILE.test(f)).flatMap(({ f, src }) => G.BANNED_IN_ISLAMIC_FILES.filter((b) => src.includes(b.term)).map((b) => `${f}: «${b.term}» → «${b.use}»`))
    assert.deepEqual(hits, [])
  })
  it("every glossary term comes from the glossary — none typed by hand elsewhere", () => {
    const terms = [G.IMSAK, G.IFTAR, G.SAHUR, G.NIYYAH, G.JUMUAH, G.BARAKAH, G.HIJRI_ERA, G.PROPHET, G.SUNNAH_FAST, "صِيَام", G.JUMUAH_ARABIC, G.SEMBAHYANG, G.WUDU]
    const hits = files.flatMap(({ f, src }) => terms.filter((t) => src.includes(t)).map((t) => `${f}: «${t}» → import it from lib/islamic/glossary`))
    assert.deepEqual(hits, [])
  })
  it("the glossary itself: the founder's terms (18/10/2026)", () => {
    assert.equal(G.PROPHET_FULL, "ព្យាការី មូហាំម៉ាត់ ﷺ")
    assert.equal(G.PBUH.codePointAt(0), 0xfdfa)
    assert.equal(G.SAHUR_MEAL, "ហូបបាយបួស (សាហួរ / السَّحُور)")
    assert.equal(G.IMSAK_LABEL, "អ៊ឹមសាក់ (Imsak / الإمساك)")
    assert.equal(G.IMSAK_CARD, "អ៊ឹមសាក់ · Imsak") // no parentheses on a graphic (founder, 19/10/2026)
    assert.equal(G.IFTAR_LABEL, "ស្រាយបួស (Iftar / الإفطار)")
    assert.equal(G.IFTAR_CARD, "ស្រាយបួស · Iftar")
    assert.equal(G.NIYYAH_LABEL, "នីយ៉ាត់ (Niyyah / النِّيَّة)")
    assert.equal(G.HIJRI_ERA, "ហ.ស.")
    assert.equal(G.JUMUAH_LABEL, "ជូម៉ាអះ (Jumu'ah / الجُمُعَة)")
    assert.equal(G.BARAKAH_LABEL, "បារ៉ាកាត់ (Barakah / بَرَكَة)")
    assert.equal(G.REMINDER_TITLES.monday, "រំលឹកត្រៀមបួសស៊ុណ្ណា ថ្ងៃច័ន្ទស្អែក (صِيَام الإِثْنَيْن)")
    assert.equal(G.REMINDER_TITLES.thursday, "រំលឹកត្រៀមបួសស៊ុណ្ណា ថ្ងៃព្រហស្បតិ៍ស្អែក (صِيَام الخَمِيس)")
    assert.equal(G.FAST_HERO_TITLES.monday, "បួសស៊ុណ្ណា ថ្ងៃច័ន្ទ") // the poster's hero (typography hotfix, 18/10/2026)
    assert.equal(G.FAST_HERO_TITLES.thursday, "បួសស៊ុណ្ណា ថ្ងៃព្រហស្បតិ៍")
    assert.equal(G.FAST_ARABIC.monday, "صِيَام يَوْم الإِثْنَيْن")
    assert.equal(G.FAST_ARABIC.thursday, "صِيَام يَوْم الخَمِيس")
    assert.equal(G.JUMUAH_MUBARAK_ARABIC, "جُمُعَة مُبَارَك")
    assert.equal(G.MORNING_ARABIC, "صَبَاح الخَيْر")
    assert.equal(G.HIJRI_CORRESPONDS, "ត្រូវនឹង")
    assert.equal(G.SEMBAHYANG, "សំប៉ាយ៉ាង")
    assert.equal(G.WUDU, "យកទឹកសំយាំង")
    assert.equal(G.ADHAN, "អាហ្សាន")
    assert.equal(G.fastReminderLead("monday"), "រំលឹកត្រៀមបួសស៊ុណ្ណា (សម្រាប់ថ្ងៃច័ន្ទ ស្អែកនេះ)៖")
    assert.equal(
      G.sahurReminder("០៤:២៣"),
      "សូមកុំភ្លេចក្រោកហូបបាយបួស (សាហួរ / السَّحُور) នៅទៀបភ្លឺ មុនម៉ោងអ៊ឹមសាក់ ០៤:២៣ និងតាំងចិត្តនីយ៉ាត់ (Niyyah / النِّيَّة) តាំងពីយប់នេះ។",
    )
  })
  it("the posters, the channel captions and the AI advisor import the glossary", () => {
    for (const f of ["lib/islamic-channel.ts", "lib/server/islamic-poster.ts", "lib/server/poster-kit.ts", "lib/advisor/prompt.ts", "lib/islamic.ts", "lib/i18n/dictionaries.ts"]) {
      assert.match(readFileSync(join(SRC, f), "utf8"), /from "@\/lib\/islamic\/glossary"/, f)
    }
  })
})
