// The welcome greeting when the app opens (founder, 26/10/2026 — Task #518): «ជម្រាបសួរ [name]! 🙏» with the time of day,
// or — Islamic Mode — «អាស្សាឡាមុអាឡៃកុម [name] 🤲» with one of the vetted du'as of lib/duas.ts (never written here). Once
// per launch, as a pill over the Home page (components/dashboard/welcome-greeting.tsx). An optional spoken greeting, per
// device, off by default, never on Silent / Vibrate / Do Not Disturb. Pure (welcome-greeting.test.ts).
import { DUAS, posterMeaning, type Dua } from "@/lib/duas"
import { ASSALAMU_ALAIKUM } from "@/lib/islamic/glossary"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { DEFAULT_VOICE_GENDER, type VoiceGender } from "@/lib/soundbox"

type Store = { getItem(key: string): string | null; setItem(key: string, value: string): void }

/**
 * The du'as of the Islamic greeting, one a day in turn: asking for knowledge and halal provision (Sunan Ibn Majah 925)
 * and for the good of both worlds (Al-Baqarah 2:201) — what a person opening an app about their money asks for.
 */
export const WELCOME_DUA_IDS = ["halal-provision", "both-worlds"] as const

export type WelcomeGreeting =
  | { kind: "khmer"; title: MessageKey; params: { name: string }; subtitle: MessageKey }
  | { kind: "islamic"; title: string; dua: Dua }

/** «ជម្រាបសួរ ចិន្ដា! 🙏» + «អរុណសួស្តី» (05–12 h) · «ទិវាសួស្តី» (12–18 h) · «សាយណ្ហសួស្តី», or the Salam and the day's du'a. */
export function welcomeGreeting(o: { islamic: boolean; name: string | null | undefined; hour: number; day: number }): WelcomeGreeting {
  const name = o.name?.trim() || ""
  if (o.islamic) {
    const id = WELCOME_DUA_IDS[((o.day % WELCOME_DUA_IDS.length) + WELCOME_DUA_IDS.length) % WELCOME_DUA_IDS.length]
    // The brand's spelling, from the glossary (docs/BRAND_DESIGN_SYSTEM.md) — never retyped.
    return { kind: "islamic", title: `${ASSALAMU_ALAIKUM}${name ? ` ${name}` : ""} 🤲`, dua: DUAS.find((d) => d.id === id)! }
  }
  const subtitle: MessageKey = o.hour >= 5 && o.hour < 12 ? "home.greetingMorning" : o.hour >= 12 && o.hour < 18 ? "home.greetingAfternoon" : "home.greetingEvening"
  return { kind: "khmer", title: name ? "welcome.titleName" : "welcome.title", params: { name }, subtitle }
}

/** The du'a's meaning for the greeting: the poster's (natural Khmer, no parentheses) or the English. */
export const welcomeDuaText = (dua: Dua, locale: string) => (locale === "km" ? posterMeaning(dua).replace(/^«\s*|\s*»$/g, "") : dua.en)

/** Days since 1970 in Cambodia (UTC+7): the du'a changes at Cambodian midnight. */
export const cambodiaDay = (now: number = Date.now()) => Math.floor((now + 7 * 3_600_000) / 86_400_000)

/** Once per launch: remembered for this tab only (sessionStorage) — a reload of the same session does not repeat it. */
export const WELCOME_SHOWN_KEY = "luychlat:welcome-shown"
export function firstOfLaunch(session: Store | null): boolean {
  try {
    if (!session || session.getItem(WELCOME_SHOWN_KEY)) return false
    session.setItem(WELCOME_SHOWN_KEY, "1")
    return true
  } catch {
    // Private mode / storage refused: shown, never repeated in a loop (the component shows it once per mount).
    return true
  }
}

/** «🔊 សំឡេងស្វាគមន៍ពេលបើកអេប»: per device (localStorage), off unless switched on here. */
export const WELCOME_VOICE_KEY = "welcome_voice"
export function readWelcomeVoice(store: Store | null): boolean {
  try {
    return store?.getItem(WELCOME_VOICE_KEY) === "1"
  } catch {
    return false
  }
}
export function writeWelcomeVoice(store: Store | null, on: boolean) {
  try {
    store?.setItem(WELCOME_VOICE_KEY, on ? "1" : "0")
  } catch {
    // private mode: not remembered
  }
}

/**
 * What the spoken greeting says, in its own language (founder, 27/10/2026 — Tasks #522 / #523): the Khmer welcome read by a
 * Khmer voice, and the Salam in ARABIC read by an Arabic voice — «السلام عليكم ورحمة الله وبركاته» — never a Khmer voice
 * reading a transliteration (the founder: «authentic Arabic»). The banner keeps the glossary's Khmer spelling
 * (ASSALAMU_ALAIKUM). Made by scripts/greeting-clips-override.ts (the owner override extended to these two — CLAUDE.md ›
 * Licensing); a native speaker's recording replaces either with scripts/import-greeting-voice.ts.
 */
export const GREETING_WORDS = {
  chumreap: { text: "ជម្រាបសួរ! សូមស្វាគមន៍មកកាន់ អេប លុយឆ្លាត", lang: "km" },
  salam: { text: "السَّلَامُ عَلَيْكُمْ وَرَحْمَةُ اللَّهِ وَبَرَكَاتُهُ", lang: "ar" },
} as const

/** The banner's Salam (the glossary's), unchanged by the spoken one. */
export const GREETING_SALAM_TEXT = ASSALAMU_ALAIKUM

/** The female clips are in public/audio/greeting/female/ (greeting-audio.test.ts checks every one exists). */
export const GREETING_CLIPS_READY = true
/** Male clips imported (scripts/import-greeting-voice.ts … male) for BOTH greetings: then a phone set to 👨 hears them. */
export const GREETING_MALE_READY = false

/** The clip of a greeting in the chosen voice persona; 👨 hears the female clip until the male ones exist — never a 404. */
export const greetingClipUrl = (kind: "khmer" | "islamic", voice: VoiceGender = DEFAULT_VOICE_GENDER) =>
  `/audio/greeting/${voice === "male" && GREETING_MALE_READY ? "male" : "female"}/${kind === "islamic" ? "salam" : "chumreap"}.mp3`

/**
 * Spoken only when this device asked for it, the clip exists, and the phone is not on Silent, Vibrate or Do Not Disturb
 * (the app always respects them — Task #476). `quiet` is the phone's mode; null where it cannot be known (a browser).
 */
export function shouldSpeakWelcome(o: { enabled: boolean; ready: boolean; quiet: "normal" | "vibrate" | "silent" | null }): boolean {
  return o.enabled && o.ready && o.quiet !== "silent" && o.quiet !== "vibrate"
}
