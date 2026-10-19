import assert from "node:assert/strict"
import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { ADHAN_PRESETS, adhanForPrayer, availablePresets, CUSTOM_ADHAN, FAJR_ADHAN, hasFajrRecording, resolvePreset } from "./adhan-presets"
import { ISLAMIC_ARABIC } from "./islamic"

describe("Adhan presets — only licensed recordings, each with its source", () => {
  it("every preset with a file has a credit line and the file is in /public", () => {
    for (const p of [...ADHAN_PRESETS, FAJR_ADHAN].filter((x) => x.file)) {
      assert.ok(p.credit && p.credit.length > 5, `${p.id} needs its source and licence`)
      const path = join(process.cwd(), "public", p.file!)
      assert.ok(existsSync(path), `${p.file} is missing`)
      assert.ok(statSync(path).size > 50_000, `${p.file} looks empty`)
    }
  })
  it("the Wikimedia Commons recording is CC0 and served from /adhan/ (cached offline by the service worker)", () => {
    const p = availablePresets().find((x) => x.id === "commons-cc0")
    assert.ok(p)
    assert.equal(p.file, "/adhan/commons-cc0.mp3")
    assert.match(p.credit!, /CC0/)
    assert.ok(readFileSync(join(process.cwd(), "public/sw.js"), "utf8").includes('startsWith("/adhan/")'))
  })
  it("no recording is presented as the Fajr Adhan unless it really is one", () => {
    assert.equal(FAJR_ADHAN.file, null)
  })
  it("presets without a file (Makkah, Madinah, Alafasy, Al-Aqsa) never show", () => {
    for (const id of ["makkah", "madinah", "alafasy", "aqsa"]) assert.ok(!availablePresets().some((p) => p.id === id))
  })
})

describe("resolvePreset — what plays for the stored choice", () => {
  it("the old default «makkah» (no file) plays the built-in recording, never silence", () => {
    assert.equal(resolvePreset("makkah", false)?.id, "commons-cc0-natural")
    assert.equal(resolvePreset(undefined, false)?.id, "commons-cc0-natural")
  })
  it("a phone file the person chose is kept", () => {
    assert.equal(resolvePreset(CUSTOM_ADHAN, true), undefined)
    assert.equal(resolvePreset("makkah", true), undefined)
  })
  it("Natural Pace is the default; Short Alert and Traditional Full are one tap away", () => {
    assert.deepEqual(availablePresets().map((p) => p.id), ["commons-cc0-natural", "commons-cc0-short", "commons-cc0"])
    assert.equal(resolvePreset("commons-cc0-short", false)?.file, "/adhan/commons-cc0-short.mp3")
  })
  it("a chosen preset with a file plays itself", () => {
    assert.equal(resolvePreset("commons-cc0", true)?.id, "commons-cc0")
  })
})

describe("Fajr Adhan — the Tathweeb at Fajr only", () => {
  const fajr = { id: "fajr", name: { km: "អាហ្សានស៊ុពហ៍", en: "Fajr Adhan" }, file: "/adhan/fajr.mp3", credit: "test" }
  it("with a Fajr recording: it plays at Fajr (switch on), never at the other four", () => {
    assert.equal(adhanForPrayer("fajr", "commons-cc0-natural", true, false, fajr).presetFile, "/adhan/fajr.mp3")
    for (const p of ["dhuhr", "asr", "maghrib", "isha"]) assert.equal(adhanForPrayer(p, "commons-cc0-natural", true, false, fajr).presetFile, "/adhan/commons-cc0-natural.mp3")
    assert.equal(adhanForPrayer("fajr", "commons-cc0-natural", false, false, fajr).presetFile, "/adhan/commons-cc0-natural.mp3")
  })
  it("without one (today): Fajr plays the chosen general Adhan — and the prayer page carries no Fajr disclaimer card", () => {
    assert.equal(hasFajrRecording(), false)
    assert.equal(adhanForPrayer("fajr", "commons-cc0-short", true, false).presetFile, "/adhan/commons-cc0-short.mp3")
    // The founder (19/10/2026): the Fajr Adhan is the audio's job, never a permanent card under the prayer times.
    const page = readFileSync(join(process.cwd(), "src/app/(app)/islamic/prayer/page.tsx"), "utf8")
    assert.doesNotMatch(page, /fajrNote|tathweeb|hasFajrRecording/)
  })
  it("the phrase is written in Arabic letters only (no Khmer «ម» in «النوم»)", () => {
    assert.equal(ISLAMIC_ARABIC.tathweeb, "الصَّلَاةُ خَيْرٌ مِنَ النَّوْمِ")
    assert.doesNotMatch(ISLAMIC_ARABIC.tathweeb, /[ក-៿]/)
  })
})
