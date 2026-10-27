import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { dictionaries } from "@/lib/i18n/dictionaries"

import { cambodiaHour, greetingStack, homeGreeting, savedMessage } from "./islamic-expressions"

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
  it("the home header (Task #448 / #449): the greeting and the name on two lines — Islamic: «អាស្សាឡាមុអាឡៃកុម» with a moon", () => {
    const km = dictionaries.km as Record<string, string>
    const islamic = greetingStack(true, "មូហាំម៉ាត់", 9)
    assert.deepEqual(islamic, { greeting: "islamic.greeting", name: "មូហាំម៉ាត់", moon: true })
    assert.equal(km[islamic.greeting], "អាស្សាឡាមុអាឡៃកុម")
    for (const h of [0, 4, 12, 18, 23]) assert.equal(greetingStack(true, "x", h).greeting, "islamic.greeting", String(h)) // never by the hour
    assert.equal(greetingStack(true, "  ", 9).name, null) // no name yet: the greeting alone
  })
  it("otherwise by the time of day in Cambodia (Task #449): អរុណសួស្តី 05–11:59 · ទិវាសួស្តី 12–17:59 · សាយណ្ហសួស្តី 18–04:59; no waving hand", () => {
    const km = dictionaries.km as Record<string, string>
    const at = (h: number) => km[greetingStack(false, " ចិន្តា ", h).greeting]
    assert.deepEqual([4, 5, 11, 12, 17, 18, 23, 0].map(at), ["សាយណ្ហសួស្តី", "អរុណសួស្តី", "អរុណសួស្តី", "ទិវាសួស្តី", "ទិវាសួស្តី", "សាយណ្ហសួស្តី", "សាយណ្ហសួស្តី", "សាយណ្ហសួស្តី"])
    assert.deepEqual(greetingStack(false, " ចិន្តា ", 9), { greeting: "home.greetingMorning", name: "ចិន្តា", moon: false })
    for (const l of ["en", "zh"] as const) for (const k of ["home.greetingMorning", "home.greetingAfternoon", "home.greetingEvening"]) assert.ok((dictionaries[l] as Record<string, string>)[k], `${l} ${k}`)
    // Cambodia's hour, whatever the phone's zone: 23:30 UTC is 06:30 in Phnom Penh.
    assert.equal(cambodiaHour(Date.parse("2026-10-21T23:30:00Z")), 6)
    const page = readFileSync(join(process.cwd(), "src/app/(app)/home/page.tsx"), "utf8")
    assert.match(page, /const greeting = greetingStack\(islamic, displayName, cambodiaHour\(\)\)/) // displayName: the Hajj title in Islamic Mode (Task #524)
    assert.doesNotMatch(page, /HandIcon|animate-wave|t\("home\.greetingName"/)
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
