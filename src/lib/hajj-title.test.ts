import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { dictionaries } from "@/lib/i18n/dictionaries"
import { greetingStack } from "@/lib/islamic-expressions"

import { formatHonorificName, HAJJ_TITLE_TEXT, isHajjTitle } from "./hajj-title"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")
const f = (o: Partial<Parameters<typeof formatHonorificName>[0]>) =>
  formatHonorificName({ name: "ចិន្តា", islamic: true, hasCompletedHajj: true, hajjTitle: "haji", locale: "km", ...o })

describe("formatHonorificName — the Hajj title (founder, 27/10/2026 — Task #524)", () => {
  it("Islamic Mode, Hajj completed: «ហាជ្ជី ចិន្តា» (male) · «ហាជ្ជះ ចិន្តា» (female) — the founder's spelling", () => {
    assert.equal(f({}), "ហាជ្ជី ចិន្តា")
    assert.equal(f({ hajjTitle: "hajjah" }), "ហាជ្ជះ ចិន្តា")
    assert.deepEqual(HAJJ_TITLE_TEXT, { haji: { km: "ហាជ្ជី", en: "Haji" }, hajjah: { km: "ហាជ្ជះ", en: "Hajjah" } })
  })
  it("English and Chinese screens: «Haji» / «Hajjah»", () => {
    assert.equal(f({ locale: "en", name: "Chenda" }), "Haji Chenda")
    assert.equal(f({ locale: "zh", hajjTitle: "hajjah", name: "Chenda" }), "Hajjah Chenda")
  })
  it("Khmer mode (Islamic Mode off): the plain name, whatever is saved", () => {
    assert.equal(f({ islamic: false }), "ចិន្តា")
    assert.equal(f({ islamic: false, hajjTitle: "hajjah" }), "ចិន្តា")
  })
  it("never guessed: Hajj off, or on without a chosen title (no gender in the profile) → the plain name", () => {
    assert.equal(f({ hasCompletedHajj: false }), "ចិន្តា")
    assert.equal(f({ hasCompletedHajj: null }), "ចិន្តា")
    assert.equal(f({ hajjTitle: null }), "ចិន្តា")
    assert.equal(f({ hajjTitle: "sheikh" }), "ចិន្តា")
    assert.equal(isHajjTitle("HAJI"), false)
  })
  it("no name: no title alone; a title already in the name is never doubled", () => {
    assert.equal(f({ name: null }), null)
    assert.equal(f({ name: "   " }), null)
    assert.equal(f({ name: "ហាជ្ជី ចិន្តា" }), "ហាជ្ជី ចិន្តា")
    assert.equal(f({ name: "Haji Chenda", locale: "en" }), "Haji Chenda")
    assert.equal(f({ name: "Hajiya" , locale: "en" }), "Haji Hajiya") // a name that only starts with the letters
  })
  it("the Islamic greeting carries it: «អាស្សាឡាមុអាឡៃកុម» over «ហាជ្ជី ចិន្តា»", () => {
    assert.deepEqual(greetingStack(true, f({}), 7), { greeting: "islamic.greeting", name: "ហាជ្ជី ចិន្តា", moon: true })
  })
  it("wired: Home header and welcome use the honorific name; Settings toggle reveals the title choice; 3 languages", () => {
    const home = read("src/app/(app)/home/page.tsx")
    assert.match(home, /formatHonorificName\(\{ name: givenName, islamic, hasCompletedHajj: islamicSettings\.has_completed_hajj, hajjTitle: islamicSettings\.hajj_title, locale \}\)/)
    assert.match(home, /greetingStack\(islamic, displayName, cambodiaHour\(\)\)/)
    assert.match(home, /<WelcomeGreetingPill islamic=\{islamic\} name=\{displayName\} \/>/)
    const settings = read("src/app/(app)/settings/page.tsx")
    assert.match(settings, /\{settings\.enabled && <HajjRow \/>\}/)
    assert.match(settings, /\{settings\.has_completed_hajj && \(/)
    assert.match(read("supabase/migrations/20270267000000_hajj_title.sql"), /hajj_title in \('haji', 'hajjah'\)/)
    for (const l of ["km", "en", "zh"] as const) {
      const d = (l === "zh" ? { ...dictionaries.en, ...dictionaries.zh } : dictionaries[l]) as Record<string, string>
      for (const k of ["islamic.hajj", "islamic.hajjHint", "islamic.hajjPick", "islamic.hajjTitle"]) assert.ok(d[k], `${l} ${k}`)
    }
    assert.equal((dictionaries.km as Record<string, string>)["islamic.hajj"], "🕋 បានបំពេញកាតព្វកិច្ចហាជ្ជ (Hajj)")
  })
})
