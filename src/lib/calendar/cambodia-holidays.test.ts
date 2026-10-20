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
  it("the preview: from 48 hours before at 08:00 until the 05:00 publication on the day; the Coronation early on the founder's request", () => {
    assert.ok(!keys("2026-11-07", 7 * 60 + 59).includes("independence:2026-11-09"))
    assert.ok(keys("2026-11-07", 8 * 60).includes("independence:2026-11-09"))
    assert.ok(keys("2026-11-09", 4 * 60 + 59).includes("independence:2026-11-09")) // a missed window is caught up
    assert.ok(!keys("2026-11-09", 5 * 60).includes("independence:2026-11-09"))
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
    assert.ok(mod.nationalAssetsFor(d).portrait)
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
    assert.ok(listed.includes("five-am") && !listed.includes("title-below") && !listed.includes("smaller-portrait")) // a used flag leaves the list
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
    for (const [size, width] of [[28, 920], [28, 860], [26, 800], [28, 760], [28, 640]] as const) {
      ctx.font = `500 ${size}px ${FAMILIES}`
      const lines = wrap(ctx, message, width, 12)
      for (const term of ROYAL_UNBREAKABLE) if (message.includes(term)) assert.ok(lines.some((l) => l.includes(term)), `${term} split at ${width}px: ${lines.join(" | ")}`)
      assert.ok(lines.every((l) => [...l.trim()].length > 12), `an orphaned word at ${width}px: ${lines.join(" | ")}`)
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
    const quoted = doc.slice(doc.indexOf("**The Coronation blessing (verbatim, in the caption):**")).split("\n").filter((l) => l.startsWith("> ")).slice(0, 3).map((l) => l.slice(2)).join(" ")
    assert.equal(quoted, d.message)
    assert.ok(doc.includes(d.title) && doc.includes(nationalDateLine(d, "2026-10-29")))
    for (const line of d.subtitle!.split("\n")) assert.ok(doc.includes(line), line)
  })
})

