import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { DUAS } from "@/lib/duas"
import { dictionaries } from "@/lib/i18n/dictionaries"
import { ASSALAMU_ALAIKUM } from "@/lib/islamic/glossary"

import {
  cambodiaDay,
  firstOfLaunch,
  GREETING_CLIPS_READY,
  greetingClipUrl,
  readWelcomeVoice,
  shouldSpeakWelcome,
  WELCOME_DUA_IDS,
  WELCOME_SHOWN_KEY,
  WELCOME_VOICE_KEY,
  welcomeDuaText,
  welcomeGreeting,
  writeWelcomeVoice,
} from "./welcome-greeting"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")
const km = dictionaries.km as Record<string, string>
const memory = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }
}

describe("The welcome greeting — Khmer (founder, 26/10/2026 — Task #518)", () => {
  it("«ជម្រាបសួរ ចិន្ដា! 🙏» and the time of day: អរុណ 05–12 · ទិវា 12–18 · សាយណ្ហ otherwise (Cambodian hours)", () => {
    const g = welcomeGreeting({ islamic: false, name: "ចិន្ដា", hour: 7, day: 0 })
    assert.equal(g.kind, "khmer")
    if (g.kind !== "khmer") return
    assert.equal(km[g.title]!.replace("{name}", g.params.name), "ជម្រាបសួរ ចិន្ដា! 🙏")
    const sub = (hour: number) => {
      const x = welcomeGreeting({ islamic: false, name: "ចិន្ដា", hour, day: 0 })
      return x.kind === "khmer" ? km[x.subtitle] : null
    }
    assert.deepEqual([4, 5, 11, 12, 17, 18, 23].map(sub), ["សាយណ្ហសួស្តី", "អរុណសួស្តី", "អរុណសួស្តី", "ទិវាសួស្តី", "ទិវាសួស្តី", "សាយណ្ហសួស្តី", "សាយណ្ហសួស្តី"])
  })
  it("no name yet: «ជម្រាបសួរ! 🙏» — never an empty space before the «!»", () => {
    const g = welcomeGreeting({ islamic: false, name: "  ", hour: 9, day: 0 })
    assert.equal(g.kind === "khmer" ? km[g.title] : null, "ជម្រាបសួរ! 🙏")
  })
})

describe("The welcome greeting — Islamic Mode (Task #518)", () => {
  it("the Salam in the brand's spelling (the glossary), the name, 🤲 — never «ជម្រាបសួរ»", () => {
    const g = welcomeGreeting({ islamic: true, name: "ចិន្ដា", hour: 7, day: 0 })
    assert.equal(g.kind, "islamic")
    assert.equal(g.kind === "islamic" ? g.title : "", `${ASSALAMU_ALAIKUM} ចិន្ដា 🤲`)
    assert.equal(ASSALAMU_ALAIKUM, "អាស្សាឡាមុអាឡៃកុម") // docs/BRAND_DESIGN_SYSTEM.md — changed only by the founder's decision
    assert.equal(welcomeGreeting({ islamic: true, name: null, hour: 7, day: 0 }).kind === "islamic" ? (welcomeGreeting({ islamic: true, name: null, hour: 7, day: 0 }) as { title: string }).title : "", `${ASSALAMU_ALAIKUM} 🤲`)
  })
  it("the sub-greeting is a vetted du'a of lib/duas.ts (with its source), one a day in turn — never text written here", () => {
    const seen = [0, 1, 2, 3].map((day) => welcomeGreeting({ islamic: true, name: "x", hour: 7, day }))
    const ids = seen.map((g) => (g.kind === "islamic" ? g.dua.id : ""))
    assert.deepEqual(ids, ["halal-provision", "both-worlds", "halal-provision", "both-worlds"])
    for (const id of WELCOME_DUA_IDS) {
      const d = DUAS.find((x) => x.id === id)!
      assert.ok(d.source, id)
      // The poster meaning (no parentheses), without its « » quotes; English for other languages.
      assert.doesNotMatch(welcomeDuaText(d, "km"), /^«|»$|[()]/)
      assert.equal(welcomeDuaText(d, "en"), d.en)
    }
    assert.equal(cambodiaDay(Date.parse("2026-10-26T16:59:00Z")), cambodiaDay(Date.parse("2026-10-26T00:00:00Z")) ) // until 23:59 in Cambodia
    assert.equal(cambodiaDay(Date.parse("2026-10-26T17:00:00Z")), cambodiaDay(Date.parse("2026-10-26T00:00:00Z")) + 1) // Cambodian midnight
  })
})

