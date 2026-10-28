import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { khmerVoiceParams } from "./khmer-voice"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")
// android/ is not in the Docker build context (.dockerignore): checked locally and before every APK build.
const native = !existsSync(join(process.cwd(), "android")) && "android/ is not in the build context"

describe("The welcome in the phone's own Khmer voice, as DL Staff speaks (founder, 28/10/2026)", () => {
  it("the normal speed (1.2× was too fast — founder, 28/10/2026); 👩 a little higher, 👨 lower (one Khmer voice on a phone)", () => {
    assert.deepEqual(khmerVoiceParams("female"), { rate: 1, pitch: 1.08 })
    assert.deepEqual(khmerVoiceParams("male"), { rate: 1, pitch: 0.88 })
  })
  it("the phone's voice first, the recorded clip when it cannot — on launch and in What's New; the Salam stays its clip", () => {
    const launch = read("src/components/dashboard/welcome-greeting.tsx")
    assert.match(launch, /if \(g\.kind !== "khmer"\) \{\n\s+stopSpeaking = speakOnLaunch/)
    assert.match(launch, /speakKhmer\(GREETING_WORDS\.chumreap\.text, gender\)\.then\(\(spoken\) => \{\n\s+if \(!spoken && !gone\) stopSpeaking = speakOnLaunch/)
    assert.match(read("src/components/dashboard/whats-new.tsx"), /if \(islamic\) clip\(\)\n\s+else void speakKhmer\(GREETING_WORDS\.chumreap\.text, gender\)\.then\(\(spoken\) => spoken \|\| clip\(\)\)/)
    // An older app (no plugin), a browser: false, never an error.
    const lib = read("src/lib/khmer-voice.ts")
    assert.match(lib, /if \(!isNativeApp\(\)\) return false/)
    assert.match(lib, /\} catch \{\n[^\n]*\n\s+return false/)
  })
  it("the Android plugin: Khmer only, on the media stream, spoken:false without a Khmer voice; registered; APK 1.12", { skip: native }, () => {
    const j = read("android/app/src/main/java/com/luychlat/app/KhmerVoicePlugin.java")
    assert.match(j, /@CapacitorPlugin\(name = "KhmerVoice"\)/)
    assert.match(j, /t\.isLanguageAvailable\(km\) < TextToSpeech\.LANG_AVAILABLE/)
    assert.match(j, /\.setUsage\(AudioAttributes\.USAGE_MEDIA\)/)
    assert.doesNotMatch(j, /http|URL/) // nothing fetched: the phone's own voice
    assert.match(read("android/app/src/main/java/com/luychlat/app/MainActivity.java"), /registerPlugin\(KhmerVoicePlugin\.class\);[\s\S]*?super\.onCreate\(savedInstanceState\)/)
    assert.match(read("android/app/build.gradle"), /versionCode 13\b/)
  })
})
