import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { describe, it } from "node:test"

/**
 * No cartoon emoji on the app's screens (founder, 29/10/2026: «cartoon emoji icons don't fit the value of App Luy
 * Chlat»). An icon is one of the app's line icons (lucide-react) in the theme colours; a language is its name, never a
 * flag (flags show as letters on Windows). Comments are ignored. The bot, the channel posts, the posters and the push
 * texts keep their emoji — they live outside src/app and src/components, or are allowed below line by line, each with
 * its reason.
 */

/**
 * An emoji as a phone draws it: an emoji-presentation character, any pictograph from U+1F000 up, a text symbol forced
 * to emoji by U+FE0F, or a regional-indicator flag. Text symbols (✓ → ↗ ▶ ★ © ® ™, digits, # and *) are not emoji.
 */
const EMOJI = /\p{Emoji_Presentation}|[\u{1F000}-\u{1FAFF}]|\p{Extended_Pictographic}️|[\u{1F1E6}-\u{1F1FF}]/u

/** The justified exceptions: a file (from the repository root, with /), a piece of the line, and why it stays. */
const ALLOW: { file: string; line: string; why: string }[] = [
  {
    file: "src/components/birthday/birthday-celebration-modal.tsx",
    line: "wrap(c, `${title} 🎂`",
    why: "the birthday poster drawn on a canvas for the person to share — a poster, not an app icon",
  },
  {
    file: "src/components/business/fixed-asset-register.tsx",
    line: 'ASSET_EMOJI[k as AssetKind] ?? "📦"',
    why: "the fallback of the asset kinds' shared marks (lib/assets ASSET_EMOJI, data shared with the asset forms)",
  },
  {
    file: "src/components/islamic/prayer-alerts.tsx",
    line: "title: `🕌 ${t(\"prayerAlert.title\"",
    why: "the Adhan alert's notification title (a push text the phone shows, not the app's screen)",
  },
  {
    file: "src/components/islamic/prayer-alerts.tsx",
    line: "title: `🕌 ${t(\"prayerAlert.nativeTestTitle\")}`",
    why: "the native test Adhan notification title (a push text)",
  },
]

const ROOT = process.cwd()

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (p.endsWith(".tsx")) out.push(p)
  }
  return out
}

/** Blanks block comments (and JSX {/* … *\/}) and line comments — never «://» in a URL — keeping the line numbers. */
export function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/(^|[^:\\])\/\/.*$/gm, "$1")
}

/** Every emoji line of src/app and src/components that is not allowed: «file:line: text». */
function emojiLines(): string[] {
  const found: string[] = []
  for (const f of [...walk(join(ROOT, "src", "app")), ...walk(join(ROOT, "src", "components"))]) {
    const rel = relative(ROOT, f).split(sep).join("/")
    stripComments(readFileSync(f, "utf8"))
      .split("\n")
      .forEach((line, i) => {
        if (!EMOJI.test(line)) return
        if (ALLOW.some((a) => a.file === rel && line.includes(a.line))) return
        found.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`)
      })
  }
  return found
}

describe("no emoji on the app's screens", () => {
  it("finds emoji in strings and JSX, never in comments or text symbols", () => {
    assert.equal(EMOJI.test(stripComments("const a = 1 // 🎯 goal\n/* 🌙 */")), false)
    assert.equal(EMOJI.test(stripComments('<p>{"🌙"} https://app.luychlat.com</p>')), true)
    assert.equal(EMOJI.test("© ® ™ # * 0 9 ✓ ↗ ↘ ▶ ★ ≈ ·"), false)
    for (const e of ["🇰🇭", "☀️", "✅", "⏳", "🛡️", "ℹ️", "⚠️", "🎙", "👨‍👩‍👧"]) assert.equal(EMOJI.test(e), true, e)
  })

  it("src/app and src/components draw line icons, never emoji", () => {
    const found = emojiLines()
    assert.deepEqual(found, [], `emoji on a screen — use a lucide-react icon instead:\n${found.join("\n")}`)
  })

  it("every exception is still in its file (no stale allowance)", () => {
    for (const a of ALLOW) {
      const src = stripComments(readFileSync(join(ROOT, a.file), "utf8"))
      assert.ok(src.includes(a.line), `${a.file}: «${a.line}» is gone — remove it from ALLOW`)
    }
  })
})

// Regression (29/10/2026): the admin feature list drew 🧾 🎁 👥 📄 from lib/features.ts — data shown on a screen.
describe("no emoji in the feature registry the admin screen draws", () => {
  it("lib/features.ts carries no emoji (the screen maps each key to a line icon)", async () => {
    const { readFileSync } = await import("node:fs")
    const { join } = await import("node:path")
    const src = readFileSync(join(process.cwd(), "src/lib/features.ts"), "utf8").replace(/\/\/.*|\/\*[\s\S]*?\*\//g, "")
    assert.doesNotMatch(src, /\p{Extended_Pictographic}/u)
  })
})
