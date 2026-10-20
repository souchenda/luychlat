import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { DUAS, posterMeaning } from "./duas"

const by = (id: string) => DUAS.find((d) => d.id === id)!

describe("The du'a library in natural Khmer (founder, 19/10/2026)", () => {
  it("14 du'as, each with a unique id, Arabic, a Khmer reading, the meaning in Khmer and English, and its source", () => {
    assert.equal(DUAS.length, 14)
    assert.equal(new Set(DUAS.map((d) => d.id)).size, DUAS.length)
    for (const d of DUAS) {
      for (const f of ["arabic", "phonetic", "latin", "km", "en", "source"] as const) assert.ok(d[f].trim(), `${d.id}.${f}`)
      // The Arabic is Arabic only — no Khmer letter slipped in (the travel du'a arrived as «وَإិនَّا»).
      assert.doesNotMatch(d.arabic, /[ក-៿]/, d.id)
      assert.match(d.arabic, /^[؀-ۿ\s]+$/, d.id)
    }
  })

  it("entering and leaving the mosque (Sahih Muslim 713), travel (Az-Zukhruf 43:13–14), after eating — the founder's words", () => {
    assert.equal(by("enter-mosque").arabic, "اللَّهُمَّ افْتَحْ لِي أَبْوَابَ رَحْمَتِكَ")
    assert.equal(by("enter-mosque").km, "ឱអល់ឡោះ! សូមទ្រង់មេត្តាបើកទ្វារនៃក្តីមេត្តាករុណារបស់ទ្រង់ដល់រូបទូលបង្គំ។")
    assert.equal(by("leave-mosque").phonetic, "អាល់-ឡា-ហ៊ុម្ម៉ា អ៊ិន-នី អាស-អា-លុ-កា មីន ហ្វាត់-លីក")
    assert.equal(by("leave-mosque").source, "Sahih Muslim 713")
    assert.equal(by("travel").arabic, "سُبْحَانَ الَّذِي سَخَّرَ لَنَا هَذَا وَمَا كُنَّا لَهُ مُقْرِنِينَ وَإِنَّا إِلَى رَبِّنَا لَمُنْقَلِبُونَ")
    assert.match(by("travel").source, /^Az-Zukhruf 43:13–14/)
    assert.equal(by("after-eating").arabic, "الْحَمْدُ لِلَّهِ الَّذِي أَطْعَمَنَا وَسَقَانَا وَجَعَلَنَا مُسْلِمِينَ")
    assert.match(by("after-eating").km, /^រាល់ការសរសើរ និងអរគុណយ៉ាងជ្រាលជ្រៅបំផុតគឺចំពោះអល់ឡោះ/)
  })

  it("the fasting intention: the founder's meaning, and honest about its source (a Shafi'i formula, the intention in the heart)", () => {
    const n = by("fast-niyyah")
    assert.equal(posterMeaning(n), "« ខ្ញុំតាំងចិត្តបួសនៅថ្ងៃស្អែក ដើម្បីបំពេញកាតព្វកិច្ចខែរ៉ាម៉ាឌន ឬបួសស៊ុណ្ណា ដើម្បីអល់ឡោះជាម្ចាស់ ﷻ។ »")
    assert.match(n.source, /Shafi'i formula; the intention is in the heart/)
    // The hub's du'a of the hour and the channel still find theirs.
    for (const id of ["wake", "iftar", "sleep", "halal-provision"]) assert.ok(by(id), id)
  })
})

describe("Posters: no parentheses, no word-for-word Khmer (founder, 19/10/2026)", () => {
  it("every du'a's poster meaning has no parentheses; explanations live in the caption note", () => {
    for (const d of DUAS) assert.doesNotMatch(posterMeaning(d), /[()]/, d.id)
    const sleep = by("sleep")
    assert.equal(posterMeaning(sleep), "« ឱអល់ឡោះ! ដោយព្រះនាមទ្រង់ ទូលបង្គំលង់លក់ និងភ្ញាក់ដឹងខ្លួនឡើងវិញ។ »")
    assert.equal(sleep.km, "« ឱអល់ឡោះ! ដោយព្រះនាមទ្រង់ ទូលបង្គំលង់លក់ (ស្លាប់) និងភ្ញាក់ដឹងខ្លួនឡើងវិញ (រស់)។ »")
    assert.match(sleep.note!, /^ក្នុងសាសនាឥស្លាម ដំណេកត្រូវបានចាត់ទុកជាការស្លាប់តូចមួយ/)
    // Regression (founder, 20/10/2026): «ប៊ីស-មី-កា អាល់-ឡា…» split the wasl — the kaf joins the lam.
    assert.equal(sleep.phonetic, "ប៊ីស-មី-កល់-ឡ-ហ៊ុម្ម៉ា អា-មូ-ទូ វ៉ា-អាហ៍-យ៉ា")
  })
  it("the loan phrases are gone from the library the founder vetted", () => {
    for (const id of ["wake", "leave-home", "enter-mosque", "leave-mosque", "before-eating", "after-eating", "distress", "iftar", "travel", "sleep"]) {
      const d = by(id)
      for (const text of [d.km, posterMeaning(d)]) assert.doesNotMatch(text, /ក្នុងនាម|មានចេតនា|ការស្រេកទឹកបានបាត់/, id)
    }
  })
  it("the distress du'a is Yunus's, from Al-Anbiya 21:87 — its Arabic whole (it arrived with Khmer letters inside)", () => {
    assert.equal(by("distress").arabic, "لَا إِلَهَ إِلَّا أَنْتَ سُبْحَانَكَ إِنِّي كُنْتُ مِنَ الظَّالِمِينَ")
    assert.match(by("distress").source, /^Al-Anbiya 21:87/)
  })
})


describe("The last three du'as vetted (founder, 20/10/2026)", () => {
  it("halal provision (Ibn Majah 925), worry & debt (Bukhari 2893), both worlds (2:201) — the founder's posters, Arabic whole", () => {
    assert.equal(by("halal-provision").arabic, "اللَّهُمَّ إِنِّي أَسْأَلُكَ عِلْمًا نَافِعًا وَرِزْقًا طَيِّبًا وَعَمَلًا مُتَقَبَّلًا")
    assert.equal(by("halal-provision").source, "Sunan Ibn Majah 925")
    assert.equal(posterMeaning(by("halal-provision")), "« ឱអល់ឡោះ! ទូលបង្គំសូមអង្វរករនូវចំណេះដឹងជាប្រយោជន៍ រីហ្សគីដ៏ល្អហាឡាល់ និងការប្រព្រឹត្តអំពើល្អដែលទ្រង់ទទួលយក។ »")
    // Arrived as «الْهែមِّ … وَالْبُខْلِ … وَالْجُបْنِ» — Khmer letters inside the Arabic, corrected.
    assert.equal(by("worry-debt").arabic, "اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْهَمِّ وَالْحَزَنِ وَالْعَجْزِ وَالْكَسَلِ وَالْبُخْلِ وَالْجُبْنِ وَضَلَعِ الدَّيْنِ وَغَلَبَةِ الرِّجَالِ")
    assert.equal(by("worry-debt").source, "Sahih al-Bukhari 2893")
    assert.match(posterMeaning(by("both-worlds")), /^« ឱម្ចាស់នៃពួកយើង! សូមទ្រង់មេត្តាប្រទាននូវសេចក្តីល្អក្នុងលោកិយនេះ/)
    for (const id of ["halal-provision", "worry-debt", "both-worlds"]) {
      assert.match(by(id).phonetic, /-/, `${id}: the hyphenated reading`)
      assert.doesNotMatch(posterMeaning(by(id)), /[()]/, id)
    }
  })
})
