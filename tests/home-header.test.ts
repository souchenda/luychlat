// The home header on a phone (founder, 18/10/2026): «អស្សាឡាមុអាឡៃកុមក៍, [ឈ្មោះ]» and the Hijri badge shared one
// row and cut each other to «…» at 360–390 px. Now: the greeting alone on a full-width line (wraps, never cut),
// then the short date and the pill on a wrapping row.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { headerDate } from "../src/lib/dates"
import { headerBadge } from "../src/lib/islamic"

const home = readFileSync(join(process.cwd(), "src", "app", "(app)", "home", "page.tsx"), "utf8")
const header = home.slice(home.indexOf("<header>"), home.indexOf("</header>"))

describe("Home header — who on the left, the dates on the right, never a collision", () => {
  it("two lines beside the photo (Task #448): the greeting small, the given name bold under it — a very long name is cut with «…»", () => {
    const who = header.slice(header.indexOf('<Link href="/settings" className="flex min-w-0 flex-col justify-center rounded-md"'), header.indexOf("</Link>", header.indexOf('className="flex min-w-0 flex-col justify-center')))
    assert.match(who, /<span className="flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400" suppressHydrationWarning>\s*\{t\(greeting\.greeting\)\}/)
    // The moon in Islamic Mode; no waving hand anywhere (Task #449); the greeting follows the hour, so it may differ from
    // the server's render by a minute — hydration is told so.
    assert.match(who, /\{greeting\.moon && <MoonIcon className="size-3\.5 fill-amber-300 text-amber-500"/)
    assert.doesNotMatch(header, /HandIcon|✋/)
    assert.match(who, /text-slate-400" suppressHydrationWarning>/)
    assert.match(who, /\{greeting\.name && <h1 className="max-w-\[130px\] truncate text-base font-bold text-slate-900 sm:max-w-\[200px\] dark:text-white">\{greeting\.name\}<\/h1>\}/)
    assert.ok(who.indexOf("{t(greeting.greeting)}") < who.indexOf("{greeting.name}"), "the greeting above the name")
  })
  it("two columns (Task #447): the photo and the greeting left, the date and the pill stacked flush right", () => {
    assert.match(header, /<div className="flex w-full items-center justify-between gap-3">\s*<div className="flex min-w-0 flex-1 items-center gap-3">/)
    // The right column: the date with its year on top, the lunar / Hijri pill under it — right-aligned, never wider than
    // 55% (the pill truncates, the greeting wraps — never «…», never a collision at 360 px).
    const right = header.slice(header.indexOf('<div className="flex max-w-[55%] shrink-0 flex-col items-end gap-1 text-right">'))
    assert.ok(right.length < header.length, "the right column")
    assert.ok(header.indexOf("</h1>") < header.indexOf("max-w-[55%] shrink-0 flex-col items-end"), "the greeting is in the left column, before the dates")
    assert.ok(right.indexOf("{headerDate(today, locale)}") < right.indexOf("<LunarPill onOpen="), "the date above the pill")
    assert.match(right, /badge\.kind === "hijri" \?/) // the Hijri pill in Islamic Mode, in the same place
    // Crisp, legible date (Task #449): slate-700 / slate-200, medium — not the faint grey.
    assert.match(header, /<p className="text-xs font-medium whitespace-nowrap text-slate-700 dark:text-slate-200">\s*<time/)
    assert.doesNotMatch(header, /mt-1 flex flex-wrap items-center justify-between/) // the date is no longer under the greeting
  })
  it("the short date: «ថ្ងៃអាទិត្យ 18 តុលា» (international digits — founder, 21/10/2026)", () => {
    assert.equal(headerDate(new Date(2026, 9, 18, 12), "km"), "ថ្ងៃអាទិត្យ 18 តុលា 2026") // with the year (founder, 21/10/2026)
    assert.equal(headerDate(new Date(2026, 9, 18, 12), "en"), "Sunday, 18 October 2026")
    assert.equal(headerDate(new Date(2026, 9, 18, 12), "zh"), "2026年10月18日 星期日")
    // The full four-digit year, in every language.
    for (const l of ["km", "en", "zh"] as const) assert.match(headerDate(new Date(2027, 0, 5, 12), l), /2027/)
  })
  it("the Hijri badge without «ហ.ស.»: «🌙 7 ជុម៉ាដាល់អូឡា 1448» (international digits)", () => {
    assert.deepEqual(headerBadge({ islamic: true, hijri: { day: 7, month: 5, year: 1448 }, locale: "km" }), { kind: "hijri", text: "🌙 7 ជុម៉ាដាល់អូឡា 1448" })
  })
})

describe("the person's photo beside the greeting (founder, 21/10/2026 — Task #444, after ACLEDA)", () => {
  it("a round 42 px avatar with the emerald hairline and a soft shadow, left of the greeting; both open Settings", () => {
    assert.match(header, /<Link href="\/settings" tabIndex=\{-1\} aria-hidden[^>]*>\s*<ProfileAvatar path=\{profile\?\.avatar_path\} name=\{profile\?\.display_name\?\.trim\(\) \?\? ""\} className="size-\[42px\] border-2 border-emerald-500\/25 text-sm shadow-sm dark:border-emerald-400\/30" \/>/)
    assert.match(header, /<Link href="\/settings" className="flex min-w-0 flex-col justify-center rounded-md" aria-label=\{t\("settings\.title"\)\}>/)
    // The avatar comes before the greeting; the dates are in the right column after it.
    assert.ok(header.indexOf("avatar_path") < header.indexOf("{t(greeting.greeting)}"))
    assert.ok(header.indexOf("</h1>") < header.indexOf("{headerDate(today, locale)}"))
    assert.match(header, /<LunarPill onOpen=/)
  })
  it("no photo: the initials («ចិ» for ចិន្តា, «SC» for Sou Chenda); no name: a person icon, never a «?»", async () => {
    const { initials } = await import("../src/components/profile/profile-avatar")
    assert.equal(initials("ចិន្តា"), "ចិ")
    assert.equal(initials("Sou Chenda"), "SC")
    const avatar = readFileSync(join(process.cwd(), "src/components/profile/profile-avatar.tsx"), "utf8")
    assert.match(avatar, /\) : !name\.trim\(\) \? \(\s*\/\/[^\n]*\n\s*<UserIcon className="size-1\/2" \/>/)
  })
})

describe("the wallet ring: the icon and the count inside, a tap to the wallets (Task #444)", () => {
  const ring = readFileSync(join(process.cwd(), "src/components/wallets/wallet-ring.tsx"), "utf8")
  it("76 px — as tall as the balance stack — with one large wallet icon centred inside; no count drawn (Task #450)", () => {
    assert.match(ring, /<Link href="\/wallets" aria-label=\{label\} title=\{label\} className="relative grid size-\[76px\] shrink-0 place-items-center rounded-full/)
    assert.match(ring, /<WalletIcon className="size-9 text-white drop-shadow-sm" strokeWidth=\{1\.75\} aria-hidden \/>\s*<\/Link>/)
    assert.doesNotMatch(ring, /\{digits\(mix\.total\)\}<\/span>/) // the count is no longer drawn…
    assert.match(ring, /const label = `\$\{t\("netWorth\.walletCount", \{ n: digits\(mix\.total\) \}\)\}/) // …it is the ring's label
    assert.doesNotMatch(ring, /netWorth\.walletCount", \{ n: "" \}/) // no label hanging below
    assert.ok(ring.indexOf("</svg>") < ring.indexOf("<WalletIcon")) // drawn over the segmented ring, centred in it
    assert.match(ring, /walletArcs\(wallets, khrPerUsd, C, \{ byBalance: !hidden \}\)/) // the segments stay
  })
})
