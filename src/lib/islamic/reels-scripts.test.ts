import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { ADHAN, BANNED_TERMS, SEMBAHYANG, WUDU } from "./glossary"
import { REEL_CTA, REEL_SCRIPTS, REEL_SECONDS, reelSeconds, SOPHEA } from "./reels-scripts"
import { cueProgress, ffmpegArgs, fillReel, frameCount, readingSeconds, REEL_FORMAT, reelProblems, reelTimeline } from "./reels-timeline"

const byId = (id: string) => REEL_SCRIPTS.find((s) => s.id === id)!
const allText = (id: string) => {
  const s = byId(id)
  return [s.hook, s.caption, ...s.beats.flatMap((b) => [...b.onScreen, b.voice ?? ""])].join("\n")
}

describe("Humour shorts — the script registry (founder, 18/10/2026)", () => {
  it("the founder's three hooks, word for word", () => {
    assert.equal(byId("ai-drama-vs-salat").hook, "ដល់ពេលសំប៉ាយ៉ាងហើយ នៅមើលរឿងអេអាយដល់ណាទៀត? សំប៉ាយ៉ាងហើយចាំមកតភាគ!")
    assert.equal(byId("sahur-snooze").hook, "ម៉ោងរោទ៍ហូបបាយបួស ០៣:៤៥ vs សុំ ៥ នាទីទៀត")
    assert.equal(byId("salat-mind-on-debts").hook, "ទៅសំប៉ាយ៉ាង តែចិត្តនៅចាំទារលុយម៉ូយ")
    assert.equal(SEMBAHYANG, "សំប៉ាយ៉ាង")
    assert.equal(new Set(REEL_SCRIPTS.map((s) => s.id)).size, REEL_SCRIPTS.length)
  })
  it("Episode 01, the flagship: the AI-drama binge vs Sophea the Rabbit, the founder's lines word for word", () => {
    assert.deepEqual(REEL_SCRIPTS.map((x) => x.episode), REEL_SCRIPTS.map((_, i) => i + 1)) // 01, 02, … in order
    const e = REEL_SCRIPTS[0]
    assert.equal(e.id, "sophea-ai-drama-wudu")
    assert.equal(e.title, "ញក់មើលរឿងភាគអេអាយ vs សុភាទន្សាយដេញទៅយកទឹកសំយាំង")
    assert.equal(SOPHEA.km, "សុភាទន្សាយ")
    const [hook, turn, resolution] = e.beats
    assert.equal(hook.speaker, "user")
    assert.equal(hook.voice, "សុំ ៣០ វិនាទីទៀត កំពុងដល់វគ្គតួស្រីត្រូវគេទះ...")
    assert.match(hook.sound!, /Adhan/) // the Adhan begins (the app's licensed preset)
    assert.equal(turn.speaker, "sophea")
    assert.equal(turn.voice, "មើលរឿងអេអាយ គេទះកំផ្លៀងគ្នា ឯងភ័យជំនួសគេ! ដល់សំឡេងអាហ្សានហៅសំប៉ាយ៉ាង ធ្វើមិនឮ! តោះ! ក្រោកទៅយកទឹកសំយាំងភ្លាម!")
    assert.equal(turn.onScreen.join(" "), turn.voice) // the screen shows exactly what Sophea says
    assert.deepEqual(resolution.onScreen, ["រឿងអេអាយគេមិនរត់ចោលទេ... តែម៉ោងសំប៉ាយ៉ាងមិនចាំយើងឡើយ!", "ពិនិត្យម៉ោងថ្វាយបង្គំលើ app.luychlat.com"])
    assert.ok(e.caption.includes("រឿងអេអាយគេមិនរត់ចោលទេ... តែម៉ោងសំប៉ាយ៉ាងមិនចាំយើងឡើយ! 🕌 ពិនិត្យម៉ោងថ្វាយបង្គំលើ app.luychlat.com"))
    // The words come from the glossary.
    assert.equal(WUDU, "យកទឹកសំយាំង")
    assert.equal(ADHAN, "អាហ្សាន")
    // No emoji drawn in a frame (the server has no colour emoji font) — emoji stay in the caption.
    for (const x of REEL_SCRIPTS) for (const b of x.beats) for (const l of b.onScreen) assert.doesNotMatch(l, /\p{Extended_Pictographic}/u, `${x.id}: «${l}»`)
  })
  it("15–20 s, three acts (hook, turn, resolution on the real app), time enough to read every line", () => {
    for (const s of REEL_SCRIPTS) {
      assert.deepEqual(reelProblems(s), [], s.id)
      assert.ok(reelSeconds(s) >= REEL_SECONDS.min && reelSeconds(s) <= REEL_SECONDS.max, s.id)
      const app = s.beats.at(-1)!.appScreen!
      assert.match(app.route, /^\/(islamic|debts)$/, s.id) // real pages of the app
    }
    assert.deepEqual(reelProblems({ ...byId("sahur-snooze"), beats: byId("sahur-snooze").beats.slice(0, 2) }).length > 0, true)
  })
  it("brand, wording and approval: «អេប លុយឆ្លាត», no italics, no banned term; every caption ends with the call; all DRAFT", () => {
    for (const s of REEL_SCRIPTS) {
      const text = allText(s.id)
      assert.doesNotMatch(text, /កម្មវិធី|អែប|<i>/, s.id)
      assert.doesNotMatch(text.replace(/@LuyChlatIslamic|app\.luychlat\.com/g, ""), /LuyChlat/i, s.id)
      for (const b of BANNED_TERMS) assert.ok(!text.includes(b.term), `${s.id}: «${b.term}»`)
      assert.ok(s.caption.endsWith(REEL_CTA), s.id)
      assert.equal(s.status, "DRAFT", s.id) // rendered only once the founder approves
      if (/Bukhari|Baqarah/.test(s.caption)) assert.ok(s.source, `${s.id}: a cited source`)
    }
  })
  it("the Imsak time is the app's own, filled at render time — a missing value never renders", () => {
    const s = byId("sahur-snooze")
    assert.ok(s.beats.some((b) => b.onScreen.some((l) => l.includes("{imsak}"))))
    const filled = fillReel(s, { "{imsak}": "០៤:២៣" })
    assert.ok(filled.beats[2].onScreen[0].includes("០៤:២៣"))
    assert.throws(() => fillReel(s, {}), /no value for \{imsak\}/)
  })
})

