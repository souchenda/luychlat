import assert from "node:assert/strict"
import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { ADHAN_PRESETS, adhanForPrayer, availablePresets, CUSTOM_ADHAN, FAJR_ADHAN, hasFajrRecording, resolvePreset } from "./adhan-presets"
import { ISLAMIC_ARABIC } from "./islamic"

describe("Adhan presets — only licensed recordings, each with its source", () => {
  it("every preset with a file has a credit line and the file is in /public", () => {
    for (const p of [...ADHAN_PRESETS, FAJR_ADHAN].filter((x) => x.file)) {
      assert.ok(p.credit && p.credit.length > 5, `${p.id} needs its source and licence`)
      const path = join(process.cwd(), "public", p.file!)
      assert.ok(existsSync(path), `${p.file} is missing`)
      assert.ok(statSync(path).size > 50_000, `${p.file} looks empty`)
    }
  })
  it("the Wikimedia Commons recording is CC0 and served from /adhan/ (cached offline by the service worker)", () => {
    const p = availablePresets().find((x) => x.id === "commons-cc0")
    assert.ok(p)
    assert.equal(p.file, "/adhan/commons-cc0.mp3")
    assert.match(p.credit!, /CC0/)
    assert.ok(readFileSync(join(process.cwd(), "public/sw.js"), "utf8").includes('startsWith("/adhan/")'))
  })
  it("no recording is presented as the Fajr Adhan unless it really is one", () => {
    assert.equal(FAJR_ADHAN.file, null)
  })
  it("presets without a file (Makkah, Madinah, Alafasy, Al-Aqsa) never show", () => {
    for (const id of ["makkah", "madinah", "alafasy", "aqsa"]) assert.ok(!availablePresets().some((p) => p.id === id))
  })
})

describe("resolvePreset — what plays for the stored choice", () => {
  it("the old default «makkah» (no file) plays the built-in recording, never silence", () => {
    assert.equal(resolvePreset("makkah", false)?.id, "commons-cc0-natural")
    assert.equal(resolvePreset(undefined, false)?.id, "commons-cc0-natural")
  })
  it("a phone file the person chose is kept", () => {
    assert.equal(resolvePreset(CUSTOM_ADHAN, true), undefined)
    assert.equal(resolvePreset("makkah", true), undefined)
  })
  it("Natural Pace is the default; Short Alert and Traditional Full are one tap away", () => {
    assert.deepEqual(availablePresets().map((p) => p.id), ["commons-cc0-natural", "commons-cc0-short", "commons-cc0"])
    assert.equal(resolvePreset("commons-cc0-short", false)?.file, "/adhan/commons-cc0-short.mp3")
  })
  it("a chosen preset with a file plays itself", () => {
    assert.equal(resolvePreset("commons-cc0", true)?.id, "commons-cc0")
  })
})

describe("Fajr Adhan — the Tathweeb at Fajr only", () => {
  const fajr = { id: "fajr", name: { km: "អាហ្សានស៊ុពហ៍", en: "Fajr Adhan" }, file: "/adhan/fajr.mp3", credit: "test" }
  it("with a Fajr recording: it plays at Fajr (switch on), never at the other four", () => {
    assert.equal(adhanForPrayer("fajr", "commons-cc0-natural", true, false, fajr).presetFile, "/adhan/fajr.mp3")
    for (const p of ["dhuhr", "asr", "maghrib", "isha"]) assert.equal(adhanForPrayer(p, "commons-cc0-natural", true, false, fajr).presetFile, "/adhan/commons-cc0-natural.mp3")
    assert.equal(adhanForPrayer("fajr", "commons-cc0-natural", false, false, fajr).presetFile, "/adhan/commons-cc0-natural.mp3")
  })
  it("without one (today): Fajr plays the chosen general Adhan — and the prayer page carries no Fajr disclaimer card", () => {
    assert.equal(hasFajrRecording(), false)
    assert.equal(adhanForPrayer("fajr", "commons-cc0-short", true, false).presetFile, "/adhan/commons-cc0-short.mp3")
    // The founder (19/10/2026): the Fajr Adhan is the audio's job, never a permanent card under the prayer times.
    const page = readFileSync(join(process.cwd(), "src/app/(app)/islamic/prayer/page.tsx"), "utf8")
    assert.doesNotMatch(page, /fajrNote|tathweeb|hasFajrRecording/)
  })
  it("the phrase is written in Arabic letters only (no Khmer «ម» in «النوم»)", () => {
    assert.equal(ISLAMIC_ARABIC.tathweeb, "الصَّلَاةُ خَيْرٌ مِنَ النَّوْمِ")
    assert.doesNotMatch(ISLAMIC_ARABIC.tathweeb, /[ក-៿]/)
  })
})

