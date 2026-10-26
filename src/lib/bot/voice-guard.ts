// Short Khmer voice notes (founder, 26/10/2026 — Task #507: «the bot must adapt to humans»). People say 2–4 words
// («បាយព្រឹកកូនពៅ») in about a second; speech-to-text on so little audio tends to invent a long, confident line
// («អាចង្របស្ពីភាត្របស្រៀល») or loop («…បស់អាហារបស់អាហារ», Task #512). Guards, pure (voice-guard.test.ts): the
// everyday words as the prompt bias for a short clip, and a check that refuses a transcript the clip cannot have held.

/** «Up to 2 s»: Telegram gives whole seconds, so a 1.4 s note says 1. */
export const SHORT_CLIP_SECONDS = 2

/**
 * The founder's vocabulary for short notes: groceries, drinks, dairy and the market (Task #512 — «ដោះគោស្រស់និងផ្លែឈើ»
 * became «បានផល្លាសារបស់អាហារបស់អាហារ»), then the family words of Task #507 — no amounts (no number to invent).
 * Groq refuses a prompt over 896 characters by its own count (HTTP 400 — measured 26/10/2026: 428 Khmer letters counted
 * 1,178), and a refused prompt is no transcript at all: kept under GROQ_PROMPT_BYTES (voice-guard.test.ts).
 */
export const KHMER_EVERYDAY = "ដោះគោ ទឹកដោះគោស្រស់ ផ្លែឈើ បន្លែ ត្រី សាច់ គ្រឿងទេស នំចំណី ភេសជ្ជៈ ម្ហូបអាហារ បាយព្រឹក បាយថ្ងៃ កាហ្វេ សាំង ផ្សារ កូនពៅ គ្រួសារ ចំណាយប្រចាំថ្ងៃ"
/** A safe ceiling for Groq's 896: UTF-8 bytes (3 per Khmer letter) are never fewer than its count. */
export const GROQ_PROMPT_BYTES = 896

export const isShortClip = (seconds: number | null | undefined) => typeof seconds === "number" && seconds > 0 && seconds <= SHORT_CLIP_SECONDS

/** The Whisper prompt for a Khmer note: the everyday words for a short clip, else the general money hint. */
export const khmerHint = (seconds: number | null | undefined, general: string) => (isShortClip(seconds) ? KHMER_EVERYDAY : general)

/** Khmer letters a second of quick speech can hold (about 6 syllables of ~3 letters), with a little slack. */
const LETTERS_PER_SECOND = 16
const SLACK = 4

const onlyKhmer = (text: string) => text.replace(/[^ក-៿]/g, "")
const khmerLetters = (text: string) => onlyKhmer(text).length

/**
 * Whisper looping (Task #512): a run of 5+ Khmer letters said twice in a row — «…បស់អាហារបស់អាហារ». Spaces, digits and
 * Latin are left out first, so «បាយ 5000 បាយ 5000» never counts; a short double («ម្ដងម្ដង») does not either.
 */
export const repeatsItself = (text: string) => /([ក-៿]{5,})\1/u.test(onlyKhmer(text))

/** Whisper's own loop signal: a segment whose text compresses more than 2.4× (its compression_ratio_threshold). */
export const WHISPER_COMPRESSION_LIMIT = 2.4

/**
 * A transcript not to trust: a loop (in the words, or by Whisper's own compression ratio), more Khmer letters than the
 * clip could hold, or — for Whisper, which scores itself — a low average log-probability or a likely silence (stricter
 * on a short clip, where invention is most common).
 */
export function transcriptUnsure(o: { text: string; seconds?: number | null; logprob?: number | null; noSpeech?: number | null; compression?: number | null }): boolean {
  const short = isShortClip(o.seconds)
  if (repeatsItself(o.text)) return true
  if (typeof o.compression === "number" && o.compression > WHISPER_COMPRESSION_LIMIT) return true
  if (short && khmerLetters(o.text) > LETTERS_PER_SECOND * Math.max(o.seconds ?? 1, 1) + SLACK) return true
  if (typeof o.logprob === "number" && o.logprob < (short ? -0.6 : -1)) return true
  if (typeof o.noSpeech === "number" && o.noSpeech > (short ? 0.5 : 0.8)) return true
  return false
}