describe("Humour shorts — the timeline and the FFmpeg plan", () => {
  it("reading time grows with the line, at least 1.2 s", () => {
    assert.equal(readingSeconds("ភាគ"), 1.2)
    assert.ok(readingSeconds("រឿងរង់ចាំបាន · សឡាតមានម៉ោងរបស់វា") > readingSeconds("សងថ្ងៃណា?"))
  })
  it("cues appear in order within their beat and rise in (ease-out) over 0.35 s", () => {
    const s = byId("salat-mind-on-debts")
    const cues = reelTimeline(s)
    assert.equal(cues.length, s.beats.flatMap((b) => b.onScreen).length)
    for (const [i, c] of cues.entries()) {
      assert.ok(c.start < c.end && c.end <= reelSeconds(s))
      if (i) assert.ok(c.start >= cues[i - 1].start)
    }
    const c = cues[0]
    assert.equal(cueProgress(c, c.start - 0.1), 0)
    assert.ok(cueProgress(c, c.start + 0.1) > 0 && cueProgress(c, c.start + 0.1) < 1)
    assert.equal(cueProgress(c, c.start + 0.5), 1)
    assert.equal(cueProgress(c, c.end), 0)
  })
  it("FFmpeg encodes a 9:16 PNG sequence and the audio to H.264 / AAC — the Khmer text is never drawn by FFmpeg", () => {
    const args = ffmpegArgs({ framesDir: "/tmp/reel", audio: "/tmp/voice.wav", seconds: 18, out: "/tmp/reel.mp4" })
    const cmd = args.join(" ")
    assert.match(cmd, /-framerate 30 -i \/tmp\/reel\/frame-%05d\.png -i \/tmp\/voice\.wav/)
    assert.match(cmd, /scale=1080:1920/)
    assert.match(cmd, /-c:v libx264 .*-c:a aac .*-movflags \+faststart \/tmp\/reel\.mp4$/)
    assert.doesNotMatch(cmd, /drawtext/)
    assert.match(ffmpegArgs({ framesDir: "/f", audio: null, seconds: 15, out: "/o.mp4" }).join(" "), /anullsrc/) // a silent track
    assert.equal(REEL_FORMAT.width / REEL_FORMAT.height, 9 / 16)
    assert.equal(frameCount(byId("sahur-snooze")), reelSeconds(byId("sahur-snooze")) * 30)
  })
})
