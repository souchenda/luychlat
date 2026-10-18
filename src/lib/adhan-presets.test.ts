import assert from "node:assert/strict"
import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { ADHAN_PRESETS, availablePresets, CUSTOM_ADHAN, FAJR_ADHAN, resolvePreset } from "./adhan-presets"

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
