import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import path from "node:path"
import { describe, it } from "node:test"

import { FESTIVAL_POSTERS, POSTER_APP_BUTTON, posterDue } from "./festival-poster"

describe("Pchum Ben poster — automatic broadcast on 10/10/2026 at 07:00 (Cambodia time)", () => {
  const p = FESTIVAL_POSTERS.pchumben

  it("goes out at 07:00 on the first day only", () => {
    assert.equal(posterDue(p, "2026-10-10", "06:59"), false)
    assert.equal(posterDue(p, "2026-10-10", "07:00"), true)
    assert.equal(posterDue(p, "2026-10-09", "07:00"), false)
    assert.equal(posterDue(p, "2026-10-11", "07:00"), false)
  })
  it("a missed slot (server restarting) is made up during the morning, never later", () => {
    assert.equal(posterDue(p, "2026-10-10", "09:30"), true)
    assert.equal(posterDue(p, "2026-10-10", "12:00"), false)
  })
  it("the approved artwork is the file that goes out; the caption and button follow the wording rules", () => {
    assert.ok(existsSync(path.join(process.cwd(), "public", "posters", p.file)))
    assert.match(p.caption, /សូមអនុមោទនា/)
    assert.doesNotMatch(p.caption + POSTER_APP_BUTTON, /រីករាយ|អែប/)
  })
})
