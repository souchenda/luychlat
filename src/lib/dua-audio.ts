/**
 * Du'a recitations to listen to and memorise («ទន្ទេញ», founder 19/10/2026). A du'a has a recording only when a
 * licensed one is in public/audio/duas/ (a local Imam's or teacher's with written permission, or another cleared
 * source — CLAUDE.md Licensing; most du'as are hadith texts, which Qur'an recitation libraries don't carry). The 🔊
 * button shows only for those; the service worker keeps them for offline listening (lib/audio-cache.ts). One plays at a
 * time; «🔁 ទន្ទេញ» loops it. Pure (dua-audio.test.ts).
 */

/** A du'a's recording: the file in public/audio/duas/ and who recited / cleared it. */
export type DuaRecording = { file: string; credit: string }

/**
 * The cleared recordings, by du'a id (lib/duas.ts). Empty until the founder supplies licensed recordings — add one
 * line per file, e.g. `wake: { file: "wake.mp3", credit: "…, recorded with permission (DD/MM/YYYY)" }`.
 */
export const DUA_RECORDINGS: Record<string, DuaRecording> = {}

/** The URL of a du'a's recording, or null (then no 🔊 button). */
export function duaAudioSrc(id: string, recordings: Record<string, DuaRecording> = DUA_RECORDINGS): string | null {
  const r = recordings[id]
  return r && /^[a-z0-9-]+\.(mp3|m4a)$/.test(r.file) ? `/audio/duas/${r.file}` : null
}

export type DuaAudioState = { playing: string | null; repeat: boolean }
export type DuaAudioEvent = { type: "toggle"; id: string } | { type: "ended" } | { type: "repeat" } | { type: "stop" }

/** The player's next state: one du'a at a time; at the end it plays again while «ទន្ទេញ» is on. */
export function duaAudioReducer(s: DuaAudioState, e: DuaAudioEvent): DuaAudioState {
  switch (e.type) {
    case "toggle":
      return { ...s, playing: s.playing === e.id ? null : e.id } // another du'a stops the one playing
    case "ended":
      return s.repeat ? s : { ...s, playing: null }
    case "repeat":
      return { ...s, repeat: !s.repeat }
    case "stop":
      return { ...s, playing: null }
  }
}

/**
 * The du'a recordings made with Azure AI Speech (founder's decision, 19/10/2026 — licensed service only, never
 * Edge-TTS): the Arabic exactly as the card shows it (lib/duas.ts — the recording must match the text and its
 * source), a calm learner's pace, a pause at each «،». scripts/dua-tts.ts makes the files.
 */
export const DUA_VOICE = "ar-SA-HamedNeural"
export function duaSsml(arabic: string, voice: string = DUA_VOICE): string {
  const xml = arabic.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const body = xml.replace(/،\s*/g, '،<break time="450ms"/> ')
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="ar-SA"><voice name="${voice}"><prosody rate="-15%"><break time="300ms"/>${body}<break time="500ms"/></prosody></voice></speak>`
}
