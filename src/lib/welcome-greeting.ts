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
 * The spoken greetings are not recorded yet (a licensed voice or a Khmer speaker — like the SoundBox's male voice): until
 * public/audio/greeting/<female|male>/<chumreap|salam>.mp3 exist and this is true, the greeting is shown, never spoken,
 * and Settings says so.
 */
export const GREETING_CLIPS_READY = false
export const greetingClipUrl = (kind: "khmer" | "islamic", voice: VoiceGender = DEFAULT_VOICE_GENDER) =>
  `/audio/greeting/${voice}/${kind === "islamic" ? "salam" : "chumreap"}.mp3`

/**
 * Spoken only when this device asked for it, the clip exists, and the phone is not on Silent, Vibrate or Do Not Disturb
 * (the app always respects them — Task #476). `quiet` is the phone's mode; null where it cannot be known (a browser).
 */
export function shouldSpeakWelcome(o: { enabled: boolean; ready: boolean; quiet: "normal" | "vibrate" | "silent" | null }): boolean {
  return o.enabled && o.ready && o.quiet !== "silent" && o.quiet !== "vibrate"
}
