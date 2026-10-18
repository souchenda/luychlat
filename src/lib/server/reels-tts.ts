// Server only: the short videos' Khmer voices from Azure AI Speech (the licensed service — CLAUDE.md Licensing;
// never Edge-TTS). The key and region are the founder's, entered on the Droplet console (AZURE_SPEECH_KEY,
// AZURE_SPEECH_REGION, listed in docker-compose.yml). Speaks SSML from lib/islamic/reels-audio.ts; publishes nothing.
import { reelSsml } from "@/lib/islamic/reels-audio"
import type { ReelSpeaker } from "@/lib/islamic/reels-scripts"

export type TtsDeps = { fetch: typeof fetch; key: string | undefined; region: string | undefined }

const defaults = (): TtsDeps => ({ fetch, key: process.env.AZURE_SPEECH_KEY?.trim(), region: process.env.AZURE_SPEECH_REGION?.trim() })

/** Is Azure AI Speech configured (the render job checks before it starts). */
export const reelTtsConfigured = (deps: Partial<TtsDeps> = {}) => {
  const d = { ...defaults(), ...deps }
  return Boolean(d.key && d.region)
}

/** One voice line → an MP3 (48 kHz mono, 192 kbit/s). Throws with a clear reason; never returns a silent clip. */
export async function synthesizeReelLine(text: string, speaker: ReelSpeaker, deps: Partial<TtsDeps> = {}): Promise<Buffer> {
  const d = { ...defaults(), ...deps }
  if (!d.key || !d.region) throw new Error("Azure AI Speech is not configured (AZURE_SPEECH_KEY, AZURE_SPEECH_REGION)")
  const res = await d.fetch(`https://${d.region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": d.key,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-48khz-192kbitrate-mono-mp3",
      "User-Agent": "luychlat-reels",
    },
    body: reelSsml(text, speaker),
  })
  if (!res.ok) throw new Error(`Azure AI Speech refused the line (HTTP ${res.status})`)
  const audio = Buffer.from(await res.arrayBuffer())
  if (audio.length < 1000) throw new Error("Azure AI Speech returned an empty clip")
  return audio
}
