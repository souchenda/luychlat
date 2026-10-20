import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { accomplishments, highlights, OWNER_HEADING, ownerTag, paginate, pendingSections, TRUNCATION, type PendingItem } from "./report-standard"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")

const ITEMS: PendingItem[] = [
  { title: "Hadith review", owner: "external", action: "អ៊ីម៉ាំពិនិត្យ" },
  { title: "Coronation poster", owner: "founder", action: "ចុច ✅ លើកាត #833" },
  { title: "Members-only gate", owner: "verify", action: "សាកពី Telegram ដែលមិនទាន់ភ្ជាប់" },
  { title: "APK 1.4", owner: "engineering", action: "សាងសង់ APK" },
  { title: "Du'a texts", owner: "founder", action: "ជ្រើសអត្ថបទឌុអា" },
]

describe("The Reporting Standard (founder, 20/10/2026)", () => {
  it("pending work: four sections in a fixed order 🟢 🟡 ⏳ ⚙️, numbered 1…N across them, each with its bracketed next step", () => {
    const text = pendingSections(ITEMS).join("\n")
    assert.equal(
      text,
      [
        "📌 កិច្ចការកំពុងរង់ចាំ (5)៖",
        "",
        `${OWNER_HEADING.verify} — 1`,
        "1. Members-only gate [សកម្មភាព៖ សាកពី Telegram ដែលមិនទាន់ភ្ជាប់]",
        "",
        `${OWNER_HEADING.founder} — 2`,
        "2. Coronation poster [សកម្មភាព៖ ចុច ✅ លើកាត #833]",
        "3. Du'a texts [សកម្មភាព៖ ជ្រើសអត្ថបទឌុអា]",
        "",
        `${OWNER_HEADING.external} — 1`,
        "4. Hadith review [សកម្មភាព៖ អ៊ីម៉ាំពិនិត្យ]",
        "",
        `${OWNER_HEADING.engineering} — 1`,
        "5. APK 1.4 [សកម្មភាព៖ សាងសង់ APK]",
      ].join("\n"),
    )
    assert.match(OWNER_HEADING.verify, /^🟢 .*Deployed & Ready for Verification/)
    assert.match(OWNER_HEADING.founder, /^🟡 .*Awaiting Founder Action \/ Approval/)
    assert.match(OWNER_HEADING.external, /^⏳ .*Awaiting External Review/)
    assert.match(OWNER_HEADING.engineering, /^⚙️ .*Engineering \/ Tech Pending/)
    assert.deepEqual(pendingSections([]), ["📌 កិច្ចការកំពុងរង់ចាំ៖ គ្មានទេ 🎉"]) // an empty section is never shown
  })
  it("the owner is the explicit tag that starts a reason — never guessed from its words", () => {
    assert.deepEqual(ownerTag("🟡 ចុច ✅ លើកាត #833"), { owner: "founder", action: "ចុច ✅ លើកាត #833" })
    assert.deepEqual(ownerTag("⏳ អ៊ីម៉ាំពិនិត្យ"), { owner: "external", action: "អ៊ីម៉ាំពិនិត្យ" })
    assert.deepEqual(ownerTag("⚙️ សាងសង់ APK"), { owner: "engineering", action: "សាងសង់ APK" })
    assert.deepEqual(ownerTag("🟢៖ សាកល្បង"), { owner: "verify", action: "សាកល្បង" })
    assert.equal(ownerTag("រង់ចាំការពិនិត្យពីអ៊ីម៉ាំ"), null)
  })
  it("✅ accomplishments: 3–5 key ones on top; every other one listed in full after them — none dropped", () => {
    const seven = ["a", "b", "c", "d", "e", "f", "g"]
    const lines = accomplishments(seven)
    assert.deepEqual(lines.slice(0, 6), ["✅ សមិទ្ធផលសំខាន់ៗថ្ងៃនេះ (7)៖", "✅ a", "✅ b", "✅ c", "✅ d", "✅ e"])
    assert.deepEqual(lines.slice(6), ["", "☑️ ផ្សេងទៀតដែលបានសម្រេច (2)៖", "• f", "• g"])
    assert.equal(accomplishments(seven, 1).filter((l) => l.startsWith("✅ ") && !l.includes("៖")).length, 3) // never fewer than 3
    assert.equal(highlights(seven, 9).length, 6) // never more than 5
    assert.match(accomplishments([])[0], /មិនទាន់មានការដាក់ឱ្យដំណើរការថ្មីទេ/)
  })
  it("no truncation: a long report becomes numbered parts under Telegram's limit, every character kept, in order", () => {
    const lines = Array.from({ length: 400 }, (_, i) => `${i + 1}. កិច្ចការទី ${i + 1} — ${"ក".repeat(20)}`)
    const text = lines.join("\n")
    const pages = paginate(text)
    assert.ok(pages.length > 1)
    pages.forEach((p, i) => {
      assert.ok(p.length <= 3900, `part ${i + 1}: ${p.length}`)
      assert.ok(p.startsWith(`(${"០១២៣៤៥៦៧៨៩"[i + 1]}/${"០១២៣៤៥៦៧៨៩"[pages.length]})\n`))
    })
    assert.equal(pages.map((p) => p.slice(p.indexOf("\n") + 1)).join("\n"), text) // nothing lost, nothing added
    const huge = "ខ".repeat(9000) // one line longer than a page
    assert.equal(paginate(huge).map((p) => p.slice(p.indexOf("\n") + 1)).join(""), huge)
    assert.deepEqual(paginate("short"), ["short"])
    assert.equal(paginate("a\n\nb", 3900)[0], "a\n\nb") // empty lines kept
  })
  it("regression: «… និង 4 ទៀត» and «… +2 more» hid items — no report module truncates or slices its text", () => {
    for (const s of ["   … និង 4 ទៀត", "… +2 more", "and 3 more"]) assert.match(s, TRUNCATION)
    for (const f of ["src/lib/roadmap-scorecard.ts", "src/lib/server/nightly-report.ts", "src/lib/server/dev-eod.ts", "src/lib/nightly-report.ts"]) {
      const src = read(f)
      assert.doesNotMatch(src, /… និង \$\{|… \+\$\{|more`|\.slice\(0, ?\d{4}\)|const short = /, f)
    }
    for (const f of ["src/lib/server/nightly-report.ts", "src/lib/server/dev-eod.ts"]) assert.match(read(f), /paginate\(/, f)
  })
  it("ROADMAP.md: every «⛔» names its owner (🟢 🟡 ⏳ ⚙️) and the next step; CLAUDE.md documents the standard", () => {
    if (existsSync(join(process.cwd(), "ROADMAP.md"))) {
      const roadmap = read("ROADMAP.md").split("\n").filter((l) => /^- \[[ x/]\] /.test(l) && l.includes("⛔"))
      assert.ok(roadmap.length > 5)
      for (const l of roadmap) assert.ok(ownerTag(l.split("⛔").slice(1).join("⛔")), l.slice(0, 80))
    }
    const claude = read("CLAUDE.md")
    assert.match(claude, /## Reporting Standards/)
    assert.match(claude, /src\/lib\/report-standard\.ts/)
  })
})
