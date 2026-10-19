import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { kmCalendarDay, SIL_BLESSING, silPosterContent } from "./sil-poster"

describe("The Sil day poster — the day's own lunar and calendar dates (founder, 19/10/2026)", () => {
  it("the four Sil days of a lunar month, each with its date", () => {
    assert.equal(silPosterContent("2026-10-19")!.dateline, "ថ្ងៃសីល (៨ កើត ខែអស្សុជ) · ត្រូវនឹង ថ្ងៃច័ន្ទ ១៩ តុលា ២០២៦")
    assert.equal(silPosterContent("2026-10-26")!.lunar, "១៥ កើត ខែអស្សុជ (ពេញបូណ៌មី)")
    assert.equal(silPosterContent("2026-11-03")!.lunar, "៨ រោច ខែអស្សុជ")
    assert.equal(silPosterContent("2026-11-09")!.lunar, "១៤ រោច ខែអស្សុជ (ដាច់ខែ)")
    assert.equal(silPosterContent("2026-11-09")!.dateline, "ថ្ងៃសីល (១៤ រោច ខែអស្សុជ · ដាច់ខែ) · ត្រូវនឹង ថ្ងៃច័ន្ទ ៩ វិច្ឆិកា ២០២៦")
  })
  it("no poster on an ordinary day", () => {
    assert.equal(silPosterContent("2026-10-20"), null)
    assert.equal(silPosterContent("2026-10-25"), null)
  })
  it("the words: «សូមអនុមោទនា» (a merit day — never «រីករាយ»), the blessing, the call and the community's links", () => {
    const c = silPosterContent("2026-10-19")!
    assert.deepEqual([c.headline, c.title], ["សូមអនុមោទនា", "ថ្ងៃនេះជាថ្ងៃសីល"])
    assert.equal(SIL_BLESSING, "សូមឱ្យសព្វសត្វទាំងឡាយ បានសុខចម្រើន រួចផុតចាកទុក្ខទាំងពួង និងជួបតែសេចក្ដីសុខសាន្ត")
    assert.equal(c.cta, "គ្រប់គ្រងចំណូល-ចំណាយ និងហិរញ្ញវត្ថុដោយឥតគិតថ្លៃ")
    assert.deepEqual(c.links, ["app.luychlat.com", "@LuyChlatCommunity"])
    assert.doesNotMatch(Object.values(c).join(" "), /រីករាយ|Islamic/)
    assert.equal(kmCalendarDay("2026-11-03"), "ថ្ងៃអង្គារ ៣ វិច្ឆិកា ២០២៦")
  })
})
