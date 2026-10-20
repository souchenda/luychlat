import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { dictionaries } from "@/lib/i18n/dictionaries"

import { homeGreeting, savedMessage } from "./islamic-expressions"

const render = (g: ReturnType<typeof homeGreeting>, locale: "km" | "en" = "km") =>
  dictionaries[locale][g.key].replace("{name}", g.params?.name ?? "")

describe("Home greeting — Islamic Mode (founder, 18/10/2026)", () => {
  it("Islamic Mode ON: «អាស្សាឡាមុអាឡៃកុម, ចិន្តា» (founder, 20/10/2026), never «សួស្តី», no waving hand", () => {
    const g = homeGreeting(true, "ចិន្តា")
    assert.equal(render(g), "អាស្សាឡាមុអាឡៃកុម, ចិន្តា")
    assert.doesNotMatch(render(g), /សួស្តី/)
    assert.equal(g.wave, false)
    assert.doesNotMatch(render(homeGreeting(true, null)), /សួស្តី/)
    assert.equal(render(homeGreeting(true, "Chenda"), "en"), "Assalamu Alaikum, Chenda")
  })
  it("Islamic Mode OFF: «សួស្តី ចិន្តា ✋» as before", () => {
    const g = homeGreeting(false, "ចិន្តា")
    assert.equal(render(g), "សួស្តី ចិន្តា")
    assert.equal(g.wave, true)
  })
  it("the home page uses it (and the hand only when it waves)", () => {
    const page = readFileSync(join(process.cwd(), "src/app/(app)/home/page.tsx"), "utf8")
    assert.match(page, /homeGreeting\(islamic, givenName\)/)
    assert.doesNotMatch(page, /t\("home\.greetingName"/)
  })
})

describe("Save messages — Alhamdulillah, Insha Allah, Barakallahu Feek", () => {
  it("Islamic Mode ON, something new", () => {
    assert.equal(dictionaries.km[savedMessage("INCOME", true, true)], "អាល់ហាំឌុលីលឡាហ៍ (Alhamdulillah) — បានកត់ត្រាចំណូលជោគជ័យ!")
    assert.equal(dictionaries.km[savedMessage("GOAL", true, true)], "អ៊ីនស៊ាអល់ឡោះ (Insha Allah) — គោលដៅត្រូវបានបង្កើត!")
    assert.equal(dictionaries.km[savedMessage("EXPENSE", true, true)], "បារ៉ាកាឡាហុហ្វីក (Barakallahu Feek) — បានកត់ត្រារួចរាល់!")
  })
  it("Islamic Mode OFF, or an edit: the usual «បានរក្សាទុក»", () => {
    for (const k of ["INCOME", "EXPENSE"]) {
      assert.equal(savedMessage(k, false, true), "entry.saved")
      assert.equal(savedMessage(k, true, false), "entry.saved")
    }
    assert.equal(savedMessage("GOAL", false, true), "goals.saved")
    assert.equal(savedMessage("GOAL", true, false), "goals.saved")
  })
})
