import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { AUTO_PUBLISH_KINDS } from "@/lib/scheduled-posts"
import { shouldPublishToFacebook } from "@/lib/server/facebook-publisher"

import { NATIONAL_DAYS, nationalCaptionHtml, nationalDateLine, nationalDayByKey, nationalDayDate, nationalDaysToPreview } from "./cambodia-holidays"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const keys = (today: string, minutes: number) => nationalDaysToPreview(today, minutes).map((x) => `${x.day.key}:${x.date}`)

describe("Cambodia's national days and royal ceremonies (founder, 20/10/2026)", () => {
  it("the calendar: 15 Oct, 29 Oct, 9 Nov and the rest; lunar days from the official dates", () => {
    const at = (key: string, year = 2026) => nationalDayDate(nationalDayByKey(key)!, year)
    assert.equal(at("king-father-memorial"), "2026-10-15")
    assert.equal(at("coronation"), "2026-10-29")
    assert.equal(at("independence"), "2026-11-09")
    assert.equal(at("king-birthday"), "2026-05-14")
    assert.equal(at("queen-mother-birthday"), "2026-06-18")
    assert.equal(at("constitution-day"), "2026-09-24")
    assert.equal(at("victory-day"), "2026-01-07")
    assert.equal(at("water-festival"), "2026-11-23")
    assert.equal(at("royal-ploughing"), "2026-05-05")
    assert.equal(at("visak-bochea"), "2026-05-01")
    assert.equal(at("khmer-new-year"), "2026-04-14")
    assert.equal(at("water-festival", 2030), null) // no official date yet → nothing guessed
  })
  it("the anniversary line: «២៩ តុលា ២០០៤ – ២៩ តុលា ២០២៦ · ខួបលើកទី២២»; Independence 73rd; the King Father 14th", () => {
    assert.equal(nationalDateLine(nationalDayByKey("coronation")!, "2026-10-29"), "២៩ តុលា ២០០៤ – ២៩ តុលា ២០២៦ · ខួបលើកទី២២")
    assert.match(nationalDateLine(nationalDayByKey("independence")!, "2026-11-09"), /ខួបលើកទី៧៣$/)
    assert.match(nationalDateLine(nationalDayByKey("king-father-memorial")!, "2026-10-15"), /ខួបលើកទី១៤$/)
  })
  it("the preview: from 48 hours before at 08:00 until 07:00 on the day; the Coronation early on the founder's request", () => {
    assert.ok(!keys("2026-11-07", 7 * 60 + 59).includes("independence:2026-11-09"))
    assert.ok(keys("2026-11-07", 8 * 60).includes("independence:2026-11-09"))
    assert.ok(keys("2026-11-09", 6 * 60 + 59).includes("independence:2026-11-09")) // a missed window is caught up
    assert.ok(!keys("2026-11-09", 7 * 60).includes("independence:2026-11-09"))
    assert.ok(keys("2026-10-20", 12 * 60).includes("coronation:2026-10-29")) // the founder asked to inspect it now
    assert.ok(!keys("2026-10-19", 12 * 60).includes("coronation:2026-10-29"))
  })
  it("royal wording on the poster and the caption; Visak with «សូមអនុមោទនា»; no parentheses on a poster", () => {
    const html = nationalCaptionHtml(nationalDayByKey("coronation")!, "2026-10-29")
    // The founder's royal-protocol audit (20/10/2026): the sub-decree title «…គ្រងព្រះបរមរាជសម្បត្តិ», the King's title
    // spacing, the dateline, and the official palace blessing — word for word.
    assert.match(html, /^🇰🇭 <b>ព្រះរាជពិធីគ្រងព្រះបរមរាជសម្បត្តិ<\/b>\nព្រះករុណាព្រះបាទសម្តេចព្រះបរមនាថ នរោត្តម សីហមុនី\nព្រះមហាក្សត្រ នៃព្រះរាជាណាចក្រកម្ពុជា\n📅 ២៩ តុលា ២០០៤ – ២៩ តុលា ២០២៦ · ខួបលើកទី២២/)
    assert.equal(nationalDayByKey("coronation")!.message, "ក្នុងឱកាសដ៏មហានក្ខត្តឫក្សនេះ ទូលព្រះបង្គំយើងខ្ញុំជាថ្នាក់ដឹកនាំ និងបុគ្គលិកទាំងអស់នៃ «អេប លុយឆ្លាត» សូមលំឱនកាយក្រាបបង្គំថ្វាយព្រះសព្ទសាធុការពរជ័យ សូមព្រះករុណាជាអម្ចាស់ជីវិតតម្កល់លើត្បូង ទ្រង់ប្រកបដោយព្រះរាជសុខភាពដ៏ល្អបរិបូរណ៍ ព្រះកាយពលមាំមួន និងព្រះជន្មាយុយឺនយូរជាងរយព្រះវស្សា។")
    for (const d of NATIONAL_DAYS) assert.doesNotMatch(`${d.title} ${d.subtitle ?? ""} ${d.message}`, /សិរីរាជសម្បត្តិ|ព្រះពលានាម័យ|ព្រះរាជសព្ទ|ជីវិតលើត្បូង|ព្រះករុណា ព្រះបាទ|ព្រះមហាក្សត្រនៃ|ខួបលើកទី /, d.key)
    assert.match(nationalDayByKey("visak-bochea")!.message, /^សូមអនុមោទនា/)
    for (const d of NATIONAL_DAYS) assert.doesNotMatch(`${d.pill} ${d.title} ${d.subtitle ?? ""} ${d.message}`, /[()]/, d.key)
  })
  it("approval first — never on the auto-publish list; the channel and the Page once approved", () => {
    assert.ok(!AUTO_PUBLISH_KINDS.includes("NATIONAL_DAY" as never))
    assert.equal(shouldPublishToFacebook({ kind: "national" }), true)
    const sp = read("src/lib/server/scheduled-posts.ts")
    assert.match(sp, /await real\(\)\.schedulePost\("NATIONAL_DAY", `\$\{day\.key\}-\$\{date\}`, \{ key: day\.key, day: date \}, atMinute\(date, PUBLISH_MINUTE\)\)/)
    assert.match(read("supabase/migrations/20270210000000_national_day_posts.sql"), /'ISLAMIC_BULLETIN', 'NATIONAL_DAY'/)
  })
})

