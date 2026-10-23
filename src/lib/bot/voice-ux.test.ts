import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { dictionaries } from "@/lib/i18n/dictionaries"

import { khmerWordsToDigits } from "./khmer-numbers"
import { parseEntry, presetFromWords } from "./parse-entry"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const wallets = [
  { id: "w1", name: "សាច់ប្រាក់", currency: "KHR", kind: "CASH" },
  { id: "w2", name: "ABA", currency: "USD", kind: "BANK" },
] as never

describe("Short voice notes in @luychlat_bot — a friendly reply, never the rigid error (founder, 23/10/2026 — Task #471)", () => {
  it("1–2 word notes parse: «បាយ ១ម៉ឺន», «បាយមួយម៉ឺន», «សាំង 2$»; «ទិញសាច់» is a note (no amount), not a failure", () => {
    const ok = (s: string) => {
      const p = parseEntry(khmerWordsToDigits(s), { wallets, categories: [], debts: [], rate: 4100 } as never)
      return p.ok ? `${(p as { amount: number }).amount} ${(p as { currency: string }).currency}` : (p as { reason: string }).reason
    }
    assert.equal(ok("បាយ ១ម៉ឺន"), "10000 KHR")
    assert.equal(ok("បាយមួយម៉ឺន"), "10000 KHR")
    assert.equal(ok("សាំង 2$"), "2 USD")
    assert.equal(ok("ទិញសាច់"), "no_amount")
  })

  it("a slip just saved + a spoken category word: the slip's category (ម្ហូប / បាយ → food, សាំង → transport, ទិញទំនិញ → stock)", () => {
    assert.deepEqual(["ម្ហូប", "បាយ", "សាំង", "ទិញទំនិញ"].map((w) => presetFromWords(w)), ["food", "food", "transport", "inventory"])
    // «ទិញសាច់» names no category on its own (meat is stock for a meat shop): never guessed — the note only.
    assert.equal(presetFromWords("ទិញសាច់"), null)
    const c = read("src/lib/server/bot-commands.ts")
    assert.match(c, /if \(parsed\.reason === "no_amount" && \(await noteOnRecentEntry\(chatId, heard \?\? input, lang, Boolean\(heard\)\)\)\) return/)
    // The saved slip cards are the prompts the note lands on (bot_tx_note_recent).
    assert.equal(read("src/lib/server/slip-bot.ts").match(/await rememberCard\(chatId, r\.tx_id/g)?.length, 2)
  })

  it("empty or unclear: «ស្ដាប់មិនសូវច្បាស់ទេបង 🙏 …» (inline text, no alert); a card that could not be saved: a gentle line and the reason logged", () => {
    const km = dictionaries.km
    assert.equal(km["bot.voiceFailed"], "ស្ដាប់មិនសូវច្បាស់ទេបង 🙏 សូមបងសាកល្បងនិយាយម្ដងទៀត ឬវាយជាអក្សរខ្លីៗ (ឧ. បាយ 10000 ឬ សាំង 2$)។")
    assert.doesNotMatch(km["bot.voiceSaveFailed"], /⚠️|មិនអាចកត់ត្រាបានទេ/)
    assert.doesNotMatch(km["bot.voiceNoAmount"], /⚠️/)
    for (const lang of ["en", "zh"] as const) assert.ok(dictionaries[lang]["bot.voiceSaveFailed"], lang)
    const c = read("src/lib/server/bot-commands.ts")
    assert.match(c, /if \(!text\) return sendText\(chatId, tr\(lang, "bot\.voiceFailed"\)\)/)
    assert.match(c, /if \(!pendingId\) return reply\(tr\(lang, heard \? "bot\.voiceSaveFailed" : "bot\.saveFailed"\)\)/)
    assert.match(c, /logEvent\("warn", "bot", `Entry card not saved \(\$\{parsed\.kind\}\$\{extra\.heard \? ", voice" : ""\}\): \$\{error\?\.message \?\? "no id returned"\}`/)
    assert.match(c, /logEvent\("warn", "bot", `Follow-up note not saved: \$\{msg \|\| "not ok"\}`/)
  })

  it("the audio for a 1–2 s note is padded and levelled before speech-to-text (ffmpeg: 0.4 s before, 0.8 s after, 16 kHz mono)", () => {
    assert.match(read("src/lib/server/transcribe.ts"), /"adelay=400:all=1,apad=pad_dur=0\.8,loudnorm=I=-16:TP=-1\.5:LRA=11", "-ar", "16000", "-ac", "1"/)
  })
})
