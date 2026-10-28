"use client"

// The phone's own Khmer voice for the spoken welcome (founder, 28/10/2026 — «DL Staff sounds more natural»): in the app
// (1.12+), Android's Text-to-Speech speaks the words (android/…/KhmerVoicePlugin.java, as DL Staff's driver app does);
// an older app, a browser or a phone without a Khmer voice gets false — the caller plays the recorded clip then.

import { registerPlugin } from "@capacitor/core"

import { isNativeApp } from "@/lib/native-bridge"
import type { VoiceGender } from "@/lib/soundbox"

type KhmerVoicePlugin = { speak(o: { text: string; rate: number; pitch: number; volume: number }): Promise<{ spoken: boolean }> }

const KhmerVoice = registerPlugin<KhmerVoicePlugin>("KhmerVoice")

/**
 * The phone has one Khmer voice, so 👩 / 👨 is its pitch — a little higher for a woman's, lower for a man's (DL Staff's
 * pitches). The normal speed: DL Staff's 1.2× was too fast for a greeting (founder, 28/10/2026).
 */
export function khmerVoiceParams(gender: VoiceGender): { rate: number; pitch: number } {
  return gender === "male" ? { rate: 1, pitch: 0.88 } : { rate: 1, pitch: 1.08 }
}

/** Speaks `text` in the phone's Khmer voice; false when it cannot (then play the clip). Never throws. */
export async function speakKhmer(text: string, gender: VoiceGender): Promise<boolean> {
  if (!isNativeApp()) return false
  try {
    const r = await KhmerVoice.speak({ text, volume: 1, ...khmerVoiceParams(gender) })
    return r?.spoken === true
  } catch {
    // An app before 1.12 has no KhmerVoice plugin.
    return false
  }
}
