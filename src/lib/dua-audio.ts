/**
 * Du'a recitations to listen to and memorise («ទន្ទេញ», founder 19/10/2026). A du'a has a recording only when a
 * licensed one is in public/audio/duas/ (a local Imam's or teacher's with written permission, or another cleared
 * source — CLAUDE.md Licensing; most du'as are hadith texts, which Qur'an recitation libraries don't carry). The 🔊
 * button shows only for those; the service worker keeps them for offline listening (lib/audio-cache.ts). One plays at a
 * time; «🔁 ទន្ទេញ» loops it. Pure (dua-audio.test.ts).
 */
import { DUAS } from "@/lib/duas"

/** A du'a's recording: the file in public/audio/duas/ and who recited / cleared it. */
export type DuaRecording = { file: string; credit: string }

/**
 * The cleared recordings, by du'a id (lib/duas.ts). Empty until the founder supplies licensed recordings — add one
 * line per file, e.g. `wake: { file: "wake.mp3", credit: "…, recorded with permission (DD/MM/YYYY)" }`.
 */
export const DUA_RECORDINGS: Record<string, DuaRecording> = {}

/**
 * The URL of a du'a's recording, or null (then no 🔊 button): the admin's upload first (table dua_recordings, the
 * public bucket «dua-audio»), else a file shipped in public/audio/duas/.
 */
export function duaAudioSrc(id: string, recordings: Record<string, DuaRecording> = DUA_RECORDINGS, uploaded: Record<string, string> = {}): string | null {
  if (uploaded[id]) return uploaded[id]
  const r = recordings[id]
  return r && /^[a-z0-9-]+\.(mp3|m4a)$/.test(r.file) ? `/audio/duas/${r.file}` : null
}

/*
 * The admin's recordings (founder, 19/10/2026 — like the qasidah submissions): «📤 បញ្ចូលសំឡេង» on a du'a card or
 * /setdua in @luychlat_bot. The server cleans the file (MP3, −16 LUFS) into the bucket «dua-audio» as
 * «<du'a id>-<time>.mp3» — a new name each time, so a replaced recording is never served from an old copy.
 */
export const DUA_AUDIO_BUCKET = "dua-audio"
/** Larger files are refused before upload (the server's limit is 10 MB). */
export const DUA_UPLOAD_MAX_BYTES = 8 * 1024 * 1024
/** A recording longer than this is cut (a du'a takes seconds; a mistaken long file never fills the bucket). */
export const DUA_MAX_SECONDS = 180

export const isDuaId = (id: unknown): id is string => typeof id === "string" && DUAS.some((d) => d.id === id)
export const duaAudioPath = (id: string, nowMs: number) => `${id}-${nowMs}.mp3`
export const isDuaAudioPath = (id: string, path: unknown): path is string =>
  typeof path === "string" && isDuaId(id) && new RegExp(`^${id}-[0-9]{10,14}\\.mp3$`).test(path)
/** The public address of an uploaded recording. */
export const duaRecordingUrl = (supabaseUrl: string, path: string) => `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${DUA_AUDIO_BUCKET}/${path}`

/** The input an upload needs: an audio file of a sane size, who recited it, and the rights confirmed. */
export function duaUploadError(v: { file: { size: number; type: string; name: string } | null; credit: string; rights: boolean }):
  | "duas.upload.fileRequired"
  | "duas.upload.notAudio"
  | "duas.upload.tooBig"
  | "duas.upload.creditRequired"
  | "duas.upload.rightsRequired"
  | null {
  if (!v.file || v.file.size === 0) return "duas.upload.fileRequired"
  if (!/^audio\//.test(v.file.type) && !/\.(mp3|m4a|aac|ogg|oga|opus|wav|webm|amr|3gp)$/i.test(v.file.name)) return "duas.upload.notAudio"
  if (v.file.size > DUA_UPLOAD_MAX_BYTES) return "duas.upload.tooBig"
  if (v.credit.trim().length < 2) return "duas.upload.creditRequired"
  if (!v.rights) return "duas.upload.rightsRequired"
  return null
}

/** The bot's picker, two du'as a row: «da:<id>». */
export const duaPickButtons = () => {
  const rows: { text: string; callback_data: string }[][] = []
  DUAS.forEach((d, i) => {
    if (i % 2 === 0) rows.push([])
    rows[rows.length - 1].push({ text: d.title.km, callback_data: `da:${d.id}` })
  })
  return rows
}
export const isDuaCallback = (data: string | undefined) => typeof data === "string" && data.startsWith("da:")
export const parseDuaCallback = (data: string | undefined): string | null => {
  const id = data?.startsWith("da:") ? data.slice(3) : null
  return isDuaId(id) ? id : null
}
export const isSetDuaCommand = (command: string) => /^\/setdua(@\w+)?$/i.test(command)

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
