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

describe("Home header — greeting on its own line, never «…»", () => {
  it("the greeting is a full-width block that wraps (no truncate)", () => {
    const h1 = header.slice(header.indexOf('<h1 className="block w-full'), header.indexOf("</h1>", header.indexOf('<h1 className="block w-full')))
    assert.match(h1, /className="block w-full break-words/)
    assert.doesNotMatch(h1, /truncate/)
  })
  it("the date and the pill share a wrapping row under it", () => {
    assert.match(header, /<div className="mt-1 flex flex-wrap items-center justify-between gap-2">/)
    assert.ok(header.indexOf("</h1>") < header.indexOf("flex flex-wrap items-center justify-between gap-2"))
    assert.match(header, /\{headerDate\(today, locale\)\}/)
    assert.doesNotMatch(header, /max-w-\[58%\]/)
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
  it("a round 48 px avatar with the emerald hairline and a soft shadow, left of the greeting; both open Settings", () => {
    assert.match(header, /<div className="flex items-start gap-3">\s*\{workspace\?\.type !== "BUSINESS" && \(\s*<Link href="\/settings" tabIndex=\{-1\} aria-hidden[^>]*>\s*<ProfileAvatar path=\{profile\?\.avatar_path\} name=\{profile\?\.display_name\?\.trim\(\) \?\? ""\} className="size-12 border-2 border-emerald-500\/25 text-sm shadow-sm dark:border-emerald-400\/30" \/>/)
    assert.match(header, /<Link href="\/settings" className="block rounded-md" aria-label=\{t\("settings\.title"\)\}>\s*<h1 className="block w-full break-words/)
    // The avatar comes before the greeting; the date and the pill stay on their row under it.
    assert.ok(header.indexOf("avatar_path") < header.indexOf("{t(greeting.key, greeting.params)}"))
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
  it("a wallet icon with the count under it, inside the ring — no «កាបូប» label hanging below", () => {
    assert.match(ring, /<Link href="\/wallets" aria-label=\{label\}/)
    assert.match(ring, /<WalletIcon className="size-\[18px\] text-white\/85" strokeWidth=\{2\} \/>\s*<span className="mt-0\.5 text-base font-bold tabular-nums">\{digits\(mix\.total\)\}<\/span>/)
    assert.doesNotMatch(ring, /netWorth\.walletCount", \{ n: "" \}/) // the old label under the ring
    assert.ok(ring.indexOf("</svg>") < ring.indexOf("<WalletIcon")) // drawn over the ring, centred in it
  })
})
