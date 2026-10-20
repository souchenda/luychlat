import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
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
  it("the anniversary line: «២៩ តុលា ២០០៤ - ២៩ តុលា ២០២៦ · ខួបលើកទី ២២»; Independence 73rd; the King Father 14th", () => {
    assert.equal(nationalDateLine(nationalDayByKey("coronation")!, "2026-10-29"), "២៩ តុលា ២០០៤ - ២៩ តុលា ២០២៦ · ខួបលើកទី ២២")
    assert.match(nationalDateLine(nationalDayByKey("independence")!, "2026-11-09"), /ខួបលើកទី ៧៣$/)
    assert.match(nationalDateLine(nationalDayByKey("king-father-memorial")!, "2026-10-15"), /ខួបលើកទី ១៤$/)
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
    // The founder's header (20/10/2026): «ព្រះរាជពិធីគ្រងព្រះបរមសិរីរាជសម្បត្តិ», and the founder's royal opening.
    assert.match(html, /ទូលព្រះបង្គំយើងខ្ញុំជាថ្នាក់ដឹកនាំ និងបុគ្គលិកទាំងអស់នៃ អេប លុយឆ្លាត សូមលំឱនកាយថ្វាយព្រះរាជសព្ទសាធុការពរជ័យ/)
    assert.match(html, /^🇰🇭 <b>ព្រះរាជពិធីគ្រងព្រះបរមសិរីរាជសម្បត្តិ<\/b>\nព្រះករុណា ព្រះបាទសម្តេចព្រះបរមនាថ នរោត្តម សីហមុនី\nព្រះមហាក្សត្រនៃព្រះរាជាណាចក្រកម្ពុជា\n📅 ២៩ តុលា ២០០៤ - ២៩ តុលា ២០២៦ · ខួបលើកទី ២២/)
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
    assert.match(read("src/lib/server/scheduled-posts.ts"), /if \(row\?\.status === "PENDING" && row\.payload\?\.repreview\) \{/)
    assert.match(read("supabase/migrations/20270212000000_repreview_with_portrait.sql"), /set payload = payload - 'repreview', previews = '\[\]'::jsonb where id = p_id and status = 'PENDING'/)
  })
})
