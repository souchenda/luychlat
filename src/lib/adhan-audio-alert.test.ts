import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { adhanAudioCaption, adhanTrackFor } from "./adhan-audio-alert"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const SUPA = "https://db.example.co"
const SITE = "https://app.luychlat.com"
const official = { id: "a96d61e5-8eb0-4c65-8f8a-9dd522d6809f", name_km: "អាហ្សានផ្លូវការ អេប លុយឆ្លាត", name_en: null, credit: "x", audio_path: "04c6dc53-830f-462e-a74b-c19552dec66d.mp3" }

describe("The Adhan as audio in Telegram (founder, 20/10/2026)", () => {
  it("the app-wide default the admin set (the official Adhan), at every prayer while there is no Fajr recording", () => {
    const tracks = { defaults: { regular: `g:${official.id}` }, global: [official] }
    for (const p of ["fajr", "dhuhr", "asr", "maghrib", "isha"])
      assert.deepEqual(adhanTrackFor(p, tracks, SUPA, SITE), { id: `g:${official.id}`, url: `${SUPA}/storage/v1/object/public/adhan-audio/${official.audio_path}` }, p)
  })
  it("the Fajr default at Fajr only, when one is set", () => {
    const fajrRow = { ...official, id: "11111111-2222-4333-8444-555555555555", audio_path: "11111111-2222-4333-8444-555555555555.mp3" }
    const tracks = { defaults: { regular: `g:${official.id}`, fajr: `g:${fajrRow.id}` }, global: [official, fajrRow] }
    assert.equal(adhanTrackFor("fajr", tracks, SUPA, SITE)!.id, `g:${fajrRow.id}`)
    assert.equal(adhanTrackFor("isha", tracks, SUPA, SITE)!.id, `g:${official.id}`)
  })
  it("no default: the first built-in (CC0) recording, as a full https URL on the app's site", () => {
    assert.deepEqual(adhanTrackFor("dhuhr", {}, SUPA, SITE), { id: "commons-cc0-natural", url: `${SITE}/adhan/commons-cc0-natural.mp3` })
  })
  it("the founder's caption, HTML-safe; English for the other languages", () => {
    assert.equal(
      adhanAudioCaption({ khmer: true, prayerName: "ហ្សូហួរ", time: "12:01", place: "ភ្នំពេញ" }),
      ["🕌 <b>ដល់ម៉ោងសឡាត ហ្សូហួរ ហើយ!</b>", "⏰ ម៉ោង៖ 12:01", "📍 ទីតាំង៖ ភ្នំពេញ", "— អេប លុយឆ្លាត សហគមន៍ឥស្លាម"].join("\n"),
    )
    assert.match(adhanAudioCaption({ khmer: false, prayerName: "<Asr>", time: "15:20", place: "Kampot" }), /^🕌 <b>It's time for &lt;Asr&gt;!<\/b>/)
  })
  it("the dispatcher sends the audio to members who chose it, text otherwise (and when the audio fails); /adhan on | off; the app switch", () => {
    const d = read("src/lib/server/bot-dispatch.ts")
    assert.match(d, /if \(s\.adhan_audio\) sent = await sendAdhanAudio\(/)
    assert.match(d, /if \(!sent\) await sendText\(s\.chat_id/)
    assert.match(read("src/app/api/telegram/webhook/route.ts"), /bot_set_adhan_audio/)
    assert.match(read("src/components/settings/official-bot.tsx"), /update\.mutate\(\{ adhan_audio: v/)
    const sql = read("supabase/migrations/20270203000000_telegram_adhan_audio.sql")
    assert.match(sql, /grant update \(adhan_audio\) on public\.telegram_links to authenticated;/)
    assert.match(sql, /returns table \(user_id uuid, chat_id bigint, language text, province text, adhan_audio boolean\)/)
  })
})
