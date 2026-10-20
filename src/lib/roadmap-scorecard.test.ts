import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { dailyScorecard, parseRoadmap, pendingOf, summaryParts } from "./roadmap-scorecard"

const MD = [
  "## 1. 🕌 Islamic",
  "- [x] Daily Islamic quiz challenge (5 questions)",
  "- [x] The quiz in the app only — the 12:30 teaser removed (f427225, 8126a43)",
  "- [ ] Bitesize lessons screen — 8 lessons written (a0ffcd7) ⛔ ⏳ អ៊ីម៉ាំពិនិត្យមេរៀន",
  "- [/] Telegram bot audio Adhan alert (6c59557) ⛔ 🟡 បើក /adhan on",
  "## 3. 🎨 Media",
  "- [/] **Master Brand** — `docs/BRAND_DESIGN_SYSTEM.md` (97fa957)",
  "- [x] Old poster (98bcf47)",
  "- [ ] Mascot master ≥ 1024 px",
].join("\n")

describe("The Daily Task Scorecard (founder, 20/10/2026)", () => {
  it("parses ROADMAP.md: the state, the title without its commit list, the commits, the «⛔» reason, the section", () => {
    const items = parseRoadmap(MD)
    assert.equal(items.length, 7)
    assert.deepEqual(items[1], { section: "1. 🕌 Islamic", state: "done", title: "The quiz in the app only — the 12:30 teaser removed", blocker: null, hashes: ["f427225", "8126a43"] })
    assert.equal(items[2].blocker, "⏳ អ៊ីម៉ាំពិនិត្យមេរៀន")
    assert.equal(items[2].title, "Bitesize lessons screen — 8 lessons written") // the trailing commit list is dropped
    assert.equal(items[4].title, "Master Brand — docs/BRAND_DESIGN_SYSTEM.md")
    assert.deepEqual(parseRoadmap("- [x] A decade of added features (beefcafe1)")[0].hashes, ["beefcafe1"]) // words are not hashes
  })
  it("today: completed = [x] with a commit deployed today; pending = open with today's commit or a «⛔», each with its owner", () => {
    const deployed = ["f427225aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "97fa957bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"]
    const s = dailyScorecard(parseRoadmap(MD), deployed)
    assert.deepEqual(s.completed.map((i) => i.title), ["The quiz in the app only — the 12:30 teaser removed"])
    assert.deepEqual(
      s.pending.map((x) => [x.item.title.slice(0, 20), x.owner, x.action]),
      [
        ["Bitesize lessons scr", "external", "អ៊ីម៉ាំពិនិត្យមេរៀន"],
        ["Telegram bot audio A", "founder", "បើក /adhan on"],
        ["Master Brand — docs/", "verify", "សាកល្បងលើ app.luychlat.com ហើយបញ្ជាក់"], // live today, no reason → the founder's test
      ],
    )
    // Untouched items (old [x], a [ ] without a reason) are not today's work.
    assert.ok(!s.pending.some((x) => x.item.title.startsWith("Mascot")))
    // A reason without an owner tag is engineering's to sort out — never guessed from its words.
    const untagged = pendingOf({ section: "", state: "todo", title: "x", blocker: "រង់ចាំស្ថាបនិក", hashes: [] }, false)
    assert.deepEqual([untagged.owner, untagged.action], ["engineering", "រង់ចាំស្ថាបនិក"])
  })
  it("the summary parts: today's finished items (highlights), only the founder's actions, the other owners counted", () => {
    const parts = summaryParts(dailyScorecard(parseRoadmap(MD), ["f427225aaaa", "97fa957bbbb"]))
    assert.deepEqual(parts.done.map((d) => d.title), ["The quiz in the app only — the 12:30 teaser removed"])
    assert.deepEqual(parts.actions, ["បើក /adhan on"])
    assert.deepEqual(parts.others, { verify: 1, external: 1, engineering: 0 })
  })
  it("the real ROADMAP.md parses, and ships inside the server image; the nightly report carries the scorecard", () => {
    if (existsSync(join(process.cwd(), "ROADMAP.md"))) assert.ok(parseRoadmap(readFileSync(join(process.cwd(), "ROADMAP.md"), "utf8")).length > 50)
    if (existsSync(join(process.cwd(), "Dockerfile"))) assert.match(readFileSync(join(process.cwd(), "Dockerfile"), "utf8"), /COPY --from=builder --chown=nextjs:nodejs \/app\/ROADMAP\.md \.\/ROADMAP\.md/)
    const server = readFileSync(join(process.cwd(), "src/lib/server/nightly-report.ts"), "utf8")
    assert.match(server, /summaryParts\(dailyScorecard\(parseRoadmap\(/)
    assert.match(readFileSync(join(process.cwd(), "supabase/migrations/20270231000000_deployed_hashes.sql"), "utf8"), /function public\.bot_deployed_hashes/)
  })
})
