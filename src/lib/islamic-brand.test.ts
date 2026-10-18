import assert from "node:assert/strict"
import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

describe("Islamic logo variant (founder, 18/10/2026)", () => {
  it("the files exist, made by the generator from the founder's kopiah artwork", () => {
    for (const f of ["public/icon-islamic.png", "public/logo-islamic.png", "public/rabbit-kopiah.png", "public/logo.png"]) assert.ok(existsSync(join(process.cwd(), f)), f)
    assert.match(read("scripts/generate-islamic-logo.mjs"), /const SOURCE = "public\/rabbit-kopiah\.png"/)
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
