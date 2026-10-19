import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { DUAS } from "./duas"
import { contextualDua, countdown, hubHero } from "./islamic-hub"
import { prayerTimes, PROVINCES } from "./prayer"

const pp = PROVINCES[0]
const times = prayerTimes({ year: 2026, month: 10, day: 19 }, pp.lat, pp.lng)
const tomorrow = prayerTimes({ year: 2026, month: 10, day: 20 }, pp.lat, pp.lng)
const hijri = { day: 7, month: 5, year: 1448 } // an ordinary month: Monday / Thursday are sunnah fast days

describe("The /islamic home (founder, 19/10/2026)", () => {
  it("the du'a fits the hour: waking, iftar around Maghrib on a fast day only, bedtime, provision by day", () => {
    const at = (minutes: number, fastDay = false) => contextualDua({ minutes, times, fastDay })
    assert.equal(at(times.fajr - 30), "wake")
    assert.equal(at(9 * 60), "wake")
    assert.equal(at(times.dhuhr + 10), "halal-provision")
    assert.equal(at(times.maghrib - 20), "halal-provision") // not a fast day: no iftar du'a
    assert.equal(at(times.maghrib - 20, true), "iftar")
    assert.equal(at(times.maghrib + 30, true), "iftar")
    assert.equal(at(times.isha + 5, true), "sleep")
    assert.equal(at(23 * 60), "sleep")
    assert.equal(at(2 * 60), "sleep")
    // Every du'a it can pick exists on the du'a page.
    for (const id of ["wake", "iftar", "sleep", "halal-provision"]) assert.ok(DUAS.some((d) => d.id === id), id)
  })

  it("the hero: the next prayer with a live countdown; Imsak and the Iftar countdown only on a fast day", () => {
    assert.equal(countdown(3525), "00:58:45")
    assert.equal(countdown(-3), "00:00:00")
    const monday = hubHero({ day: "2026-10-19", hijri, today: times, tomorrow, minutes: times.asr - 10, seconds: 0 })
    assert.equal(monday.next.key, "asr")
    assert.equal(monday.next.at, times.asr)
    assert.equal(monday.next.inSeconds, 600)
    assert.ok(monday.fast)
    assert.equal(monday.fast.iftar, times.maghrib)
    assert.equal(monday.fast.imsak, times.fajr - 10)
    assert.equal(monday.fast.iftarInSeconds, (times.maghrib - times.asr + 10) * 60)
    // After Maghrib the fast is broken: no countdown, the times stay.
    assert.equal(hubHero({ day: "2026-10-19", hijri, today: times, tomorrow, minutes: times.maghrib + 5, seconds: 0 }).fast?.iftarInSeconds, null)
    // Tuesday: no fast card. After Isha: tomorrow's Fajr.
    const tuesday = hubHero({ day: "2026-10-20", hijri, today: times, tomorrow, minutes: times.isha + 30, seconds: 0 })
    assert.equal(tuesday.fast, null)
    assert.equal(tuesday.next.key, "fajr")
    assert.equal(tuesday.next.at, tomorrow.fajr)
    // An unknown Hijri date never guesses a fast.
    assert.equal(hubHero({ day: "2026-10-19", hijri: null, today: times, tomorrow, minutes: 600, seconds: 0 }).fast, null)
  })

  it("the page order: hero, four quick actions, the du'a of the hour, then the wisdom and the quiz, then Zakat", () => {
    const page = readFileSync(join(process.cwd(), "src/app/(app)/islamic/page.tsx"), "utf8")
    const order = ["<IslamicHubHero", "<IslamicQuickActions", "<ContextualDuaCard", "<DailyTipCard", "<IslamicQuizCard", 'id="zakat"']
    const at = order.map((s) => page.indexOf(s))
    assert.ok(at.every((i) => i > 0), JSON.stringify(at))
    assert.deepEqual([...at].sort((a, b) => a - b), at)
    const hub = readFileSync(join(process.cwd(), "src/components/islamic/hub.tsx"), "utf8")
    for (const href of ['"/islamic/qibla"', '"/islamic/quran"', '"/islamic/places"', '"#zakat"', 'href="/islamic/prayer"']) assert.ok(hub.includes(href), href)
  })
})
