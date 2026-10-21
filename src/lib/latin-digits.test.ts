import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { dictionaries } from "@/lib/i18n/dictionaries"
import { formatDuration } from "@/lib/format"
import { headerBadge } from "@/lib/islamic"
import { rielTick } from "@/lib/spending-pulse"
import { walletMix } from "@/lib/wallet-overview"

import { formatHijri } from "@/lib/islamic"
import { formatLunar, khmerLunarDate } from "@/lib/khmer-lunar"

import { dayDate, headerDate, latinDigits, longDate, monthLabel } from "./dates"

const KHMER_DIGIT = /[០-៩]/

/**
 * Khmer strings that keep Khmer digits on purpose: the bot's Telegram messages (bot.*) and the keys server code also
 * sends (a post, a bot reply). Each one is a decision; the app's screens use international digits.
 */
const KEEPS_KHMER_DIGITS = new Set(["bank.noWallet"])

/** The dashboard, the hero card, the quick actions and the wallets page (founder, 21/10/2026). */
const SCREENS = [
  "src/app/(app)/home/page.tsx",
  "src/app/(app)/wallets/page.tsx",
  "src/components/wallets/net-worth-card.tsx",
  "src/components/wallets/wallet-ring.tsx",
  "src/components/wallets/wallet-list.tsx",
  "src/components/wallets/wallet-groups.tsx",
  "src/components/dashboard/quick-actions.tsx",
  "src/components/dashboard/market-rates-card.tsx",
  "src/components/dashboard/lunar-pill.tsx",
  "src/components/dashboard/calendar-switch-sheet.tsx",
  "src/components/dashboard/spending-trend-card.tsx",
  "src/components/dashboard/smart-hub.tsx",
  "src/components/islamic/next-prayer-chip.tsx",
  "src/components/market/nbc-stamp.tsx",
  "src/components/business/business-value-card.tsx",
  "src/components/loans/cbc-health-modal.tsx",
  "src/components/loans/cbc-strip.tsx",
  "src/lib/loans/cbc.ts",
  "src/lib/cbc-engine.ts",
]