describe("The founder's kbach backdrop (20/10/2026)", () => {
  it("the Coronation renders on the founder's kbach backdrop (the four golden corners), full bleed", async () => {
    const { existsSync } = await import("node:fs")
    assert.ok(existsSync(join(process.cwd(), "public/images/holidays/bg_royal_coronation.jpg")))
    const jpg = readFileSync(join(process.cwd(), "public/images/holidays/bg_royal_coronation.jpg"))
    assert.deepEqual([jpg[0], jpg[1]], [0xff, 0xd8]) // a real JPEG
    const poster = read("src/lib/server/national-day-poster.ts")
    assert.match(poster, /if \(art\.backdrop\) \{/)
    assert.match(read("public/images/holidays/README.txt"), /traditional Khmer kbach/)
    assert.match(read("supabase/migrations/20270221000000_repreview_kbach_backdrop.sql"), /'repreview', 'kbach-backdrop'/)
  })
})

describe("Royal protocol: nothing commercial above His Majesty (founder, 20/10/2026 — the CBC model)", () => {
  it("regression: the brand badge sat above the King's head — on the royal poster the mascot and the name are drawn only in the footer", () => {
    const poster = read("src/lib/server/national-day-poster.ts")
    const royal = poster.slice(poster.indexOf("function portraitPoster("))
    const footer = royal.indexOf("// The footer — the only place of the brand")
    assert.ok(footer > 0)
    const above = royal.slice(0, footer)
    assert.doesNotMatch(above, /posterMascot\(\)|fillText\("អេប លុយឆ្លាត"/) // nothing commercial before the footer
    assert.match(royal.slice(footer), /const brand = "អេប លុយឆ្លាត · app\.luychlat\.com"/)
    assert.match(royal.slice(footer), /if \(mascot\) ctx\.drawImage\(mascot, bx, footer \+ 3, icon, icon\)/)
    assert.match(read("supabase/migrations/20270222000000_repreview_royal_footer.sql"), /'repreview', 'royal-footer'/)
  })
})

describe("Nothing above His Majesty — no crest, no logo (founder, 20/10/2026)", () => {
  it("regression: a crest above the King's head (top right, then centred) — the royal poster draws no crest; the portrait is the one focal point", () => {
    const poster = read("src/lib/server/national-day-poster.ts")
    const royal = poster.slice(poster.indexOf("function portraitPoster("))
    assert.doesNotMatch(royal, /art\.crest/) // the crest is never drawn on a royal portrait poster
    assert.doesNotMatch(poster, /CREST_AT|CREST_HEIGHT/)
    const footer = royal.indexOf("// The footer — the only place of the brand")
    assert.doesNotMatch(royal.slice(0, footer), /drawImage\((?!art\.backdrop|art\.portrait|img)/) // only the backdrop and the portrait above the footer
    assert.match(read("supabase/migrations/20270224000000_repreview_no_crest.sql"), /'repreview', 'no-crest'/)
  })
})

describe("A short poster blessing is possible; the caption always keeps the full paragraph (founder, 20/10/2026)", () => {
  it("posterMessage is drawn on the graphic when a day has one; the Coronation shows the full palace paragraph (the founder's latest layout)", async () => {
    const d = nationalDayByKey("coronation")!
    assert.equal(d.posterMessage, undefined)
    const { nationalPosterLines } = await import("@/lib/server/national-day-poster")
    assert.equal(nationalPosterLines(d, "2026-10-29").message, d.message)
    assert.equal(nationalPosterLines({ ...d, posterMessage: "a\nb" }, "2026-10-29").message, "a\nb")
    assert.ok(nationalCaptionHtml(d, "2026-10-29").includes(d.message))
    assert.match(read("supabase/migrations/20270225000000_repreview_short_blessing.sql"), /'repreview', 'short-blessing'/)
  })
})

describe("The final composition: the portrait raised, the lower half open (founder, 20/10/2026)", () => {
  it("the arch rises into the space the crest left; the blessing sits in a band clear of the corner ornaments", () => {
    const poster = read("src/lib/server/national-day-poster.ts")
    assert.match(poster, /const BLESSING_BAND_BOTTOM = 1090/)
    assert.match(poster, /const lineWidth = PW - 2 \* 140/) // ≤ 800 px: clear of the bottom corner ornaments
    assert.match(read("supabase/migrations/20270226000000_repreview_raised_portrait.sql"), /'repreview', 'raised-portrait'/)
  })
})

describe("The occasion's title — under the portrait (founder, 20/10/2026, after trying it on top)", () => {
  it("TITLE_POSITION is «below»: nothing is drawn above the arch; on top the title would stay between the corner ornaments", async () => {
    const mod = await import("@/lib/server/national-day-poster")
    assert.equal(mod.TITLE_POSITION, "below")
    const poster = read("src/lib/server/national-day-poster.ts")
    const royal = poster.slice(poster.indexOf("function portraitPoster("))
    assert.match(royal, /const fy = titleOnTop \? 200 : 140/)
    assert.ok(royal.indexOf("const below = wrap(ctx, text.title, width, 2)") > royal.indexOf("archPath(ctx, fx, fy, fw, fh)"), "the title after the arch")
    assert.match(poster, /const TITLE_TOP_WIDTH = 560/) // the top option stays clear of the corners
    const { posterAssetsReady } = await import("@/lib/server/poster-kit")
    await posterAssetsReady
    await mod.nationalAssetsReady
    assert.equal(mod.nationalDayPoster(nationalDayByKey("coronation")!, "2026-10-29").truncated, false)
    assert.match(read("supabase/migrations/20270229000000_repreview_title_below.sql"), /'repreview', 'title-below'/)
  })
})

describe("The portrait at a size that stays sharp (founder, 20/10/2026 — «the photo feels too big»)", () => {
  it("regression: the arch at 470 px magnified the 277 px official portrait ~1.7× (soft) — now 390 × 470, at most ~1.45×", () => {
    const poster = read("src/lib/server/national-day-poster.ts")
    const royal = poster.slice(poster.indexOf("function portraitPoster("))
    const fw = Number(royal.match(/const fw = (\d+)/)![1])
    const fh = Number(royal.match(/const fh = (\d+)/)![1])
    assert.deepEqual([fw, fh], [390, 470])
    assert.ok(fw / 277 <= 1.45, String(fw / 277)) // the source crop is 277 px wide (README.txt)
    assert.match(read("supabase/migrations/20270228000000_repreview_smaller_portrait.sql"), /'repreview', 'smaller-portrait'/)
  })
})

describe("National days at 05:00, the day named on the card (founder, 20/10/2026)", () => {
  it("published at 05:00; the waiting Coronation moves to 29 October 05:00; the card says the day, on the button too", async () => {
    const { PUBLISH_MINUTE } = await import("./cambodia-holidays")
    assert.equal(PUBLISH_MINUTE, 5 * 60)
    // Locked in CLAUDE.md (founder, 20/10/2026): 05:00 sharp once approved; else held, with the urgent reminder.
    assert.match(read("CLAUDE.md"), /HOLIDAY TIMING & SCOPE — locked/)
    assert.match(read("CLAUDE.md"), /ALL holiday posters MUST be scheduled and published strictly at \*\*05:00\*\*/)
    assert.match(read("src/lib/server/scheduled-posts.ts"), /if \(action === "hold"\) await remindFounder\(row\)/)
    const sql = read("supabase/migrations/20270230000000_national_day_five_am.sql")
    assert.match(sql, /set publish_at = timestamptz '2026-10-29 05:00:00\+07'/)
    assert.match(sql, /'repreview', 'five-am'/)
    const { kmWhen, previewButtons, statusLine } = await import("@/lib/scheduled-posts")
    const at = "2026-10-28T22:00:00Z" // 29 October 05:00, Cambodia
    const now = "2026-10-20T08:30:00Z"
    const where = "✈️ Telegram Channel + 🔵 Facebook Page"
    assert.equal(kmWhen(at, now), "ថ្ងៃទី ២៩ តុលា ម៉ោង ០៥:០០ ព្រឹក")
    assert.equal(statusLine("PENDING", where, at, now), `🔒 មិនផ្សាយទេ ប្រសិនបើមិនទាន់យល់ព្រម — ចុច «✅ យល់ព្រម» ដើម្បីផ្សាយទៅ [ ${where} ] នៅថ្ងៃទី ២៩ តុលា ម៉ោង ០៥:០០ ព្រឹក។`)
    assert.equal(previewButtons(7, "PENDING", { telegram: true, facebook: true }, "NATIONAL_DAY", { publishAt: at, now })[0][0].text, "✅ យល់ព្រម (ផ្សាយថ្ងៃ ២៩ តុលា ម៉ោង ០៥:០០ ព្រឹក)")
    // The same day keeps the short wording (the golden publisher test).
    assert.equal(kmWhen(at, "2026-10-28T21:00:00Z"), "ម៉ោង ០៥:០០ ព្រឹក")
    assert.equal(previewButtons(7, "PENDING", { telegram: true, facebook: true }, "MORNING", { publishAt: at, now: "2026-10-28T21:00:00Z" })[0][0].text, "✅ យល់ព្រម (ផ្សាយតាមម៉ោង)")
  })
})

describe("The all-inclusive holiday engine — national, Islamic, Chinese, global (founder, 20/10/2026)", () => {
  it("the four groups are on the calendar, every one published at the one 05:00 time", () => {
    const keys = NATIONAL_DAYS.map((d) => d.key)
    for (const k of ["coronation", "independence", "water-festival", "king-birthday", "victory-day"]) assert.ok(keys.includes(k), k) // A
    for (const k of ["eid-al-fitr", "eid-al-adha", "arafah", "islamic-new-year", "mawlid"]) assert.ok(keys.includes(k), k) // B
    for (const k of ["chinese-new-year", "qingming", "hungry-ghost", "mid-autumn"]) assert.ok(keys.includes(k), k) // C
    for (const k of ["new-year", "womens-day", "labor-day", "khmer-new-year", "pchum-ben"]) assert.ok(keys.includes(k), k) // D
    assert.equal(new Set(keys).size, keys.length)
    const sp = read("src/lib/server/scheduled-posts.ts")
    assert.equal((sp.match(/schedulePost\("NATIONAL_DAY"[^\n]*atMinute\(date, PUBLISH_MINUTE\)\)/g) ?? []).length, 2) // one time for all
  })
  it("the dates: Hijri days by the calendar, Chinese days by the lunisolar calendar, Qingming by its table", () => {
    const at = (key: string, year: number) => nationalDayDate(nationalDayByKey(key)!, year)
    assert.equal(at("eid-al-fitr", 2026), "2026-03-20")
    assert.equal(at("eid-al-adha", 2026), "2026-05-27")
    assert.equal(at("arafah", 2026), "2026-05-26")
    assert.equal(at("islamic-new-year", 2026), "2026-06-16")
    assert.equal(at("chinese-new-year", 2026), "2026-02-17")
    assert.equal(at("chinese-new-year", 2027), "2027-02-06")
    assert.equal(at("mid-autumn", 2026), "2026-09-25")
    assert.equal(at("hungry-ghost", 2026), "2026-08-27")
    assert.equal(at("qingming", 2027), "2027-04-05")
    assert.equal(at("qingming", 2031), null) // no table entry → nothing guessed
    assert.equal(at("pchum-ben", 2026), "2026-10-11") // Pchum Thom
    // The admin's Hijri offset moves the Islamic days.
    assert.notEqual(nationalDayDate(nationalDayByKey("eid-al-fitr")!, 2026, 1), "2026-03-20")
  })
  it("the Islamic holidays: @LuyChlatIslamic only, never the Page; the date flagged; the glossary's footer", async () => {
    const { nationalChannel, nationalDateNote } = await import("./cambodia-holidays")
    for (const d of NATIONAL_DAYS) assert.equal(nationalChannel(d), d.kind === "islamic" ? "islamic" : "community", d.key)
    assert.match(nationalDateNote(nationalDayByKey("eid-al-adha")!) ?? "", /ប្រែប្រួលតាមការមើលព្រះចន្ទ/)
    assert.equal(nationalDateNote(nationalDayByKey("coronation")!), null)
    const sp = read("src/lib/server/scheduled-posts.ts")
    assert.ok(sp.includes('if (channelFor(row.kind) === "islamic" || islamicNationalDay(row)) return { telegram: islamicChannelConfigured(), facebook: false, channel: "islamic" }'))
    assert.ok(sp.includes('if (!islamic && facebookConfig() && shouldPublishToFacebook({ kind: "national" }))'))
    assert.ok(sp.includes("nationalDaysToPreview(now.day, now.hour * 60 + now.minute, offset)"))
    assert.ok(read("src/lib/server/national-day-poster.ts").includes('drawFooter(ctx, d.kind === "islamic" ? { community: ISLAMIC_COMMUNITY_LINE } : {})'))
    assert.ok(nationalCaptionHtml(nationalDayByKey("eid-al-fitr")!, "2026-03-20").startsWith("🌙 "))
    assert.ok(nationalCaptionHtml(nationalDayByKey("qingming")!, "2027-04-05").startsWith("🏮 "))
  })
  it("every new holiday renders whole — nothing cut", async () => {
    const { posterAssetsReady } = await import("@/lib/server/poster-kit")
    const mod = await import("@/lib/server/national-day-poster")
    await posterAssetsReady
    await mod.nationalAssetsReady
    for (const k of ["eid-al-fitr", "eid-al-adha", "arafah", "islamic-new-year", "mawlid", "chinese-new-year", "qingming", "hungry-ghost", "mid-autumn", "pchum-ben"]) {
      const d = nationalDayByKey(k)!
      assert.equal(mod.nationalDayPoster(d, nationalDayDate(d, 2027) ?? "2027-01-01").truncated, false, k)
    }
  })
})
