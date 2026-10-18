import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

describe("Islamic logo variant (founder, 18/10/2026)", () => {
  it("the files exist, made by the generator from the official logo", () => {
    for (const f of ["public/icon-islamic.png", "public/logo-islamic.png", "public/logo.png"]) assert.ok(existsSync(join(process.cwd(), f)), f)
    assert.match(read("scripts/generate-islamic-logo.mjs"), /const LOGO = "public\/logo\.png"/)
  })
  it("the nav shows it only with Islamic Mode on, never in a business workspace", () => {
    assert.match(read("src/components/brand-mark.tsx"), /src=\{islamic \? "\/icon-islamic\.png" : "\/logo\.png"\}/)
    assert.match(read("src/app/(app)/islamic/layout.tsx"), /<BrandMark className="mr-2 size-10 rounded-xl shadow-none" islamic=\{settings\.enabled\} \/>/)
    assert.match(read("src/components/layout/app-nav.tsx"), /<BrandMark className="size-9 rounded-xl shadow-none" islamic=\{islamic && workspace\?\.type !== "BUSINESS"\} \/>/)
  })
})
