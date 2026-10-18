import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { nasheedQueue, type NasheedTrack } from "./nasheed-data"

const row = (o: Partial<NasheedTrack>): NasheedTrack => ({ id: "x", kind: "STREAM", title_km: "បទ", title_en: "Song", artist: "Group", audio_path: "a.mp3", url: null, rights_note: "written permission", sort: 1, active: true, status: "APPROVED", credit: null, submitted_by: null, likes: 0, created_at: "2026-10-18T00:00:00Z", ...o })

describe("Qasidah & Nasheed — only cleared recordings play in the app (founder, 18/10/2026)", () => {
  it("the queue holds only active streamed tracks with their audio; official links never play here", () => {
    const q = nasheedQueue(
      [row({ id: "1" }), row({ id: "2", kind: "LINK", audio_path: null, url: "https://www.youtube.com/@MaherZain" }), row({ id: "3", active: false }), row({ id: "4", audio_path: null })],
      "km",
    )
    assert.deepEqual(q.map((t) => t.key), ["nasheed:1"])
    assert.equal(q[0].title, "បទ")
    assert.equal(nasheedQueue([row({ id: "1" })], "en")[0].title, "Song")
  })
  it("a member's submission never plays before the founder's ✅; the app's own CC files play from /audio/nasheed", () => {
    const q = nasheedQueue(
      [
        row({ id: "p", status: "PENDING", audio_path: "sub:u/f.mp3" }),
        row({ id: "r", status: "REJECTED", active: false }),
        row({ id: "c", audio_path: "/audio/nasheed/alhamdulillah-jawad-syed.mp3" }),
      ],
      "km",
    )
    assert.deepEqual(q.map((t) => t.key), ["nasheed:c"])
    assert.equal(q[0].src, "/audio/nasheed/alhamdulillah-jawad-syed.mp3")
  })
  it("the database demands a rights note for every streamed recording, and lets only the super admin write", () => {
    const sql = readFileSync(join(process.cwd(), "supabase", "migrations", "20270171000000_nasheed_tracks.sql"), "utf8")
    assert.match(sql, /constraint nasheed_stream_rights check \(kind <> 'STREAM' or \(audio_path is not null and rights_note is not null/)
    assert.match(sql, /for all to authenticated\s+using \(public\.is_super_admin\(\)\) with check \(public\.is_super_admin\(\)\)/)
    assert.match(sql, /with check \(bucket_id = 'nasheed-audio' and public\.is_super_admin\(\)\)/)
  })
})
