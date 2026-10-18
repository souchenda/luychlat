import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { before, describe, it } from "node:test"

import { createCanvas } from "@napi-rs/canvas"

import { audioCues } from "@/lib/islamic/reels-audio"
import { sceneAt } from "@/lib/islamic/reels-renderer"
import { REEL_SCRIPTS } from "@/lib/islamic/reels-scripts"
import { REEL_FORMAT } from "@/lib/islamic/reels-timeline"

import { drawReelFrame, loadReelArt, type ReelArt } from "./reels-frames"
import { loadFonts } from "./poster-kit"

const ep01 = REEL_SCRIPTS[0]
const sfxAt = audioCues(ep01).flatMap((c) => (c.kind === "sfx" ? [{ id: c.id, at: c.at }] : []))
let art: ReelArt

describe("Reels frames — Skia draws each scene (1080 × 1920)", () => {
  before(async () => {
    loadFonts()
    art = await loadReelArt()
  })
  it("every beat draws (hook, turn, resolution) into a full raw RGBA frame for FFmpeg", () => {
    const canvas = createCanvas(REEL_FORMAT.width, REEL_FORMAT.height)
    const ctx = canvas.getContext("2d")
    for (const t of [1.5, 3, 5.4, 9.5, 13.6, 18]) {
      drawReelFrame(ctx, sceneAt(ep01, t, { approved: false, sfxAt, adhanFrom: 2.5 }), art)
      assert.equal(canvas.data().length, REEL_FORMAT.width * REEL_FORMAT.height * 4, `t=${t}`)
    }
  })
  it("the DRAFT mark is drawn (red pill, top right) unless the founder approved the script", () => {
    const canvas = createCanvas(REEL_FORMAT.width, REEL_FORMAT.height)
    const ctx = canvas.getContext("2d")
    const red = () => {
      const [r, g, b] = ctx.getImageData(REEL_FORMAT.width - 110, 262, 1, 1).data
      return r > 150 && g < 80 && b < 110
    }
    drawReelFrame(ctx, sceneAt(ep01, 9.5, { approved: false, sfxAt, adhanFrom: 2.5 }), art)
    assert.ok(red(), "draft: the red pill")
    drawReelFrame(ctx, sceneAt(ep01, 9.5, { approved: true, sfxAt, adhanFrom: 2.5 }), art)
    assert.ok(!red(), "approved: no pill")
  })
  it("a render is always a DRAFT artifact, never published here; frames stream raw (no drawtext for Khmer)", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/server/reels-frames.ts"), "utf8")
    assert.match(src, /status: "DRAFT"; scriptApproved: boolean/)
    assert.match(src, /const artifact: ReelArtifact = \{ file: o\.out, scriptId: o\.script\.id, episode: o\.script\.episode, status: "DRAFT",/)
    assert.match(src, /writeFileSync\(`\$\{o\.out\}\.json`/)
    assert.doesNotMatch(src, /drawtext|sendVideo|founderApproved|facebook|scheduled-posts/)
  })
})
