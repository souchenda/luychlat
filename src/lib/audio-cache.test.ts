import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { AUDIO_CACHE, formatBytes, isCacheableAudio, isWholeBody, parseRange } from "./audio-cache"
import { quranAudioUrl } from "./quran-audio"

const sw = readFileSync(join(process.cwd(), "public/sw.js"), "utf8")

describe("Quran recitations offline (founder, 19/10/2026)", () => {
  it("only MP3Quran's CDN recitations are kept — nothing personal, nothing else", () => {
    assert.ok(isCacheableAudio(quranAudioUrl(18, "muaiqly")))
    assert.ok(!isCacheableAudio("https://app.luychlat.com/adhan/commons-cc0.mp3"))
    assert.ok(!isCacheableAudio("https://azetfqgzzuyyqvncaekf.supabase.co/storage/v1/object/public/nasheed-audio/a.mp3"))
    assert.ok(!isCacheableAudio("https://cdn.mp3quran.net/api/reciters.json"))
  })
  it("the byte range the player asks for, served from a kept file", () => {
    assert.deepEqual(parseRange("bytes=0-", 1000), { start: 0, end: 999 })
    assert.deepEqual(parseRange("bytes=100-199", 1000), { start: 100, end: 199 })
    assert.deepEqual(parseRange("bytes=900-5000", 1000), { start: 900, end: 999 })
    assert.deepEqual(parseRange("bytes=-200", 1000), { start: 800, end: 999 })
    assert.equal(parseRange("bytes=1000-", 1000), null)
    assert.equal(parseRange(null, 1000), null)
    assert.equal(parseRange("items=0-1", 1000), null)
  })
  it("kept only when the whole file came through — a seek or a stop halfway keeps nothing", () => {
    assert.equal(isWholeBody(200, null), true)
    assert.equal(isWholeBody(206, "bytes 0-584093/584094"), true)
    assert.equal(isWholeBody(206, "bytes 0-1023/584094"), false)
    assert.equal(isWholeBody(206, "bytes 1024-584093/584094"), false)
    assert.equal(isWholeBody(404, null), false)
  })
  it("the service worker: the same cache, kept through updates, routing only the CDN's MP3s", () => {
    assert.equal(AUDIO_CACHE, "luysmart-quran-audio-v1")
    assert.match(sw, /const AUDIO_CACHE = "luysmart-quran-audio-v1"/)
    assert.match(sw, /keys\.filter\(\(k\) => k !== CACHE && k !== AUDIO_CACHE\)/)
    assert.match(sw, /request\.url\.startsWith\(AUDIO_HOST\) && \/\\.mp3\$\/i\.test\(url\.pathname\)/)
    assert.match(sw, /const AUDIO_HOST = "https:\/\/cdn\.mp3quran\.net\/audio\/"/)
    assert.match(sw, /if \(res\.type !== "opaque" && isWholeBody\(res\)\)/)
  })
  it("the page may download from that host only (CSP), and plays recitations with CORS so they can be kept", () => {
    assert.match(readFileSync(join(process.cwd(), "next.config.ts"), "utf8"), /connect-src 'self' \$\{supabaseOrigin\} \$\{supabaseWs\} https:\/\/cdn\.mp3quran\.net/)
    assert.match(readFileSync(join(process.cwd(), "src/components/islamic/audio-player.tsx"), "utf8"), /if \(isCacheableAudio\(track\.src\)\) a\.crossOrigin = "anonymous"/)
  })
  it("sizes read plainly", () => {
    assert.equal(formatBytes(90_023_129), "85.9 MB")
    assert.equal(formatBytes(860_000), "840 KB")
  })
})