describe("Official royal portraits and the crest (founder, 20/10/2026)", () => {
  it("each royal day names its official portrait; the files are documented; none is ever drawn without its file", async () => {
    assert.equal(nationalDayByKey("coronation")!.assets?.portrait, "king_sihamoni")
    assert.equal(nationalDayByKey("king-birthday")!.assets?.portrait, "king_sihamoni")
    assert.equal(nationalDayByKey("king-father-memorial")!.assets?.portrait, "king_father_sihanouk")
    assert.equal(nationalDayByKey("independence")!.assets?.portrait, "king_father_sihanouk")
    assert.equal(nationalDayByKey("queen-mother-birthday")!.assets?.portrait, "queen_mother")
    const readme = read("public/images/holidays/README.txt")
    for (const f of ["royal_crest_gold.png", "portrait_king_sihamoni.png", "portrait_king_father_sihanouk.png", "portrait_queen_mother.png", "bg_independence_monument.png"]) assert.ok(readme.includes(f), f)
    assert.match(readme, /Only authorised copies/)
    const poster = read("src/lib/server/national-day-poster.ts")
    assert.match(poster, /if \(!existsSync\(p\)\) return/) // a missing file is simply not there
    assert.match(poster, /if \(art\.portrait\) return portraitPoster\(d, day, art\)/)
    // The preview tells the approver when the official portrait is not on the server yet.
    assert.match(read("src/lib/server/scheduled-posts.ts"), /មិនទាន់មានព្រះឆាយាល័ក្ខណ៍ផ្លូវការលើ Server ទេ/)
  })
})

