import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { khmerWordsToDigits } from "./bot/khmer-numbers"
import { FEATURE_KEYS } from "./features"
import { recorderMime, voiceDraft, VOICE_MAX_BYTES, VOICE_MAX_SECONDS } from "./voice-entry"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const cats = ["food", "transport", "salary", "other_expense", "other_income"].map((p, i) => ({
  id: `c${i}`,
  name: p,
  type: (p === "salary" || p === "other_income" ? "INCOME" : "EXPENSE") as "INCOME" | "EXPENSE",
  preset_key: p,
}))
const wallets = [
  { id: "cash", name: "សាច់ប្រាក់", currency: "KHR" as const, kind: "CASH", icon: null },
  { id: "aba", name: "ABA", currency: "USD" as const, kind: null, icon: "aba" },
]
const draft = (spoken: string) => voiceDraft(khmerWordsToDigits(spoken), { wallets, categories: cats, rate: 4000 })

describe("🎤 speak an entry in the app (founder, 3/11/2026)", () => {
  it("what was heard fills the sheet by the bot's own parser — amount, currency, kind, wallet, category", () => {
    assert.deepEqual(draft("កាហ្វេពីរដុល្លារ"), { type: "EXPENSE", amount: 2, currency: "USD", walletId: "aba", categoryId: "c0", note: "កាហ្វេ 2 ដុល្លារ" })
    assert.deepEqual(draft("ទិញសាំងម្ភៃពាន់រៀល"), { type: "EXPENSE", amount: 20000, currency: "KHR", walletId: "cash", categoryId: "c1", note: "ទិញសាំង 20000 រៀល" })
    assert.equal(draft("ប្រាក់ខែប្រាំរយដុល្លារ ABA")?.type, "INCOME")
    assert.equal(draft("ប្រាក់ខែប្រាំរយដុល្លារ ABA")?.categoryId, "c2")
  })

  it("exact money: what was said is kept, never rounded to 100 ៛ (a typed or spoken amount is the person's)", () => {
    assert.equal(draft("ថ្លៃម្ហូប 15050 រៀល")?.amount, 15050)
    assert.equal(draft("កាហ្វេ 2.75$")?.amount, 2.75)
  })

  it("the market shorthand and mixed digits (founder, 3/11/2026 — «បីពាន់ប្រាំ» was filled as 3,005)", () => {
    assert.equal(draft("កាហ្វេបីពាន់ប្រាំ")?.amount, 3500)
    assert.equal(draft("ទិញម្ហូប ពីរម៉ឺនប្រាំ")?.amount, 25000)
    assert.equal(draft("មួយលានប្រាំ រៀល")?.amount, 1_500_000)
    assert.equal(draft("បាយ ១ម៉ឺន៥ពាន់រៀល")?.amount, 15000)
    assert.equal(draft("កាហ្វេ ៣ពាន់៥")?.amount, 3500)
    assert.equal(draft("កាហ្វេ ៣ពាន់៥រយ")?.amount, 3500)
    // What is not shorthand stays as said.
    assert.equal(draft("បីពាន់ប្រាំរយ រៀល")?.amount, 3500)
    assert.equal(draft("ពីរពាន់ដប់ រៀល")?.amount, 2010)
    assert.equal(draft("ថ្លៃរៀន ពីររយដុល្លារ")?.amount, 200)
    assert.equal(draft("ទិញសាំង 2 ម៉ឺន")?.amount, 20000)
    assert.equal(draft("ម្ហូប 25,000៛")?.amount, 25000)
    assert.equal(draft("កាហ្វេ ២.៥ ដុល្លារ")?.amount, 2.5)
    assert.equal(khmerWordsToDigits("ទិញ 2 3"), "ទិញ 2 3")
  })

  it("no amount → nothing filled; a repayment or an unknown kind → the amount only, the person picks the rest", () => {
    assert.equal(draft("ញ៉ាំបាយ"), null)
    assert.deepEqual(draft("សង Dara 20$"), { type: "EXPENSE", amount: 20, currency: "USD", walletId: null, categoryId: null, note: "សង Dara 20$" })
    // The parser's «other» fallback is never offered: the category stays to pick.
    assert.equal(draft("អ្វីមួយ 3$")?.categoryId, null)
  })

  it("the recorder: webm on Android / Chrome, mp4 on iPhone, none → the «allow the microphone» message", () => {
    assert.equal(recorderMime((m) => m.startsWith("audio/webm")), "audio/webm;codecs=opus")
    assert.equal(recorderMime((m) => m === "audio/mp4"), "audio/mp4")
    assert.equal(recorderMime(() => false), null)
    assert.equal(VOICE_MAX_SECONDS, 30)
    assert.ok(VOICE_MAX_BYTES <= 2 * 1024 * 1024)
  })

  it("the server only listens: signed in, the feature flag, nothing saved or stored, the bot's unsure rule", () => {
    const route = read("src/app/api/voice-entry/route.ts")
    assert.match(route, /if \(!auth\.user\) return reply\(\{ error: "unauthorized" \}, 401\)/)
    assert.match(route, /voice_entry === false\) return reply\(\{ error: "feature" \}, 403\)/)
    assert.match(route, /guardRequest\(request, \{ name: "voice-entry", limit: 8/)
    assert.match(route, /if \(transcript\?\.unsure && !\/\\d\/\.test\(text\)\) return reply\(\{ error: "unsure", heard \}, 422\)/)
    assert.doesNotMatch(route, /\.from\(|\.insert\(|storage|upload|create_entry|logEvent/) // no row, no file, no log of what was said
    assert.ok(FEATURE_KEYS.includes("voice_entry"))
    assert.match(read("supabase/migrations/20270282000000_voice_entry_flag.sql"), /\('voice_entry', 'ADMIN_ONLY'\)/)
  })

  it("the sheet: a new entry only, behind the flag, filled — never saved — and what was heard shown to check", () => {
    const sheet = read("src/components/transactions/entry-form-sheet.tsx")
    assert.match(sheet, /const voice = useFeatures\(\)\.allowed\("voice_entry"\) && !editing/)
    const fill = sheet.slice(sheet.indexOf("const fillFromVoice"), sheet.indexOf("const remove = async"))
    assert.doesNotMatch(fill, /mutateAsync|onSubmit|handleSubmit/)
    assert.match(sheet, /t\("voice\.heard", \{ text: heard \}\)/)
    // The microphone is released when recording stops or the sheet closes.
    const button = read("src/components/transactions/voice-entry-button.tsx")
    assert.match(button, /getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/)
    assert.match(button, /if \(seconds >= VOICE_MAX_SECONDS\) rec\.stop\(\)/)
  })
})
