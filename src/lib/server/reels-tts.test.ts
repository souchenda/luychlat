import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { reelTtsConfigured, synthesizeReelLine } from "./reels-tts"

const audio = Buffer.alloc(4096, 1)
function fakeFetch(status = 200, body: Buffer = audio) {
  const calls: { url: string; init: RequestInit }[] = []
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return new Response(new Uint8Array(body), { status })
  }) as unknown as typeof fetch
  return { f, calls }
}

describe("Reels voices — Azure AI Speech (the licensed service only)", () => {
  it("speaks a line as SSML to the region's endpoint, as 48 kHz MP3, with Sophea's voice", async () => {
    const { f, calls } = fakeFetch()
    const mp3 = await synthesizeReelLine("តោះ!", "sophea", { fetch: f, key: "k", region: "southeastasia" })
    assert.equal(mp3.length, 4096)
    assert.equal(calls[0].url, "https://southeastasia.tts.speech.microsoft.com/cognitiveservices/v1")
    const h = calls[0].init.headers as Record<string, string>
    assert.equal(h["Ocp-Apim-Subscription-Key"], "k")
    assert.equal(h["X-Microsoft-OutputFormat"], "audio-48khz-192kbitrate-mono-mp3")
    assert.match(String(calls[0].init.body), /<voice name="km-KH-PisethNeural">/)
  })
  it("never a silent or partial clip: not configured, refused, or empty → a clear error", async () => {
    assert.equal(reelTtsConfigured({ key: undefined, region: "x" }), false)
    await assert.rejects(synthesizeReelLine("ក", "user", { fetch: fakeFetch().f, key: undefined, region: undefined }), /not configured/)
    await assert.rejects(synthesizeReelLine("ក", "user", { fetch: fakeFetch(401).f, key: "k", region: "r" }), /HTTP 401/)
    await assert.rejects(synthesizeReelLine("ក", "user", { fetch: fakeFetch(200, Buffer.alloc(10)).f, key: "k", region: "r" }), /empty clip/)
  })
  it("only Azure: no Edge-TTS or other unofficial endpoint", async () => {
    const { readFileSync } = await import("node:fs")
    const src = readFileSync(new URL("./reels-tts.ts", import.meta.url), "utf8").replace(/^\s*\/\/.*$/gm, "") // the code, not its comments
    assert.doesNotMatch(src, /edge|bing\.com|speech\.platform\.bing|readaloud/i)
    assert.match(src, /tts\.speech\.microsoft\.com\/cognitiveservices\/v1/)
  })
})
