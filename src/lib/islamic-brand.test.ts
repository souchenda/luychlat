import assert from "node:assert/strict"
import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

describe("Islamic logo variant (founder, 18/10/2026; the mosque dome since 5/11/2026)", () => {
  it("the files exist, drawn by the generator: a white dome, gold crescent and star on the brand's emerald — our own artwork", () => {
    for (const f of ["public/icon-islamic.png", "public/logo-islamic.png", "public/logo.png"]) assert.ok(existsSync(join(process.cwd(), f)), f)
    const gen = read("scripts/generate-islamic-logo.mjs")
    assert.match(gen, /const EMERALD = "#064e3b"/)
    assert.match(gen, /const GOLD = "#e2b55a"/)
    assert.match(gen, /a large round dome on one base/)
  })
  it("the sizes: 1024 for the Telegram channel, 512 (and light) for the in-app icon", async () => {
    const sharp = (await import("sharp")).default
    assert.deepEqual(await sharp("public/logo-islamic.png").metadata().then((m) => [m.width, m.height]), [1024, 1024])
    assert.deepEqual(await sharp("public/icon-islamic.png").metadata().then((m) => [m.width, m.height]), [512, 512])
    assert.ok(statSync(join(process.cwd(), "public/icon-islamic.png")).size < 200_000)
  })
  it("the nav shows it only with Islamic Mode on, never in a business workspace", () => {
    assert.match(read("src/components/brand-mark.tsx"), /src=\{islamic \? "\/icon-islamic\.png" : "\/logo\.png"\}/)
    assert.match(read("src/app/(app)/islamic/layout.tsx"), /<BrandMark className="mr-2 size-10 rounded-xl shadow-none" islamic=\{settings\.enabled\} \/>/)
    assert.match(read("src/components/layout/app-nav.tsx"), /<BrandMark className="size-9 rounded-xl shadow-none" islamic=\{islamic && workspace\?\.type !== "BUSINESS"\} \/>/)
  })
})
