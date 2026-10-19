import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { DUAS } from "./duas"

const by = (id: string) => DUAS.find((d) => d.id === id)!

describe("The du'a library in natural Khmer (founder, 19/10/2026)", () => {
  it("13 du'as, each with a unique id, Arabic, a Khmer reading, the meaning in Khmer and English, and its source", () => {
    assert.equal(DUAS.length, 13)
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
    assert.equal(by("enter-mosque").km, "ឱអល់ឡោះ! សូមទ្រង់មេត្តាបើកទ្វារនៃក្តីមេត្តាករុណារបស់ទ្រង់ដល់រូបខ្ញុំ")
    assert.equal(by("leave-mosque").phonetic, "អាល់ឡាហុម្ម៉ា អ៊ិននី អាស-អាលុកា មីន ហ្វាត់-លីក")
    assert.equal(by("leave-mosque").source, "Sahih Muslim 713")
    assert.equal(by("travel").arabic, "سُبْحَانَ الَّذِي سَخَّرَ لَنَا هَذَا وَمَا كُنَّا لَهُ مُقْرِنِينَ وَإِنَّا إِلَى رَبِّنَا لَمُنْقَلِبُونَ")
    assert.match(by("travel").source, /^Az-Zukhruf 43:13–14/)
    assert.equal(by("after-eating").arabic, "الْحَمْدُ لِلَّهِ الَّذِي أَطْعَمَنَا وَسَقَانَا وَجَعَلَنَا مُسْلِمِينَ")
    assert.match(by("after-eating").km, /^រាល់ការសរសើរ និងអរគុណយ៉ាងជ្រាលជ្រៅបំផុតគឺចំពោះអល់ឡោះ/)
  })

  it("the fasting intention: the founder's meaning, and honest about its source (a Shafi'i formula, the intention in the heart)", () => {
    const n = by("fast-niyyah")
    assert.equal(n.km, "ខ្ញុំតាំងចិត្តបួសនៅថ្ងៃស្អែក ដើម្បីបំពេញកាតព្វកិច្ចខែរ៉ាម៉ាឌន (ឬបួសស៊ុណ្ណា) ដើម្បីអល់ឡោះជាម្ចាស់ ﷻ")
    assert.match(n.source, /Shafi'i formula; the intention is in the heart/)
    // The hub's du'a of the hour and the channel still find theirs.
    for (const id of ["wake", "iftar", "sleep", "halal-provision"]) assert.ok(by(id), id)
  })
})
