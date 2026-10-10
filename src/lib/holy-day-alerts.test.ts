import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { holyDayStages, silDayText, silEveText } from "./holy-day-alerts"

describe("ថ្ងៃសីល — two reminders at 07:00", () => {
  it("the day before a holy day: the eve reminder (buy offerings), not the greeting", () => {
    // 11/10/2026 is ១៥ រោច ខែភទ្របទ: on 10/10 the eve reminder is due.
    const s = holyDayStages("2026-10-10")
    assert.equal(s.eve, "១៥ រោច ខែភទ្របទ")
    assert.equal(s.today, null)
  })
  it("on the holy day: the morning greeting", () => {
    const s = holyDayStages("2026-10-11")
    assert.equal(s.today, "១៥ រោច ខែភទ្របទ")
    assert.equal(s.eve, null)
  })
  it("an ordinary day: nothing; the next ones are ៨ កើត (19/10) and ១៥ កើត (26/10)", () => {
    assert.deepEqual(holyDayStages("2026-10-14"), { eve: null, today: null })
    assert.equal(holyDayStages("2026-10-18").eve, "៨ កើត ខែអស្សុជ")
    assert.equal(holyDayStages("2026-10-26").today, "១៥ កើត ខែអស្សុជ")
  })
  it("the wording (merit days: «សូមអនុមោទនា», never «រីករាយ»)", () => {
    assert.equal(silEveText("១៥ រោច ខែភទ្របទ"), "🪷 រំលឹក៖ ថ្ងៃស្អែកជាថ្ងៃសីល! (១៥ រោច ខែភទ្របទ)\n🙏 សូមកុំភ្លេចរៀបចំទិញផ្កាឈូក ផ្លែឈើ និងគ្រឿងសែនព្រេនទុកជាមុន។")
    assert.match(silDayText("១៥ រោច ខែភទ្របទ"), /^🪷 អរុណសួស្តី! ថ្ងៃនេះជាថ្ងៃសីល \(១៥ រោច ខែភទ្របទ\)\n🙏 សូមអនុមោទនាកុសលបុណ្យ/)
    assert.doesNotMatch(silDayText("x") + silEveText("x"), /រីករាយ/)
  })
})
