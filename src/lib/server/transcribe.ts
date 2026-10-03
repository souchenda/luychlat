// Server only: speech-to-text for the bot's voice notes. Keys live only in the server environment.

/**
 * Whisper via Groq (GROQ_API_KEY, whisper-large-v3) or OpenAI (OPENAI_API_KEY,
 * whisper-1), whichever is set; Groq first. The audio goes to that provider for
 * transcription only and is not stored by LuyChlat. The vocabulary hint is
 * generic money words only — nothing from the user's data.
 */

type Provider = { url: string; key: string; model: string }

export function transcriptionProvider(): Provider | null {
  const groq = process.env.GROQ_API_KEY?.trim()
  if (groq) return { url: "https://api.groq.com/openai/v1/audio/transcriptions", key: groq, model: "whisper-large-v3" }
  const openai = process.env.OPENAI_API_KEY?.trim()
  if (openai) return { url: "https://api.openai.com/v1/audio/transcriptions", key: openai, model: "whisper-1" }
  return null
}

const HINT_KM = "ចំណាយ ចំណូល សងបំណុល ដុល្លារ រៀល ពាន់ ម៉ឺន កាហ្វេ បាយ សាំង ប្រាក់ខែ ABA ACLEDA Wing"
const HINT_EN = "expense income repay dollars riel coffee lunch fuel salary ABA ACLEDA Wing"

export async function transcribe(audio: Blob, language: "km" | "en"): Promise<string | null> {
  const provider = transcriptionProvider()
  if (!provider) return null
  const form = new FormData()
  form.append("file", audio, "voice.ogg")
  form.append("model", provider.model)
  form.append("language", language)
  form.append("temperature", "0")
  form.append("response_format", "json")
  form.append("prompt", language === "km" ? HINT_KM : HINT_EN)
  try {
    const res = await fetch(provider.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${provider.key}` },
      body: form,
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { text?: string }
    return data.text?.trim() || null
  } catch {
    return null
  }
}
