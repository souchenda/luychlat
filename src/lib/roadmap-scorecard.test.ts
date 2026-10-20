import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { dailyScorecard, parseRoadmap, scorecardText } from "./roadmap-scorecard"

const MD = [
  "## 1. 🕌 Islamic",
  "- [x] Daily Islamic quiz challenge (5 questions)",
  "- [x] The quiz in the app only — the 12:30 teaser removed (f427225, 8126a43)",
  "- [ ] Bitesize lessons screen — 8 lessons written (a0ffcd7) ⛔ រង់ចាំការពិនិត្យពីអ៊ីម៉ាំ",
  "- [/] Telegram bot audio Adhan alert (6c59557) ⛔ រង់ចាំបើក /adhan on",
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
    assert.equal(items[2].blocker, "រង់ចាំការពិនិត្យពីអ៊ីម៉ាំ")
    assert.equal(items[2].title, "Bitesize lessons screen — 8 lessons written") // the trailing commit list is dropped
    assert.equal(items[4].title, "Master Brand — docs/BRAND_DESIGN_SYSTEM.md")
    assert.deepEqual(parseRoadmap("- [x] A decade of added features (beefcafe1)")[0].hashes, ["beefcafe1"]) // words are not hashes
  })
  it("today: completed = [x] with a commit deployed today; stuck = open with today's commit or a «⛔» reason", () => {
    const deployed = ["f427225aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "97fa957bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"]
    const s = dailyScorecard(parseRoadmap(MD), deployed)
    assert.deepEqual(s.completed.map((i) => i.title), ["The quiz in the app only — the 12:30 teaser removed"])
    assert.deepEqual(
      s.stuck.map((x) => [x.item.title.slice(0, 20), x.reason]),
      [
        ["Bitesize lessons scr", "រង់ចាំការពិនិត្យពីអ៊ីម៉ាំ"],
        ["Telegram bot audio A", "រង់ចាំបើក /adhan on"],
        ["Master Brand — docs/", "បានដាក់ឱ្យដំណើរការ — រង់ចាំការផ្ទៀងផ្ទាត់ ឬការអនុម័ត"],
      ],
    )
    // Untouched items (old [x], a [ ] without a reason) are not today's work.
    assert.ok(!s.stuck.some((x) => x.item.title.startsWith("Mascot")))
  })
  it("the text: the founder's lines, the totals add up, long lists capped", () => {
    const s = dailyScorecard(parseRoadmap(MD), ["f427225aaaa", "97fa957bbbb"])
    const text = scorecardText(s)
    assert.ok(text.startsWith("📋 វឌ្ឍនភាពកិច្ចការងារថ្ងៃនេះ (Daily Task Scorecard)៖\n• ការងារសរុបថ្ងៃនេះ៖ 4 កិច្ចការ\n• សម្រេចបាន (Completed)៖ 1 កិច្ចការ\n   ✅ The quiz"))
    assert.match(text, /• គាំង \/ មិនទាន់បញ្ចប់ \(Stuck \/ Pending\)៖ 3 កិច្ចការ\n   ⏳ Bitesize lessons screen — 8 lessons written — រង់ចាំការពិនិត្យពីអ៊ីម៉ាំ/)
    const many = { completed: Array.from({ length: 19 }, (_, i) => ({ section: "", state: "done" as const, title: `t${i}`, blocker: null, hashes: [] })), stuck: [] }
    assert.match(scorecardText(many), /… និង 4 ទៀត/)
  })
  it("the real ROADMAP.md parses, and ships inside the server image; the nightly report carries the scorecard", () => {
    if (existsSync(join(process.cwd(), "ROADMAP.md"))) assert.ok(parseRoadmap(readFileSync(join(process.cwd(), "ROADMAP.md"), "utf8")).length > 50)
    if (existsSync(join(process.cwd(), "Dockerfile"))) assert.match(readFileSync(join(process.cwd(), "Dockerfile"), "utf8"), /COPY --from=builder --chown=nextjs:nodejs \/app\/ROADMAP\.md \.\/ROADMAP\.md/)
    const server = readFileSync(join(process.cwd(), "src/lib/server/nightly-report.ts"), "utf8")
    assert.match(server, /scorecardText\(dailyScorecard\(parseRoadmap\(/)
    assert.match(readFileSync(join(process.cwd(), "supabase/migrations/20270231000000_deployed_hashes.sql"), "utf8"), /function public\.bot_deployed_hashes/)
  })
})
