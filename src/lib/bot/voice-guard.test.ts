import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { dictionaries } from "@/lib/i18n/dictionaries"

import { GROQ_PROMPT_BYTES, joinKhmerWords, KHMER_EVERYDAY, isShortClip, khmerHint, repeatsItself, transcriptUnsure, VOICE_RETRY_DELAYS_S, whisperKhmerGuess, WHISPER_COMPRESSION_LIMIT } from "./voice-guard"

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
    assert.match(t, /\(a vocabulary aid only, not a list to choose from\): \$\{KHMER_EVERYDAY\}/)
    // Word for word, never a summary (founder, 3/11/2026: «កាបូបដាក់ប៊ិចកូនពៅ» was heard as «ទិញ របស់ ឲ្យ កូន»).
    assert.match(t, /never summarise, paraphrase, generalise or replace a word with a more common one/)
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
    assert.match(t, /generationConfig: \{ temperature: 0, maxOutputTokens: 256, thinkingConfig: NO_THINKING \}/)
    // The shared model chain (lib/server/gemini.ts — Tasks #513 / #514), 12 s per model.
    assert.match(t, /const got = await geminiChain\(\n\s+key,/)
    assert.match(t, /\},\n\s+24_000,\n\s+\)/)
    // «no clear speech» (an empty answer) is an answer, not a failure.
    assert.match(t, /return text \? \{ text, language: "khmer", model: got\.model \} : null/)
    // The audio for Whisper and Gemini alike: 0.4 s before, 0.8 s after, levelled, 16 kHz mono — no word clipped.
    assert.match(t, /"adelay=400:all=1,apad=pad_dur=0\.8,loudnorm=I=-16:TP=-1\.5:LRA=11", "-ar", "16000", "-ac", "1"/)
  })
})

describe("Gemini down — Whisper's Khmer guess is never shown back (founder, 4/11/2026)", () => {
  // The 07:01 note: a 2 s «ទិញបាយព្រឹកកូនៗ» while every Gemini model timed out.
  const heard = "ចំណាស្សារ បាយព្លាលផ្លារស្សារៀត្រាក់បានអាហាស់ត្ល្តាលប្រើបាមជាត្នៃទៅបំណាំងន្សារៀត្នៃបាស់បាំងត្រាក្រ"
  it("the regression: Whisper, unsure, Khmer, no amount → «busy», not the invented words", () => {
    const unsure = transcriptUnsure({ text: heard, seconds: 2, logprob: -0.56, noSpeech: 0.04, compression: 2.28 })
    assert.equal(unsure, true)
    assert.equal(whisperKhmerGuess({ via: "whisper+ffmpeg", unsure, text: heard }, heard), true)
  })
  it("not for Gemini, a sure transcript, an amount heard, or English", () => {
    assert.equal(whisperKhmerGuess({ via: "gemini gemini-3.5-flash", unsure: true, text: heard }, heard), false)
    assert.equal(whisperKhmerGuess({ via: "whisper", unsure: false, text: "បាយព្រឹក" }, "បាយព្រឹក"), false)
    assert.equal(whisperKhmerGuess({ via: "whisper", unsure: true, text: "បាយ ១៥០០០" }, "បាយ 15000"), false)
    assert.equal(whisperKhmerGuess({ via: "whisper", unsure: true, text: "coffee" }, "coffee"), false)
  })
  it("the note waits and is heard: «កំពុងស្ដាប់…», Gemini again after 20 s / 1 min / 2 min, then «type it short» — never Google named", () => {
    assert.deepEqual([...VOICE_RETRY_DELAYS_S], [20, 60, 120])
    const bot = read("src/lib/server/bot-commands.ts")
    assert.match(bot, /if \(!text \|\| whisperKhmerGuess\(transcript, khmerWordsToDigits\(text\)\)\) \{\n\s+if \(lang === "km" \|\| KHMER_SCRIPT\.test\(text \?\? ""\)\) return heardLater\(/)
    const later = bot.slice(bot.indexOf("async function heardLater"))
    assert.match(later, /tr\(lang, "bot\.voiceRetrying"\)/)
    assert.match(later, /const t = await transcribeGemini\(audio, seconds\)/)
    assert.match(later, /tg\("deleteMessage", \{ chat_id: chatId, message_id: waitId \}\)/)
    assert.match(later, /return afterHeard\(chatId, text, t, ctx, lang, onText\)/)
    assert.match(later, /tr\(lang, "bot\.voiceGaveUp"\)/)
    // Every try logged with its outcome (no silent failure).
    assert.match(later, /retry \$\{n \+ 1\}\/\$\{VOICE_RETRY_DELAYS_S\.length\}/)
    // The app: Gemini once more inside the same request; the guess never shown.
    const route = read("src/app/api/voice-entry/route.ts")
    assert.match(route, /if \(guess\(transcript\) && lang === "km"\) transcript = \(await transcribeGemini\(audio, seconds\)\) \?\? transcript/)
    assert.match(route, /if \(guess\(transcript\) && transcript\?\.text\.trim\(\)\) return reply\(\{ error: "busy" \}, 422\)/)
    // The person never reads «Google is busy» — to them the app would be broken (founder, 4/11/2026).
    for (const l of ["km", "en"] as const)
      for (const k of ["bot.voiceRetrying", "bot.voiceGaveUp", "voice.busy"] as const) assert.doesNotMatch(dictionaries[l][k], /Google/, `${l} ${k}`)
  })
})

describe("Khmer written as Khmer — no space between words (founder, 4/11/2026)", () => {
  it("the space between two Khmer words goes; beside a digit or a Latin word it stays", () => {
    assert.equal(joinKhmerWords("កូន ញ៉ាំ នៅ សាលា"), "កូនញ៉ាំនៅសាលា")
    assert.equal(joinKhmerWords("កាហ្វេ 2 ដុល្លារ"), "កាហ្វេ 2 ដុល្លារ")
    assert.equal(joinKhmerWords("ប្រាក់ ខែ ប្រាំរយ ដុល្លារ ABA"), "ប្រាក់ខែប្រាំរយដុល្លារ ABA")
    assert.equal(joinKhmerWords("coffee 2 dollars"), "coffee 2 dollars")
  })
  it("the parser reads the joined words better: «ប្រាក់ ខែ» spaced was an expense, «ប្រាក់ខែ» is the salary", () => {
    const t = read("src/lib/server/transcribe.ts")
    assert.match(t, /if \(t\) t\.text = joinKhmerWords\(t\.text\)/)
    assert.match(t, /text: joinKhmerWords\(g\.text\), retried: true/)
  })
})
