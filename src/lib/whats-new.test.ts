import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { dictionaries } from "@/lib/i18n/dictionaries"

import { ANNOUNCE_DAYS, markSeen, pendingAnnouncements, readSeen, WHATS_NEW, WHATS_NEW_SEEN_KEY, type WhatsNewEntry } from "./whats-new"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")
const memory = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }
}
const entry = (id: string, date: string, scope?: "all" | "business"): WhatsNewEntry => ({
  id,
  date,
  icon: "✨",
  title: { km: id, en: id },
  body: { km: id, en: id },
  action: { kind: "link", href: "/home" },
  scope,
})
// 27/10/2026 08:00 in Cambodia.
const NOW = Date.parse("2026-10-27T01:00:00Z")

describe("«✨ មុខងារថ្មី» — a new feature announced once per phone (founder, 27/10/2026)", () => {
  it("unseen, newest first; seen ones never again", () => {
    const entries = [entry("a", "2026-10-20"), entry("b", "2026-10-27")]
    assert.deepEqual(pendingAnnouncements({ entries, seen: new Set(), now: NOW, business: false }).map((e) => e.id), ["b", "a"])
    assert.deepEqual(pendingAnnouncements({ entries, seen: new Set(["b"]), now: NOW, business: false }).map((e) => e.id), ["a"])
  })
  it(`only while new: under ${ANNOUNCE_DAYS} days, never before its day (Cambodian calendar)`, () => {
    const entries = [entry("old", "2026-09-27"), entry("edge", "2026-09-28"), entry("future", "2026-10-28")]
    assert.deepEqual(pendingAnnouncements({ entries, seen: new Set(), now: NOW, business: false }).map((e) => e.id), ["edge"])
    // 23:30 on the 27th in Cambodia is still the 27th: tomorrow's is not shown yet; 00:30 on the 28th it is.
    assert.equal(pendingAnnouncements({ entries, seen: new Set(), now: Date.parse("2026-10-27T16:30:00Z"), business: false }).some((e) => e.id === "future"), false)
    assert.equal(pendingAnnouncements({ entries, seen: new Set(), now: Date.parse("2026-10-27T17:30:00Z"), business: false }).some((e) => e.id === "future"), true)
  })
  it("a Business feature is announced only to someone with a Business workspace", () => {
    const entries = [entry("biz", "2026-10-27", "business")]
    assert.equal(pendingAnnouncements({ entries, seen: new Set(), now: NOW, business: false }).length, 0)
    assert.equal(pendingAnnouncements({ entries, seen: new Set(), now: NOW, business: true }).length, 1)
  })
  it("seen is remembered on this phone; broken storage is never an error", () => {
    const phone = memory()
    markSeen(phone, ["a"])
    markSeen(phone, ["b", "a"])
    assert.deepEqual([...readSeen(phone)], ["a", "b"])
    assert.ok(phone.m.has(WHATS_NEW_SEEN_KEY))
    phone.m.set(WHATS_NEW_SEEN_KEY, "{not json")
    assert.equal(readSeen(phone).size, 0)
    const broken = { getItem: () => { throw new Error("private") }, setItem: () => { throw new Error("private") } }
    assert.doesNotThrow(() => markSeen(broken, ["a"]))
    assert.equal(readSeen(null).size, 0)
  })
  it("every announcement: a unique id, a real date, all three languages, Latin digits, «បង» never «លោក», brand wording", () => {
    assert.equal(new Set(WHATS_NEW.map((e) => e.id)).size, WHATS_NEW.length)
    for (const e of WHATS_NEW) {
      assert.match(e.date, /^\d{4}-\d{2}-\d{2}$/)
      assert.ok(!Number.isNaN(Date.parse(e.date)), e.id)
      for (const t of [e.title, e.body]) {
        assert.ok(t.km && t.en && t.zh, e.id)
        assert.doesNotMatch(t.km, /[០-៩]|លោក|កម្មវិធី|អែប/, e.id)
      }
    }
    // Newest first in the source, so the top entry is the latest feature.
    assert.deepEqual([...WHATS_NEW].map((e) => e.date), [...WHATS_NEW].map((e) => e.date).sort().reverse())
  })
  it("wired: on Home after the welcome; waits for the unlock and any other dialog; the feature it names is ON by default", () => {
    const home = read("src/app/(app)/home/page.tsx")
    assert.ok(home.indexOf("<WelcomeGreetingPill") < home.indexOf("<WhatsNewDialog islamic={islamic} />"))
    const dialog = read("src/components/dashboard/whats-new.tsx")
    assert.match(dialog, /useLockStore\.getState\(\)/)
    assert.match(dialog, /document\.querySelector\('\[role="dialog"\], \[role="alertdialog"\]'\)/)
    assert.match(dialog, /markSeen\(local, \[next\.id\]\)/)
    assert.match(read("src/lib/welcome-greeting.ts"), /getItem\(WELCOME_VOICE_KEY\) !== "0"/)
    for (const l of ["km", "en", "zh"] as const) {
      const d = (l === "zh" ? { ...dictionaries.en, ...dictionaries.zh } : dictionaries[l]) as Record<string, string>
      for (const k of ["whatsNew.badge", "whatsNew.try", "whatsNew.gotIt"]) assert.ok(d[k], `${l} ${k}`)
    }
  })
})
