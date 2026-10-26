// Short Khmer voice notes (founder, 26/10/2026 — Task #507: «the bot must adapt to humans»). People say 2–4 words
// («បាយព្រឹកកូនពៅ») in about a second; speech-to-text on so little audio tends to invent a long, confident line
// («អាចង្របស្ពីភាត្របស្រៀល»). Two guards, pure (voice-guard.test.ts): the everyday words as the prompt bias for a short
// clip, and a check that refuses a transcript the clip cannot have held.

/** «Up to 2 s»: Telegram gives whole seconds, so a 1.4 s note says 1. */
export const SHORT_CLIP_SECONDS = 2

/** The founder's vocabulary for short notes: everyday spending and family words, no amounts (no number to invent). */
export const KHMER_EVERYDAY = "ចំណាយប្រចាំថ្ងៃ ម្ហូបអាហារ អាហារពេលព្រឹក បាយព្រឹក បាយថ្ងៃ កាហ្វេ ទឹក នំ ចំណី កូនពៅ គ្រួសារ សាំង ផ្សារ"

export const isShortClip = (seconds: number | null | undefined) => typeof seconds === "number" && seconds > 0 && seconds <= SHORT_CLIP_SECONDS

/** The Whisper prompt for a Khmer note: the everyday words for a short clip, else the general money hint. */
export const khmerHint = (seconds: number | null | undefined, general: string) => (isShortClip(seconds) ? KHMER_EVERYDAY : general)

/** Khmer letters a second of quick speech can hold (about 6 syllables of ~3 letters), with a little slack. */
const LETTERS_PER_SECOND = 16
const SLACK = 4

const khmerLetters = (text: string) => text.replace(/[^ក-៿]/g, "").length

/**
 * A transcript not to trust: more Khmer letters than the clip could hold, or — for Whisper, which scores itself — a low
 * average log-probability or a likely silence (stricter on a short clip, where invention is most common).
 */
export function transcriptUnsure(o: { text: string; seconds?: number | null; logprob?: number | null; noSpeech?: number | null }): boolean {
  const short = isShortClip(o.seconds)
  if (short && khmerLetters(o.text) > LETTERS_PER_SECOND * Math.max(o.seconds ?? 1, 1) + SLACK) return true
  if (typeof o.logprob === "number" && o.logprob < (short ? -0.6 : -1)) return true
  if (typeof o.noSpeech === "number" && o.noSpeech > (short ? 0.5 : 0.8)) return true
  return false
}