describe("Adhans the admin publishes for everyone — no code change, no deploy (founder, 19/10/2026)", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
  const row = { id: "0b8c3c9e-4a51-4c1e-9d3f-2b6f9a3d1e7a", name_km: "អាហ្សាន គុយវ៉ែត (Kuwait Adhan)", name_en: null, credit: "Sheikh … · ពិរោះ ស្រទន់", audio_path: "5f0c7d1e-9a2b-4c3d-8e4f-6a7b8c9d0e1f.mp3" }

  it("a published Adhan joins the list after the bundled ones, played from the public bucket and kept offline", async () => {
    const { globalAdhanPreset } = await import("./adhan-presets")
    const { isCacheableAudio } = await import("./audio-cache")
    const g = globalAdhanPreset(row, "https://db.example.co/")!
    assert.equal(g.id, `g:${row.id}`)
    assert.equal(g.file, `https://db.example.co/storage/v1/object/public/adhan-audio/${row.audio_path}`)
    assert.deepEqual(g.name, { km: row.name_km, en: row.name_km }) // no English name → the Khmer one
    assert.equal(globalAdhanPreset({ ...row, audio_path: "../x.mp3" }, "https://db.example.co"), null)
    const list = availablePresets([g])
    assert.equal(list[list.length - 1].id, g.id)
    assert.equal(list[0].id, "commons-cc0-natural")
    // Chosen → it plays at every prayer; taken off by the admin → the first bundled Adhan, never silence.
    assert.equal(resolvePreset(g.id, false, [g])?.id, g.id)
    assert.deepEqual(adhanForPrayer("asr", g.id, false, false, FAJR_ADHAN, [g]), { presetFile: g.file, presetId: g.id })
    assert.equal(resolvePreset(g.id, false, [])?.id, "commons-cc0-natural")
    assert.ok(isCacheableAudio(g.file!))
    assert.match(read("public/sw.js"), /url\.pathname\.startsWith\("\/storage\/v1\/object\/public\/adhan-audio\/"\)/)
    assert.match(read("src/lib/prayer-alerts.ts"), /if \(!src\.startsWith\("blob:"\)\) audio\.crossOrigin = "anonymous"/)
  })

  it("only a super admin may publish; a regular member's file stays on the phone (IndexedDB)", async () => {
    const { canPublishGlobally, globalAdhanError } = await import("./adhan-presets")
    assert.equal(canPublishGlobally("super_admin"), true)
    for (const role of ["admin", "support", null, undefined]) assert.equal(canPublishGlobally(role), false)
    const ui = read("src/components/islamic/prayer-alerts.tsx")
    assert.match(ui, /const admin = canPublishGlobally\(usePlan\(\)\.plan\.staff_role\)/)
    assert.match(ui, /if \(admin\) return setPending\(file\)\r?\n\s+await keepOnDevice\(file\)/)
    assert.match(ui, /\{admin && \(\r?\n\s+<AdhanUploadSheet/)
    // The sheet: «this device» first, the global form only with a name, the reciter and the rights confirmed.
    const sheet = read("src/components/islamic/adhan-upload-sheet.tsx")
    assert.match(sheet, /setScope\("device"\)/)
    assert.equal(globalAdhanError({ nameKm: "អាហ្សាន", credit: "Sheikh …", rights: true }), null)
    assert.equal(globalAdhanError({ nameKm: " ", credit: "Sheikh …", rights: true }), "adhanUpload.nameRequired")
    assert.equal(globalAdhanError({ nameKm: "អាហ្សាន", credit: "", rights: true }), "adhanUpload.creditRequired")
    assert.equal(globalAdhanError({ nameKm: "អាហ្សាន", credit: "Sheikh …", rights: false }), "adhanUpload.rightsRequired")
  })

  it("the server and the database refuse anyone but a super admin; every change is audited", () => {
    const route = read("src/app/api/adhan/presets/route.ts")
    assert.match(route, /rpc\("is_super_admin"\)/)
    assert.match(route, /return NextResponse\.json\(\{ error: "forbidden" \}, \{ status: 403 \}\)/)
    assert.match(route, /cleanDuaAudio\(new Uint8Array\(await file\.arrayBuffer\(\)\), GLOBAL_ADHAN_MAX_SECONDS\)/)
    const sql = read("supabase/migrations/20270183000000_adhan_global_presets.sql")
    assert.equal((sql.match(/if not public\.is_super_admin\(\) then raise exception 'super admin only'/g) ?? []).length, 2)
    assert.match(sql, /perform public\.audit\('adhan_preset_add'/)
    assert.match(sql, /perform public\.audit\('adhan_preset_remove'/)
    assert.match(sql, /grant select on public\.adhan_presets to authenticated;/)
    assert.doesNotMatch(sql, /grant (insert|update|delete)[^;]*adhan_presets/)
    assert.doesNotMatch(sql, /on storage\.objects/) // only the server's service key writes the bucket
  })
})
