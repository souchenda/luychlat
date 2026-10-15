// GOLDEN PATH 3 — SoundBox alerts (sales only, the Khmer amount, stays on, the locked-screen push).
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { khmerClipSequence, readSoundboxEnabled, receiveEvent, shouldEmit, soundboxPush, writeSoundboxEnabled } from "../../src/lib/soundbox"

describe("GOLDEN 3 · SoundBox alerts", () => {
  it("only a customer's sale is announced — never an own transfer or an unknown status", () => {
    assert.equal(shouldEmit("ok"), true)
    assert.equal(shouldEmit("transfer"), false)
    assert.equal(shouldEmit(undefined), false)
  })
  it("«ទទួលបានប្រាក់ ប្រាំម៉ឺនរៀល»: 50,000 ៛ is received + 5 + ម៉ឺន + រៀល", () => {
    assert.deepEqual(khmerClipSequence(50_000, "KHR"), ["received", "5", "meun", "riel"])
  })
  it("a payment is listed and announced once, even if it arrives twice (live + the backup check)", () => {
    const row = { id: "e1", workspace_id: "w", amount: 50_000, currency: "KHR", transaction_time: "2026-10-14T02:00:00Z", created_at: "2026-10-14T02:00:01Z" }
    const first = receiveEvent([], row)
    assert.ok(first.added)
    assert.equal(receiveEvent(first.list, row).added, null)
  })
  it("turned on, it stays on after a reload; only «🔇 បិទសំឡេង» turns it off", () => {
    const m = new Map<string, string>()
    const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
    writeSoundboxEnabled(store, "dl", true)
    assert.equal(readSoundboxEnabled(store, "dl"), true)
    writeSoundboxEnabled(store, "dl", false)
    assert.equal(readSoundboxEnabled(store, "dl"), false)
  })
  it("screen locked: the push carries the amount", () => {
    assert.match(soundboxPush({ id: "t", amount: 5, currency: "USD" }).title, /^💰 ទទួលបានប្រាក់ /)
  })
  it("the phone's audio is never held: no looping media, no Media Session; released after each announcement (founder, 14/10/2026 — it muted Telegram voice notes on iPhone)", () => {
    const src = readFileSync(join(process.cwd(), "src", "lib", "soundbox-audio.ts"), "utf8")
    assert.doesNotMatch(src, /\.loop\s*=\s*true/)
    assert.doesNotMatch(src, /mediaSession|new Audio\(/)
    assert.match(src, /ctx\.suspend\(/)
    assert.match(src, /finally \{[\s\S]{0,160}?release\(\)/)
  })
  it("speech is not dropped: the engine is cancelled only when it is busy, speech is unlocked by a real utterance, a stuck attempt is retried, and every announcement is reported (founder, 14/10/2026 — the 13:38 payment chimed, then nothing)", () => {
    const src = readFileSync(join(process.cwd(), "src", "lib", "soundbox-audio.ts"), "utf8")
    assert.match(src, /if \(synth\.speaking \|\| synth\.pending\) synth\.cancel\(\)/)
    assert.doesNotMatch(src, /try \{\s*synth\.cancel\(\)/)
    assert.doesNotMatch(src, /new SpeechSynthesisUtterance\(" "\)/)
    assert.match(src, /log\.push\(`\$\{lang\}:retry:\$\{r\}`\)/)
    const page = readFileSync(join(process.cwd(), "src", "app", "(app)", "soundbox", "page.tsx"), "utf8")
    assert.match(page, /rpcFresh\(supabase, "soundbox_report"/)
    assert.match(page, /setAudioIssue\(audioIssueOf\(r\)\)/)
  })
  it("a late push (bank time over 10 min before the server got it) is listed, never rung, spoken, flashed or pushed (founder, 14/10/2026)", () => {
    const page = readFileSync(join(process.cwd(), "src", "app", "(app)", "soundbox", "page.tsx"), "utf8")
    assert.match(page, /if \(isLatePush\(added\.transaction_time, added\.created_at \?\? Date\.now\(\)\)\) \{\s*report\(\[document\.visibilityState, "late"\]\)\s*return/)
    const ingest = readFileSync(join(process.cwd(), "src", "app", "api", "khqr", "ingest", "route.ts"), "utf8")
    assert.match(ingest, /const late = isLatePush\(r\.posted_at, Date\.now\(\)\)[\s\S]{0,200}else if[\s\S]{0,400}sendPaymentVoice[\s\S]{0,300}sendSoundboxPush/)
  })
  it("the counter phone's heartbeat runs on /soundbox for the in-app status only — no SoundBox alert is ever sent on Telegram", () => {
    const page = readFileSync(join(process.cwd(), "src", "app", "(app)", "soundbox", "page.tsx"), "utf8")
    assert.match(page, /useHeartbeat\(counterId, enabled/)
    assert.match(page, /rpcFresh\(supabase, "soundbox_heartbeat"/)
    // No SoundBox Telegram alerts — not when a phone goes offline, not when a sale arrives with none open
    // (founder, 15/10/2026: «permanently disable»). The heartbeat only feeds the in-app status.
    const dispatch = readFileSync(join(process.cwd(), "src", "lib", "server", "bot-dispatch.ts"), "utf8")
    assert.doesNotMatch(dispatch, /soundboxWatch|soundbox-watch/)
    const ingest = readFileSync(join(process.cwd(), "src", "app", "api", "khqr", "ingest", "route.ts"), "utf8")
    assert.doesNotMatch(ingest, /alertIfNoSoundbox|soundbox-watch/)
    const km = readFileSync(join(process.cwd(), "src", "lib", "i18n", "dictionaries.ts"), "utf8")
    assert.doesNotMatch(km, /"soundbox\.alert(Offline|NotOpen)"/)
  })
  it("iPhone speech: primed synchronously inside the tap (before any await), re-primed on every tap until a payment is spoken, and the audio context lets go between the chime and the words (founder, 14/10/2026 — the 17:40 payment chimed without words)", () => {
    const src = readFileSync(join(process.cwd(), "src", "lib", "soundbox-audio.ts"), "utf8")
    const unlock = src.slice(src.indexOf("export async function unlockAudio"))
    assert.ok(unlock.indexOf("warmSpeech()") > 0 && unlock.indexOf("warmSpeech()") < unlock.indexOf("await ctx"), "warmSpeech must run before the first await")
    assert.match(src, /await playPaymentChime\(volume\)\s*\/\/[^\n]*\n[\s\S]{0,200}?ctx\.suspend\(\)/)
    assert.match(src, /speaking\.add\(u\)/)
    const page = readFileSync(join(process.cwd(), "src", "app", "(app)", "soundbox", "page.tsx"), "utf8")
    assert.match(page, /if \(speechNeedsTap\(\)\) \{\s*warmSpeech\(\)/)
    // The page never shows «not connected» about itself.
    assert.match(page, /<SoundboxStatus\s+workspaceId=\{counterId\}\s+self=\{/)
  })
})