describe("Once per launch, per device, and never a sound on a muted phone (Task #518)", () => {
  it("shown once per launch (sessionStorage): a second look in the same session shows nothing", () => {
    const session = memory()
    assert.equal(firstOfLaunch(session), true)
    assert.equal(session.m.get(WELCOME_SHOWN_KEY), "1")
    assert.equal(firstOfLaunch(session), false)
    assert.equal(firstOfLaunch(null), false)
  })
  it("the spoken greeting: per device (localStorage «welcome_voice»), OFF unless switched on there", () => {
    const phoneA = memory()
    const phoneB = memory()
    assert.equal(WELCOME_VOICE_KEY, "welcome_voice")
    assert.equal(readWelcomeVoice(phoneA), false)
    writeWelcomeVoice(phoneA, true)
    assert.deepEqual([readWelcomeVoice(phoneA), readWelcomeVoice(phoneB)], [true, false]) // the other phone stays silent
    const broken = { getItem: () => { throw new Error("private") }, setItem: () => { throw new Error("private") } }
    assert.equal(readWelcomeVoice(broken), false)
    assert.doesNotThrow(() => writeWelcomeVoice(broken, true))
  })
  it("never spoken on Silent or Vibrate (DND reads as silent), when off, or before the clips are recorded", () => {
    assert.equal(shouldSpeakWelcome({ enabled: true, ready: true, quiet: "normal" }), true)
    assert.equal(shouldSpeakWelcome({ enabled: true, ready: true, quiet: null }), true) // a browser: the phone's own volume decides
    for (const quiet of ["silent", "vibrate"] as const) assert.equal(shouldSpeakWelcome({ enabled: true, ready: true, quiet }), false, quiet)
    assert.equal(shouldSpeakWelcome({ enabled: false, ready: true, quiet: "normal" }), false)
    assert.equal(shouldSpeakWelcome({ enabled: true, ready: false, quiet: "normal" }), false)
    assert.equal(GREETING_CLIPS_READY, false) // not recorded yet: shown as text only
    assert.deepEqual([greetingClipUrl("khmer", "female"), greetingClipUrl("islamic", "male")], ["/audio/greeting/female/chumreap.mp3", "/audio/greeting/male/salam.mp3"])
  })
  it("wired: the pill on Home outside the hero, once per launch; the audio only through shouldSpeakWelcome; the Settings switch", () => {
    const home = read("src/app/(app)/home/page.tsx")
    assert.match(home, /<div className="dash space-y-4">\n\s+\{\/\*[^\n]*\*\/\}\n\s+<WelcomeGreetingPill islamic=\{islamic\} name=\{givenName\} \/>/)
    assert.ok(home.indexOf("<WelcomeGreetingPill") < home.indexOf("<NetWorthCard"), "an overlay before (never inside) the hero")
    const pill = read("src/components/dashboard/welcome-greeting.tsx")
    assert.match(pill, /if \(!firstOfLaunch\(session\)\) return/)
    assert.match(pill, /if \(readWelcomeVoice\(local\) && GREETING_CLIPS_READY\) \{/)
    assert.match(pill, /if \(!shouldSpeakWelcome\(\{ enabled: true, ready: GREETING_CLIPS_READY, quiet \}\)\) return/)
    assert.equal((pill.match(/new Audio\(/g) ?? []).length, 1)
    assert.doesNotMatch(pill, /line-clamp/) // a du'a is never cut off
    const settings = read("src/app/(app)/settings/page.tsx")
    assert.match(settings, /<HolyDayChimeRow \/>\n\s+<WelcomeVoiceRow \/>/) // beside the other personal sound, for every workspace
    assert.match(settings, /writeWelcomeVoice\(localStorage, v\)/)
    assert.equal(km["settings.welcomeVoice"], "🔊 សំឡេងស្វាគមន៍ពេលបើកអេប")
    for (const l of ["en", "zh"] as const) assert.ok((dictionaries[l] as Record<string, string>)["welcome.titleName"], l)
    assert.doesNotMatch(Object.entries(km).filter(([k]) => k.startsWith("welcome.") || k.startsWith("settings.welcomeVoice")).map(([, v]) => v).join(" "), /លោក|[០-៩]/)
  })
})
