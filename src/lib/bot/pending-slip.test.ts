import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { holdForSlip, slipRead, slipReading } from "./pending-slip"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")

describe("A note typed while a slip is read belongs to that slip (founder, 7/11/2026)", () => {
  it("regression: «ទិញម្ហូប» during «🧾 កំពុងអានស្លីប…» went onto the 3,000 ៛ entry before — it now waits for the slip", () => {
    const t = 1_000_000
    assert.equal(holdForSlip(1, "ទិញម្ហូប", t), false) // no slip being read → the usual follow-up note
    slipReading(1, 60_000, t)
    assert.equal(holdForSlip(1, "ទិញម្ហូប", t + 5_000), true)
    assert.equal(holdForSlip(2, "other chat", t + 5_000), false) // never another chat's slip
    assert.equal(slipRead(1, null), "ទិញម្ហូប")
    assert.equal(holdForSlip(1, "later", t + 6_000), false) // read → the wait is over
  })
  it("the caption first, then the notes; a retry extends the wait; an expired wait holds nothing", () => {
    const t = 2_000_000
    slipReading(3, 30_000, t)
    slipReading(3, 240_000, t + 10_000) // the reader was busy: retried for about 4 minutes
    assert.equal(holdForSlip(3, "សម្រាប់កូន", t + 200_000), true)
    assert.equal(slipRead(3, "ACLEDA"), "ACLEDA · សម្រាប់កូន")
    slipReading(4, 1_000, t)
    assert.equal(holdForSlip(4, "late", t + 5_000), false)
    assert.equal(slipRead(4, undefined), null)
  })
  it("wired: the slip read marks the wait and takes the notes; the follow-up note checks it first", () => {
    const slip = read("src/lib/server/slip-bot.ts")
    assert.match(slip, /slipReading\(chatId, 45_000\)/)
    assert.match(slip, /slipReading\(chatId, \(SLIP_RETRY_DELAYS_S\.reduce/)
    assert.match(slip, /caption = slipRead\(chatId, caption\)/)
    const cmd = read("src/lib/server/bot-commands.ts")
    const fn = cmd.slice(cmd.indexOf("export async function noteOnRecentEntry"), cmd.indexOf("rpc(\"bot_tx_note_recent\""))
    assert.match(fn, /holdForSlip\(chatId, note\)/)
  })
})
