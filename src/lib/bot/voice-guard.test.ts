import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { dictionaries } from "@/lib/i18n/dictionaries"

import { GROQ_PROMPT_BYTES, KHMER_EVERYDAY, isShortClip, khmerHint, repeatsItself, transcriptUnsure, WHISPER_COMPRESSION_LIMIT } from "./voice-guard"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")

describe("Short Khmer voice notes — bias and hallucination guard (founder, 26/10/2026 — Task #507)", () => {
  it("a clip up to 2 s gets the founder's everyday words as the prompt; longer or unknown, the general money hint", () => {
    // Task #512: the founder's grocery / dairy / market words first, then the family words of #507.
    assert.ok(KHMER_EVERYDAY.startsWith("ដោះគោ ទឹកដោះគោស្រស់ ផ្លែឈើ បន្លែ ត្រី សាច់ គ្រឿងទេស នំចំណី ភេសជ្ជៈ ម្ហូបអាហារ បាយព្រឹក បាយថ្ងៃ កាហ្វេ សាំង ផ្សារ"))
    for (const w of ["កូនពៅ", "គ្រួសារ"]) assert.ok(KHMER_EVERYDAY.includes(w), w)
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
    assert.match(t, /unsure: transcriptUnsure\(\{ text: t\.text, seconds, logprob: t\.logprob, noSpeech: t\.noSpeech, compression: t\.compression \}\)/)
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

describe("Whisper looping and the prompt's size (founder, 26/10/2026 — Task #512)", () => {
  it("regression: «បានផល្លាសារបស់អាហារបស់អាហារ» from a 2 s note (logprob −0.32 — confident) is a loop, never saved", () => {
    // The production log of 26/10 12:54: Gemini answered 503, Whisper looped on «…បស់អាហារ»; the founder said «ដោះគោស្រស់និងផ្លែឈើ».
    assert.equal(repeatsItself("បានផល្លាសារបស់អាហារបស់អាហារ"), true)
    assert.equal(transcriptUnsure({ text: "បានផល្លាសារបស់អាហារបស់អាហារ", seconds: 2, logprob: -0.32, noSpeech: 0 }), true)
    assert.equal(transcriptUnsure({ text: "ដោះគោស្រស់និងផ្លែឈើ", seconds: 2, logprob: -0.3, noSpeech: 0 }), false)
  })
  it("not a loop: real notes, amounts said twice, «ៗ», a short double", () => {
    for (const t of ["ដោះគោស្រស់និងផ្លែឈើ", "បាយព្រឹកកូនពៅ", "បាយ 5000 បាយ 5000", "នំកូនៗ", "ម្ដងម្ដង", "ទិញត្រី និងសាច់នៅផ្សារ", "កាហ្វេ 2 ដុល្លារ"]) assert.equal(repeatsItself(t), false, t)
  })
  it("Whisper's own loop measure: a segment compressing over 2.4× is unsure at any length", () => {
    assert.equal(WHISPER_COMPRESSION_LIMIT, 2.4)
    assert.equal(transcriptUnsure({ text: "កាហ្វេ", seconds: 8, logprob: -0.2, compression: 2.9 }), true)
    assert.equal(transcriptUnsure({ text: "កាហ្វេ", seconds: 8, logprob: -0.2, compression: 1.7 }), false)
  })
  it("the short-clip prompt stays under Groq's limit (HTTP 400 over 896 — then no transcript at all)", () => {
    assert.equal(GROQ_PROMPT_BYTES, 896)
    assert.ok(Buffer.byteLength(KHMER_EVERYDAY, "utf8") <= GROQ_PROMPT_BYTES, `${Buffer.byteLength(KHMER_EVERYDAY, "utf8")} bytes`)
  })
  it("wired: compression_ratio read from every segment; Gemini without «thinking», the next model when one is down or slow", () => {
    const t = read("src/lib/server/transcribe.ts")
    assert.match(t, /const compression = segs\.length \? Math\.max\(\.\.\.segs\.map\(\(x\) => x\.compression_ratio \?\? 0\)\) : null/)
    assert.match(t, /transcriptUnsure\(\{ text: t\.text, seconds, logprob: t\.logprob, noSpeech: t\.noSpeech, compression: t\.compression \}\)/)
    assert.match(t, /generationConfig: \{ temperature: 0, maxOutputTokens: 256, thinkingConfig: \{ thinkingBudget: 0 \} \}/)
    assert.match(t, /for \(const model of GEMINI_MODELS\) \{/) // the shared list (lib/gemini-models.ts — Task #513)
    assert.match(t, /if \(r !== "failed"\) return r/) // «no clear speech» is an answer, not a failure
    assert.match(t, /signal: AbortSignal\.timeout\(GEMINI_TIMEOUT_MS\)/)
    // The audio for Whisper and Gemini alike: 0.4 s before, 0.8 s after, levelled, 16 kHz mono — no word clipped.
    assert.match(t, /"adelay=400:all=1,apad=pad_dur=0\.8,loudnorm=I=-16:TP=-1\.5:LRA=11", "-ar", "16000", "-ac", "1"/)
  })
})
