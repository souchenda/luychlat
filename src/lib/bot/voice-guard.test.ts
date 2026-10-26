import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { dictionaries } from "@/lib/i18n/dictionaries"

import { KHMER_EVERYDAY, isShortClip, khmerHint, transcriptUnsure } from "./voice-guard"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")

describe("Short Khmer voice notes — bias and hallucination guard (founder, 26/10/2026 — Task #507)", () => {
  it("a clip up to 2 s gets the founder's everyday words as the prompt; longer or unknown, the general money hint", () => {
    assert.equal(KHMER_EVERYDAY, "ចំណាយប្រចាំថ្ងៃ ម្ហូបអាហារ អាហារពេលព្រឹក បាយព្រឹក បាយថ្ងៃ កាហ្វេ ទឹក នំ ចំណី កូនពៅ គ្រួសារ សាំង ផ្សារ")
    assert.doesNotMatch(KHMER_EVERYDAY, /[\d០-៩]/) // no number for a short clip to invent
    assert.deepEqual([1, 2, 3, 0, undefined].map((s) => isShortClip(s)), [true, true, false, false, false])
    assert.equal(khmerHint(1, "GENERAL"), KHMER_EVERYDAY)
    assert.equal(khmerHint(5, "GENERAL"), "GENERAL")
    assert.equal(khmerHint(undefined, "GENERAL"), "GENERAL")
  })

  it("regression: «អាចង្របស្ពីភាត្របស្រៀល» from a 1 s note (Whisper logprob −0.74) is unsure; «បាយព្រឹកកូនពៅ» is not", () => {
    // The production log of 26/10 06:58: Gemini timed out, Whisper invented a 22-letter line from about a second of speech.
    assert.equal(transcriptUnsure({ text: "អាចង្របស្ពីភាត្របស្រៀល", seconds: 1, logprob: -0.74, noSpeech: 0.06 }), true)
    assert.equal(transcriptUnsure({ text: "អាចង្របស្ពីភាត្របស្រៀល", seconds: 1 }), true) // too long for 1 s even without a score
    assert.equal(transcriptUnsure({ text: "បាយព្រឹកកូនពៅ", seconds: 1, logprob: -0.3, noSpeech: 0.05 }), false)
    assert.equal(transcriptUnsure({ text: "បាយព្រឹកកូនពៅ", seconds: 1 }), false) // Gemini: no score, a plausible length
  })

  it("a low score or a likely silence: stricter on a short clip; a normal note passes; amounts are untouched", () => {
    assert.equal(transcriptUnsure({ text: "កាហ្វេ", seconds: 2, logprob: -0.65 }), true)
    assert.equal(transcriptUnsure({ text: "កាហ្វេ", seconds: 6, logprob: -0.65 }), false)
    assert.equal(transcriptUnsure({ text: "កាហ្វេ", seconds: 6, logprob: -1.2 }), true)
    assert.equal(transcriptUnsure({ text: "កាហ្វេ", seconds: 1, noSpeech: 0.6 }), true)
    assert.equal(transcriptUnsure({ text: "កាហ្វេ", seconds: 8, noSpeech: 0.6 }), false)
    assert.equal(transcriptUnsure({ text: "ទិញម្ហូបនៅផ្សារ និងចាក់សាំង 20000 រៀល ហើយទិញកាហ្វេ 2 ដុល្លារ", seconds: 6, logprob: -0.4 }), false)
  })

  it("wired: Whisper gets khmerHint at temperature 0, Gemini the same words, every transcript is checked", () => {
    const t = read("src/lib/server/transcribe.ts")
    assert.equal((t.match(/whisper\(provider, audio, "km", khmerHint\(seconds, HINT_KM\)\)/g) ?? []).length, 2)
    assert.match(t, /form\.append\("temperature", "0"\)/)
    assert.match(t, /Notes are often only 2–4 everyday words, such as: \$\{KHMER_EVERYDAY\}/)
    assert.match(t, /unsure: transcriptUnsure\(\{ text: t\.text, seconds, logprob: t\.logprob, noSpeech: t\.noSpeech \}\)/)
  })

  it("an unsure transcript without an amount is shown and never saved; with an amount the ✅ card still asks first", () => {
    const c = read("src/lib/server/bot-commands.ts")
    assert.match(c, /const transcript = await transcribe\(audio, lang, voice\.duration\)/)
    const unsure = c.indexOf("if (transcript?.unsure && !/[\\d០-៩]/.test(khmerWordsToDigits(text))) return sendText(chatId, tr(lang, \"bot.voiceUnsure\", { text }))")
    assert.ok(unsure > 0, "the guard")
    assert.ok(unsure < c.indexOf("if (onText && (await onText(text))) return"), "before a note prompt takes it")
    const km = dictionaries.km as Record<string, string>
    assert.match(km["bot.voiceUnsure"], /^🎙️ ស្ដាប់មិនសូវច្បាស់ទេបង \(ឮថា «\{text\}»\) 🙏 មិនទាន់កត់ទេ/)
    assert.doesNotMatch(km["bot.voiceUnsure"], /លោក|⚠️/)
    assert.ok((dictionaries.en as Record<string, string>)["bot.voiceUnsure"])
  })
})