describe("The royal images: official only (founder, 20/10/2026 — «We cannot just pull random images from the internet!»)", () => {
  it("the founder's official portrait of His Majesty and the crest are in place; no web portrait remains; no web credit", async () => {
    const { existsSync } = await import("node:fs")
    for (const f of ["royal_crest_gold.png", "portrait_king_sihamoni.png", "portrait_king_sihamoni.jpg"]) assert.ok(existsSync(join(process.cwd(), "public/images/holidays", f)), f)
    for (const f of ["portrait_king_father_sihanouk.png", "portrait_queen_mother.png"]) assert.ok(!existsSync(join(process.cwd(), "public/images/holidays", f)), `${f}: a web photo, removed`)
    const readme = read("public/images/holidays/README.txt")
    assert.match(readme, /the official ceremonial portrait the founder provided/)
    assert.match(readme, /web photos are never\s+used for a royal poster/)
    const { PORTRAIT_CREDITS } = await import("@/lib/server/national-day-poster")
    assert.deepEqual(PORTRAIT_CREDITS, {})
    assert.ok(read("src/lib/server/scheduled-posts.ts").includes("const html = nationalCaptionHtml(d, day) + (credit ? `\\n${credit}` : \"\")"))
    assert.match(read("supabase/migrations/20270213000000_repreview_official_portrait.sql"), /'repreview', 'official-portrait'/)
  })
  it("the Coronation renders with the portrait, nothing cut; a flagged waiting preview is withdrawn and sent again once", async () => {
    const { posterAssetsReady } = await import("@/lib/server/poster-kit")
    const mod = await import("@/lib/server/national-day-poster")
    await posterAssetsReady
    await mod.nationalAssetsReady
    const d = nationalDayByKey("coronation")!
    assert.ok(mod.nationalAssetsFor(d).portrait && mod.nationalAssetsFor(d).crest)
    const r = mod.nationalDayPoster(d, "2026-10-29")
    assert.equal(r.truncated, false)
    assert.deepEqual([r.png.readUInt32BE(16), r.png.readUInt32BE(20)], [1080, 1350]) // the portrait layout
    assert.match(read("src/lib/server/scheduled-posts.ts"), /if \(row\?\.status === "PENDING" && REPREVIEW_READY\.includes\(String\(row\.payload\?\.repreview \?\? ""\)\)\) \{/)
    assert.match(read("supabase/migrations/20270212000000_repreview_with_portrait.sql"), /set payload = payload - 'repreview', previews = '\[\]'::jsonb where id = p_id and status = 'PENDING'/)
  })
})

describe("His Majesty's portrait in HD (founder, 20/10/2026 — «quality must be immaculate»)", () => {
  it("the portrait is at least 1000 px tall (4× Lanczos, sharpened); the card is sent again once with it", async () => {
    const png = readFileSync(join(process.cwd(), "public/images/holidays/portrait_king_sihamoni.png"))
    const [w, h] = [png.readUInt32BE(16), png.readUInt32BE(20)]
    assert.ok(h >= 1000 && w >= 700, `${w} × ${h}`)
    assert.match(read("public/images/holidays/README.txt"), /upscaled 4× to 1108 × 1584/)
    assert.match(read("supabase/migrations/20270214000000_repreview_hd_portrait.sql"), /'repreview', 'hd-portrait'/)
  })
})

describe("A re-preview flag is used only by the build that knows it (regression, 20/10/2026)", () => {
  it("the HD flag was consumed by the previous build (old-size portrait, message 806): each flag is listed in the code it is meant for", () => {
    const sp = read("src/lib/server/scheduled-posts.ts")
    const listed = JSON.parse(sp.match(/const REPREVIEW_READY = (\[[^\]]*\])/)![1].replace(/'/g, '"')) as string[]
    assert.ok(listed.includes("no-clipart") && !listed.includes("hd-portrait-live") && !listed.includes("royal-protocol")) // a used flag leaves the list
    assert.match(read("supabase/migrations/20270216000000_repreview_hd_portrait_live.sql"), /'repreview', 'hd-portrait-live'/)
  })
})

describe("The royal-protocol audit and the national backdrop (founder, 20/10/2026 — «ZERO mistakes»)", () => {
  it("no royal compound, the honorific or «អេប លុយឆ្លាត» is ever split across lines on the poster", async () => {
    const { createCanvas } = await import("@napi-rs/canvas")
    const { FAMILIES, posterAssetsReady, wrap } = await import("@/lib/server/poster-kit")
    const { ROYAL_UNBREAKABLE } = await import("./cambodia-holidays")
    await posterAssetsReady
    const ctx = createCanvas(1080, 1350).getContext("2d")
    ctx.font = `500 28px ${FAMILIES}`
    const message = nationalDayByKey("coronation")!.message
    for (const width of [920, 860, 760, 640]) {
      const lines = wrap(ctx, message, width, 12)
      for (const term of ROYAL_UNBREAKABLE) if (message.includes(term)) assert.ok(lines.some((l) => l.includes(term)), `${term} split at ${width}px: ${lines.join(" | ")}`)
    }
    for (const t of ["«អេប លុយឆ្លាត»", "សូមព្រះករុណាជាអម្ចាស់ជីវិតតម្កល់លើត្បូង", "ព្រះសព្ទសាធុការពរជ័យ", "ព្រះរាជសុខភាព", "ព្រះកាយពលមាំមួន", "ព្រះជន្មាយុយឺនយូរ"]) assert.ok(ROYAL_UNBREAKABLE.includes(t), t)
  })
  it("regression: no drawn clipart (founder, 20/10/2026 — «crude clipart»); the founder's photographic backdrop full bleed, else plain emerald", async () => {
    const poster = read("src/lib/server/national-day-poster.ts")
    assert.doesNotMatch(poster, /independenceMonument|throneHall|flagRibbon|nationalBackdrop/)
    assert.match(poster, /backdrop: "bg_royal_coronation\.jpg"/)
    assert.match(poster, /if \(art\.backdrop\) \{/)
    assert.equal(nationalDayByKey("coronation")!.assets?.backdrop, true)
    assert.match(read("public/images/holidays/README.txt"), /bg_royal_coronation\.jpg/)
    assert.match(read("src/lib/server/scheduled-posts.ts"), /bg_royal_coronation\.jpg\) — ប្រើពណ៌បៃតងធម្មតា/)
    assert.match(read("supabase/migrations/20270219000000_repreview_no_clipart.sql"), /'repreview', 'no-clipart'/)
    // With or without the file, the Coronation renders whole at 1080 × 1350.
    const mod = await import("@/lib/server/national-day-poster")
    const { posterAssetsReady } = await import("@/lib/server/poster-kit")
    await posterAssetsReady
    await mod.nationalAssetsReady
    const r = mod.nationalDayPoster(nationalDayByKey("coronation")!, "2026-10-29")
    assert.equal(r.truncated, false)
    assert.deepEqual([r.png.readUInt32BE(16), r.png.readUInt32BE(20)], [1080, 1350])
  })
})

// docs/ is not in the Docker build context (.dockerignore): checked locally and by the pre-push hook.
const docsHere = existsSync(join(process.cwd(), "docs/BRAND_DESIGN_SYSTEM.md"))
describe("The Master Brand & Visual Design System (founder, 20/10/2026)", { skip: !docsHere && "docs/ is not in the build context" }, () => {
  it("docs/BRAND_DESIGN_SYSTEM.md is the standard CLAUDE.md names, and its royal table matches the code word for word", () => {
    const doc = read("docs/BRAND_DESIGN_SYSTEM.md").replace(/\r\n/g, "\n")
    assert.match(read("CLAUDE.md"), /docs\/BRAND_DESIGN_SYSTEM\.md/)
    for (const chapter of ["Chapter 1", "Chapter 2", "Chapter 3", "Chapter 4", "Chapter 5", "Chapter 6"]) assert.ok(doc.includes(chapter), chapter)
    const d = nationalDayByKey("coronation")!
    const quoted = doc.slice(doc.indexOf("**The Coronation blessing (verbatim):**")).split("\n").filter((l) => l.startsWith("> ")).slice(0, 3).map((l) => l.slice(2)).join(" ")
    assert.equal(quoted, d.message)
    assert.ok(doc.includes(d.title) && doc.includes(nationalDateLine(d, "2026-10-29")))
    for (const line of d.subtitle!.split("\n")) assert.ok(doc.includes(line), line)
  })
})
