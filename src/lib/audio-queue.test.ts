import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { afterTrack, neighbour } from "./audio-queue"
import { sleepAfter } from "./quran-audio"

describe("audio queue — Quran and Nasheed play the same way", () => {
  it("a track ends: the next plays on; «at the end of this track» stops; nothing after the last", () => {
    assert.equal(afterTrack(0, 114, null), 1)
    assert.equal(afterTrack(0, 114, sleepAfter(30, 0)), 1)
    assert.equal(afterTrack(0, 114, { kind: "surah" }), null)
    assert.equal(afterTrack(113, 114, null), null)
    assert.equal(afterTrack(0, 1, null), null)
  })
  it("⏮︎ / ⏭︎ stop at either end of the queue", () => {
    assert.equal(neighbour(0, 3, -1), null)
    assert.equal(neighbour(0, 3, 1), 1)
    assert.equal(neighbour(2, 3, 1), null)
    assert.equal(neighbour(2, 3, -1), 1)
  })
})
