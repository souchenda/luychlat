import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { ADHAN, SAHUR, SEMBAHYANG, WUDU } from "./glossary"
import { audioCues, mixArgs, REEL_AMBIENT, REEL_LEXICON, REEL_MIX, REEL_SFX, REEL_VOICES, reelSsml, scriptMixArgs, voiceRateFor } from "./reels-audio"
import { REEL_SCRIPTS } from "./reels-scripts"
import { reelTimeline } from "./reels-timeline"

const ep01 = REEL_SCRIPTS[0]

describe("Reels audio — the Khmer voices (Azure AI Speech, SSML)", () => {
  it("Sophea speaks with km-KH-PisethNeural (the founder's choice); the viewer with Sreymom, so they never sound alike", () => {
    assert.equal(REEL_VOICES.sophea, "km-KH-PisethNeural")
    assert.equal(REEL_VOICES.user, "km-KH-SreymomNeural")
    assert.notEqual(REEL_VOICES.sophea, REEL_VOICES.user)
  })
  it("SSML: the voice, 1.05× and a lively pitch, pauses after «!», «?» and «...», «·» never read aloud, XML escaped", () => {
    const ssml = reelSsml("តោះ! ក្រោក? ចាំ... ស្អែក · ថ្ងៃ <b>", "sophea")
    assert.match(ssml, /^<speak version="1\.0" xmlns="http:\/\/www\.w3\.org\/2001\/10\/synthesis" xml:lang="km-KH"><voice name="km-KH-PisethNeural"><prosody rate="\+5%" pitch="\+4%">/)
    assert.ok(ssml.includes(`!<break time="320ms"/>`) && ssml.includes(`?<break time="320ms"/>`) && ssml.includes(`...<break time="550ms"/>`))
    assert.ok(ssml.includes(`ស្អែក <break time="250ms"/> ថ្ងៃ`) && !ssml.includes("·"))
    assert.ok(ssml.includes("&lt;b&gt;") && !ssml.includes("<b>"))
    assert.ok(ssml.endsWith("</prosody></voice></speak>"))
  })
  it("the Islamic words: read as written until the founder hears one misread; then an SSML <sub> alias, never a guess", () => {
    assert.deepEqual(REEL_LEXICON.map((x) => x.term), [SEMBAHYANG, WUDU, ADHAN, SAHUR])
    assert.ok(REEL_LEXICON.every((x) => x.alias === null)) // no alias until heard
    const line = `ដល់សំឡេង${ADHAN}ហៅ${SEMBAHYANG}`
    assert.ok(!reelSsml(line, "sophea").includes("<sub"))
    const tuned = reelSsml(line, "sophea", [{ term: ADHAN, alias: "អា ហ្សាន", note: "" }])
    assert.ok(tuned.includes(`<sub alias="អា ហ្សាន">${ADHAN}</sub>`))
  })
  it("a clip too long for its beat speeds up (at most +20%), else the line must be rewritten", () => {
    assert.equal(voiceRateFor(4, 5), "+5%") // fits: 5 − 0.25 − 0.3 = 4.45 s
    assert.equal(voiceRateFor(4.8, 5), "+14%")
    assert.equal(voiceRateFor(6, 5), null)
  })
})

describe("Reels audio — the comedy effects and the mix", () => {
  it("the four effects are bundled (synthesized in-house, MP3) and the ambient Adhan is the app's CC0 recording", () => {
    for (const [id, s] of Object.entries(REEL_SFX)) {
      const mp3 = readFileSync(join(process.cwd(), s.file))
      assert.ok(mp3.length > 4000 && mp3.length < 60_000, id)
      assert.ok(mp3.subarray(0, 3).toString("latin1") === "ID3" || (mp3[0] === 0xff && (mp3[1] & 0xe0) === 0xe0), `${id}: an MP3`)
    }
    assert.ok(readFileSync(join(process.cwd(), REEL_AMBIENT.adhan)).length > 50_000)
    assert.match(readFileSync(join(process.cwd(), "public/adhan/README.txt"), "utf8"), /Licensed/)
    assert.match(readFileSync(join(process.cwd(), "scripts/reels-sfx.sh"), "utf8"), /anoisesrc|aevalsrc|sine=/) // made, not downloaded
  })
  it("Episode 01's cues: the voices, the Adhan from 2.5 s, the scratch as Sophea appears, the thud, the dash, the chime on the call", () => {
    const cues = audioCues(ep01).map((c) => `${c.kind === "sfx" ? c.id : c.kind === "voice" ? `voice:${c.speaker}` : "ambient"}@${c.at}`)
    const cta = reelTimeline(ep01).find((c) => c.text.includes("app.luychlat.com"))!
    assert.deepEqual(cues, ["voice:user@0.25", "ambient@2.5", "record_scratch@5", "voice:sophea@5.25", "dramatic_thud@12.5", "cartoon_dash@13.1", `pop_chime@${cta.start}`])
    // The chime is tied to its line: it moves with the line when the text changes.
    assert.throws(() => audioCues({ ...ep01, beats: ep01.beats.map((b, i) => (i === 2 ? { ...b, sfx: [{ id: "pop_chime" as const, withLine: 5 }] } : b)) }), /pop_chime on line 5 of resolution, which has 2/)
  })
  it("the FFmpeg mix: each input delayed to its cue, voices −16 LUFS at 1.0, the Adhan at 0.15 faded out, summed without renormalising, cut at the length", () => {
    const args = scriptMixArgs(ep01, ["/r/v0.mp3", "/r/v1.mp3"], "/app", "/r/mix.m4a")
    const graph = args[args.indexOf("-filter_complex") + 1]
    assert.equal(args.filter((a) => a === "-i").length, 7) // 2 voices + the Adhan + 4 effects
    assert.match(graph, /\[0:a\]loudnorm=I=-16:TP=-1\.5:LRA=11,aresample=48000,adelay=delays=250:all=1,volume=1\[v0\]/)
    assert.match(graph, /\[1:a\]loudnorm=[^;]*adelay=delays=5250:all=1,volume=1\[v1\]/)
    assert.match(graph, new RegExp(`\\[2:a\\]aresample=48000,adelay=delays=2500:all=1,volume=${REEL_MIX.ambient},afade=t=out:st=18\\.5:d=1\\.5\\[bg\\]`))
    assert.match(graph, /adelay=delays=5000:all=1,volume=0\.8\[s0\]/) // the record scratch
    assert.match(graph, /amix=inputs=7:normalize=0:duration=longest,apad,aformat=sample_rates=48000:channel_layouts=stereo,alimiter=limit=0\.95\[mix\]$/)
    assert.equal((graph.match(/loudnorm/g) ?? []).length, 2) // the voices only
    assert.deepEqual(args.slice(-9), ["-map", "[mix]", "-t", "20", "-c:a", "aac", "-b:a", "192k", "/r/mix.m4a"])
    assert.ok(args.includes("/app/public/adhan/commons-cc0-short.mp3") && args.includes("/app/public/audio/sfx/pop_chime.mp3"))
    assert.throws(() => scriptMixArgs(ep01, ["/r/v0.mp3"], "/app", "/r/mix.m4a"), /2 voice lines, 1 files/)
  })
  it("no ambient and no effects still mixes (a voice only)", () => {
    const args = mixArgs({ voices: [{ file: "/v.mp3", at: 0.25 }], ambient: null, sfx: [], seconds: 15, out: "/o.m4a" })
    assert.match(args.join(" "), /amix=inputs=1:normalize=0/)
    assert.ok(args.includes("-t") && args[args.indexOf("-t") + 1] === "15")
  })
})