describe("International digits on every screen (founder, 21/10/2026 — like ABA and ACLEDA)", () => {
  it("the wallet ring counts in 0-9: «13», never «១៣»", () => {
    const wallets = Array.from({ length: 13 }, (_, i) => ({ id: String(i), icon: "aba", name: "ABA", archived_at: null, goal_target: null }))
    assert.equal(String(walletMix(wallets as never).total), "13")
    assert.doesNotMatch(readFileSync(join(process.cwd(), "src/components/wallets/wallet-ring.tsx"), "utf8"), KHMER_DIGIT)
  })

  it("the gold ticker: «មាស 24K», never «មាស ២៤K»", () => {
    assert.equal(dictionaries.km["market.goldPerDamlung"], "មាស 24K")
    assert.equal(dictionaries.km["market.goldShort"], "មាស")
  })

  it("the home header: the date and the Hijri badge in 0-9", () => {
    assert.equal(headerDate(new Date(2026, 9, 21, 12), "km"), "ថ្ងៃពុធ 21 តុលា 2026")
    assert.deepEqual(headerBadge({ islamic: true, hijri: { day: 9, month: 5, year: 1448 }, locale: "km" }), { kind: "hijri", text: "🌙 9 ជុម៉ាដាល់អូឡា 1448" })
  })

  it("counters and chart labels: days left, riel guides", () => {
    assert.doesNotMatch(formatDuration(45, "remaining", "km", "2026-10-21"), KHMER_DIGIT)
    assert.equal(rielTick(150_000, "km"), "15 ម៉ឺន")
    assert.equal(latinDigits("១៣ កាបូប · ២៤K"), "13 កាបូប · 24K")
  })

  it("no screen of the dashboard or the wallets page writes Khmer digits", () => {
    for (const f of SCREENS) {
      const src = readFileSync(join(process.cwd(), f), "utf8")
      assert.doesNotMatch(src, /\b(khmerDigits|kmDigits|kmNum)\(|KM_DIGITS|KHMER_DIGITS/, `${f} converts to Khmer digits`)
      const code = src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n")
      assert.doesNotMatch(code, KHMER_DIGIT, `${f} has a Khmer digit`)
    }
  })

  it("the app's Khmer strings use 0-9 — the bot's messages and the server-shared keys aside", () => {
    const left = Object.entries(dictionaries.km).filter(([k, v]) => KHMER_DIGIT.test(v) && !k.startsWith("bot.") && !KEEPS_KHMER_DIGITS.has(k))
    assert.deepEqual(left.map(([k]) => k), [])
  })

  it("app-wide (founder, 21/10/2026 — Islamic hub, Settings, Assets and every other screen): no Khmer digit in any component or page", () => {
    const walk = (d: string): string[] =>
      readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : /\.tsx?$/.test(e.name) && !/\.test\./.test(e.name) ? [join(d, e.name)] : []))
    const ui = [...walk(join(process.cwd(), "src", "components")), ...walk(join(process.cwd(), "src", "app"))].filter((f) => !/[\\/]app[\\/]api[\\/]/.test(f))
    const bad: string[] = []
    for (const f of ui)
      readFileSync(f, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(line)) return
          if (KHMER_DIGIT.test(line) || /\b(khmerDigits|kmDigits)\(/.test(line)) bad.push(`${f}:${i + 1}`)
        })
    assert.deepEqual(bad, [])
  })

  it("the shared dates are 0-9 on the screens; a post or a poster asks for Khmer digits — and still gets them", () => {
    const d = new Date(2026, 9, 2, 12)
    assert.equal(longDate(d, "km"), "ថ្ងៃសុក្រ ទី02 ខែតុលា ឆ្នាំ2026")
    assert.equal(longDate(d, "km", { khmerDigits: true }), "ថ្ងៃសុក្រ ទី០២ ខែតុលា ឆ្នាំ២០២៦")
    assert.equal(dayDate(d, "km"), "ទី02 ខែតុលា ឆ្នាំ2026")
    assert.equal(monthLabel("2026-10", "km"), "ខែតុលា 2026")
    const l = khmerLunarDate("2026-10-21")
    assert.doesNotMatch(formatLunar(l, "km"), KHMER_DIGIT)
    assert.match(formatLunar(l, "km", { khmerDigits: true }), KHMER_DIGIT)
    assert.equal(formatHijri({ day: 9, month: 5, year: 1448 }, "km", { short: true, era: false }), "9 ជុម៉ាដាល់អូឡា 1448")
    // The posts and posters ask explicitly.
    for (const [f, re] of [
      ["src/lib/server/community-bulletin.ts", /longDate\(date, "km", \{ khmerDigits: true \}\)/],
      ["src/lib/server/tip-poster.ts", /longDate\([^)]*\), "km", \{ khmerDigits: true \}\)/],
      ["src/lib/sil-poster.ts", /formatLunar\(l, "km", \{ khmerDigits: true \}\)/],
      ["src/lib/holy-day-alerts.ts", /formatLunar\(tomorrow, "km", \{ khmerDigits: true \}\)/],
      ["src/lib/server/scheduled-posts.ts", /formatHijri\(hijri, "km", \{ khmerDigits: true \}\)/],
      ["src/lib/islamic-channel.ts", /formatHijri\(hijri, "km", \{ short: true, khmerDigits: true \}\)/],
    ] as const)
      assert.match(readFileSync(join(process.cwd(), f), "utf8"), re, f)
  })

  it("regression: the login trust line keeps «រក្សាការសម្ងាត់ 100%» together now that it reads 0-9", () => {
    const login = readFileSync(join(process.cwd(), "src/app/login/page.tsx"), "utf8")
    const keep = new RegExp(/const TRUST_KEEP = \/(.*)\/\n/.exec(login)![1])
    for (const phrase of ["សុវត្ថិភាពកម្រិតធនាគារ", "ស្លីបធនាគារ", "រក្សាការសម្ងាត់ 100%"]) {
      assert.ok(dictionaries.km["login.trustUnified"].includes(phrase), phrase)
      assert.match(phrase, keep)
    }
  })
})
