// GOLDEN GUARD — published wording (founder, 18/10/2026). The build fails when a quote, tip or spotlight line
// holds a phrase the founder banned, or when a public caption italicises Khmer (Khmer script distorts when
// slanted).
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { MORNING_QUOTES } from "../../src/lib/morning"
import { SPOTLIGHT_CALL, SPOTLIGHT_HOOK, SPOTLIGHT_PILLARS } from "../../src/lib/spotlight"
import { TIPS } from "../../src/lib/tips"
import { ISLAMIC_TIPS } from "../../src/lib/islamic-tips"

/** Banned anywhere in published wording (founder, 18/10/2026). */
const BANNED = ["ធនាគារឪពុកម្តាយ", "បង់ពេញចំនួន", "តាក់ស៊ី"]

/** Every line the channel and the Page publish from the datasets. */
const lines: { where: string; text: string; title?: boolean }[] = [
  ...MORNING_QUOTES.map((q, i) => ({ where: `morning day ${i + 1}`, text: q, title: true })),
  ...[...TIPS, ...ISLAMIC_TIPS].flatMap((t) => [
    { where: `tip ${t.id} title`, text: t.title.km, title: true },
    { where: `tip ${t.id} body`, text: t.body.km },
  ]),
  { where: "spotlight hook", text: SPOTLIGHT_HOOK, title: true },
  { where: "spotlight call", text: SPOTLIGHT_CALL },
  ...SPOTLIGHT_PILLARS.map((p, i) => ({ where: `spotlight pillar ${i + 1}`, text: JSON.stringify(p) })),
]

describe("GOLDEN · published wording", () => {
  it("no banned phrase in any morning quote, tip or spotlight line", () => {
    for (const l of lines) for (const b of BANNED) assert.ok(!l.text.includes(b), `${l.where} contains the banned «${b}»: ${l.text}`)
  })
  it("no title or quote opens with a dangling «ឬ »", () => {
    for (const l of lines.filter((x) => x.title)) assert.ok(!/^\s*ឬ\s/.test(l.text), `${l.where} starts with «ឬ »: ${l.text}`)
  })
  it("the guard itself catches them (it is not looking at an empty set)", () => {
    assert.ok(lines.length > 40)
    assert.ok(BANNED.some((b) => "… ធនាគារឪពុកម្តាយ …".includes(b)))
  })
  it("public captions never italicise (no <i> in the channel / Page senders)", () => {
    for (const file of ["lib/server/community-routine.ts", "lib/server/tip-bot.ts", "lib/server/scheduled-posts.ts", "lib/server/facebook-publisher.ts", "lib/holiday-lifecycle.ts", "lib/atm.ts"]) {
      const src = readFileSync(join(process.cwd(), "src", file), "utf8")
      assert.doesNotMatch(src, /<i>|<em>/, `${file} italicises text`)
    }
  })
})
