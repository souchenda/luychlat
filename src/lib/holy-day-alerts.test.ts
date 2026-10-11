import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { holyDayCard, holyDayReminder, holyDayReminderAllowed, holyDayStages, silDayText, silEveText } from "./holy-day-alerts"
import { BELL_SECONDS, bellSample } from "./temple-bell"

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

describe("the 🪷 card in the app's bell", () => {
  it("10/10 from 07:00: tomorrow's holy day, with the offerings reminder", () => {
    const c = holyDayCard(Date.parse("2026-10-10T07:16:00+07:00"))
    assert.equal(c?.stage, "eve")
    assert.equal(c?.title, "🪷 ថ្ងៃស្អែកជាថ្ងៃសីល!")
    assert.match(c!.message, /ផ្កាឈូក ផ្លែឈើ និងគ្រឿងសែនព្រេន/)
    assert.equal(c?.at, "2026-10-10T00:00:00.000Z")
  })
  it("11/10: the blessing; before 07:00 and on ordinary days: nothing", () => {
    assert.equal(holyDayCard(Date.parse("2026-10-11T08:00:00+07:00"))?.title, "🪷 ថ្ងៃនេះជាថ្ងៃសីល!")
    assert.equal(holyDayCard(Date.parse("2026-10-10T06:30:00+07:00")), null)
    assert.equal(holyDayCard(Date.parse("2026-10-14T09:00:00+07:00")), null)
  })
})

describe("Home's 🪷 reminder with the bell", () => {
  // 07:30 Cambodia time on every day of Oct–Nov 2026.
  const days = Array.from({ length: 61 }, (_, i) => Date.parse("2026-10-01T00:30:00Z") + i * 86_400_000)
  it("the day before: «ថ្ងៃស្អែកជាថ្ងៃសីល»; on the day: «ថ្ងៃនេះជាថ្ងៃសីល»; the offerings question", () => {
    const found = days.map((t) => holyDayReminder(t)).filter((r) => r !== null)
    assert.ok(found.some((r) => r.stage === "eve" && r.title === "🪷 ថ្ងៃស្អែកជាថ្ងៃសីល"))
    assert.ok(found.some((r) => r.stage === "day" && r.title === "🪷 ថ្ងៃនេះជាថ្ងៃសីល"))
    for (const r of found) assert.equal(r.ask, "តើបងបានត្រៀមបច្ច័យធ្វើបុណ្យ ឬទិញផ្កា ផ្លែឈើបូជាព្រះហើយឬនៅ?")
  })
  it("not before 07:00", () => {
    const day = days.find((t) => holyDayReminder(t))!
    assert.equal(holyDayReminder(day - 60 * 60_000), null)
  })
  it("strictly Personal — never Business or Family — and never with Islamic Mode", () => {
    assert.ok(holyDayReminderAllowed({ workspaceType: "PERSONAL", islamic: false }))
    assert.ok(!holyDayReminderAllowed({ workspaceType: "BUSINESS", islamic: false }))
    assert.ok(!holyDayReminderAllowed({ workspaceType: "FAMILY", islamic: false }))
    assert.ok(!holyDayReminderAllowed({ workspaceType: "PERSONAL", islamic: true }))
    assert.ok(!holyDayReminderAllowed({ workspaceType: undefined, islamic: false }))
  })
})

describe("the temple bell — one soft chime that fades out", () => {
  it("silent before and after its 2.2 s; loudest near the strike, near silence at the end", () => {
    assert.equal(bellSample(-0.1), 0)
    assert.equal(bellSample(BELL_SECONDS + 0.01), 0)
    const level = (from: number) => Math.max(...Array.from({ length: 400 }, (_, i) => Math.abs(bellSample(from + i / 44100))))
    assert.ok(level(0.01) > 5 * level(1.5))
    assert.ok(level(BELL_SECONDS - 0.01) < 0.02)
  })
})
