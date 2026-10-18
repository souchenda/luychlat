import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { audioCues } from "./reels-audio"
import { beatAt, DRAFT_MARK, frameTimes, sceneAt, SOPHEA_ART, SUBTITLE_BAND, subtitleLayers } from "./reels-renderer"
import { REEL_SCRIPTS } from "./reels-scripts"
import { REEL_FORMAT, reelTimeline } from "./reels-timeline"

const ep01 = REEL_SCRIPTS[0]
const sfxAt = audioCues(ep01).flatMap((c) => (c.kind === "sfx" ? [{ id: c.id, at: c.at }] : []))
const at = (t: number, approved = false) => sceneAt(ep01, t, { approved, sfxAt, adhanFrom: 2.5 })

describe("Reels renderer — the scene of Episode 01, moment by moment", () => {
  it("600 frames at 30 fps over the 20 s; each moment in its beat", () => {
    assert.equal(frameTimes(ep01).length, 600)
    assert.deepEqual([beatAt(ep01, 0).index, beatAt(ep01, 4.99).index, beatAt(ep01, 5).index, beatAt(ep01, 13).index, beatAt(ep01, 19.99).index], [0, 0, 1, 2, 2])
  })
  it("the hook: the phone binging AI drama, its episode climbing; the call to prayer from 2.5 s shakes it once", () => {
    const s = at(1)
    assert.ok(s.phone && !s.sophea)
    assert.equal(s.phone.episode, 36)
    assert.equal(at(4).phone!.episode, 38)
    assert.equal(s.adhanPulse, null)
    assert.ok(at(2.6).adhanPulse && Math.abs(at(2.55).phone!.shake) > 0)
    assert.equal(at(3.5).phone!.shake, 0)
  })
  it("the turn: Sophea pops in (overshoot), breathes, and shakes on the record scratch", () => {
    assert.ok(at(5).sophea!.scale < 0.05) // just appearing
    assert.ok(at(5.4).sophea!.scale > 1) // the bounce overshoots
    assert.ok(Math.abs(at(5.1).sophea!.rotate) > 0) // the scratch
    assert.equal(at(6).sophea!.rotate, 0)
    assert.notEqual(at(7).sophea!.scale, at(8).sophea!.scale) // breathing
    assert.equal(at(7).phone, null)
  })
  it("the resolution: the dash with the cartoon_dash cue, then the end card; Sophea moves up and shrinks", () => {
    assert.equal(at(12.9).dash, null)
    assert.ok(at(13.6).dash! > 0)
    assert.equal(at(12).endCard, 0)
    assert.equal(at(17).endCard, 1)
    assert.ok(at(17).sophea!.size < at(10).sophea!.size && at(17).sophea!.y < at(10).sophea!.y)
    assert.equal(at(17).adhanPulse, null)
  })
  it("the crescent never sits on Sophea or the phone", () => {
    for (const t of [3, 4.5, 6, 9, 12]) {
      const s = at(t)
      const a = s.adhanPulse!
      const ring = a.r * 2.3
      if (s.sophea) assert.ok(a.x - ring > s.sophea.x + (s.sophea.size * 1.04) / 2 || a.y + ring < s.sophea.y - (s.sophea.size * 1.04) / 2, `t=${t}`)
      if (s.phone) assert.ok(a.x - ring > s.phone.x + 245, `t=${t}`)
    }
  })
  it("subtitles follow the dialogue: the newest rises in, earlier dialogue dims, the end card's captions stay full", () => {
    const cues = reelTimeline(ep01)
    const turn = subtitleLayers(ep01, cues, 9.5)
    assert.equal(turn.at(-1)!.current, true)
    assert.equal(turn[0].opacity, 0.55)
    assert.equal(turn.at(-1)!.speaker, "sophea")
    const end = subtitleLayers(ep01, cues, 18)
    assert.ok(end.every((l) => l.speaker === "caption" && l.opacity === 1))
    const rising = subtitleLayers(ep01, cues, cues[0].start + 0.1)[0]
    assert.ok(rising.opacity > 0 && rising.opacity < 1 && rising.rise > 0)
    assert.ok(SUBTITLE_BAND.bottom <= REEL_FORMAT.height - REEL_FORMAT.safe.bottom) // clear of the platform's buttons
  })
  it("a script the founder has not approved carries the DRAFT mark on every frame", () => {
    assert.ok(frameTimes(ep01).every((t) => at(t).draft))
    assert.equal(at(5, true).draft, false)
    assert.equal(DRAFT_MARK, "DRAFT · មិនទាន់អនុម័ត")
  })
  it("Sophea's master art is the 1024 px rabbit in a kopiah, cropped to its tile", () => {
    const png = readFileSync(join(process.cwd(), SOPHEA_ART.file))
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1024, 1024])
    const { x, y, w, h } = SOPHEA_ART.crop
    assert.ok(x >= 0 && y >= 0 && x + w <= 1024 && y + h <= 1024)
  })
})
