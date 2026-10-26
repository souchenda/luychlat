// Server only: speech-to-text for the bot's voice notes. Keys live only in the server environment.
import { execFile } from "child_process"
import { randomUUID } from "crypto"
import { readFile, unlink, writeFile } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"

import { KHMER_EVERYDAY, khmerHint, transcriptUnsure } from "@/lib/bot/voice-guard"
import { geminiChain, NO_THINKING } from "@/lib/server/gemini"
import type { Locale } from "@/lib/i18n/dictionaries"

/**
 * Whisper via Groq (GROQ_API_KEY, whisper-large-v3) or OpenAI (OPENAI_API_KEY,
 * whisper-1), whichever is set; Groq first. Whisper is weak at Khmer, so when
 * GEMINI_API_KEY is set, Khmer chats are transcribed by Gemini first (Whisper
 * as the fallback). The audio goes to that provider for transcription only
 * and is not stored by LuyChlat. The vocabulary hint is generic money words
 * only — nothing from the user's data.
 *
 * Before sending, ffmpeg (when installed) normalises the level, adds a little
 * silence around short clips and converts to 16 kHz mono — Whisper otherwise
 * tends to "hear" words in faint noise on 1–2 second notes.
 */

type Provider = { url: string; key: string; model: string }

export function transcriptionProvider(): Provider | null {
  const groq = process.env.GROQ_API_KEY?.trim()
  if (groq) return { url: "https://api.groq.com/openai/v1/audio/transcriptions", key: groq, model: "whisper-large-v3" }
  const openai = process.env.OPENAI_API_KEY?.trim()
  if (openai) return { url: "https://api.openai.com/v1/audio/transcriptions", key: openai, model: "whisper-1" }
  return null
}

const geminiKey = () => process.env.GEMINI_API_KEY?.trim() || null

// Everyday money-logging words anchor Whisper on the domain (instead of poetry or sermons).
const HINT_KM = "កត់ត្រាចំណាយលុយឆ្លាត៖ ទិញទឹក ១០០០រៀល, ទិញទឹកសុទ្ធ, កាហ្វេ ២ដុល្លារ, សាំង ២០០០០រៀល, បាយថ្ងៃត្រង់, ថ្លៃម្ហូប, ដុល្លារ, រៀល"
const HINT_ZH = "支出 收入 还款 美元 瑞尔 咖啡 午饭 汽油 工资 ABA ACLEDA Wing"
const HINT_EN = "expense income repay dollars riel coffee lunch fuel salary ABA ACLEDA Wing"

/** `unsure`: the clip could not have held this text, or Whisper scored it low (lib/bot/voice-guard.ts, Task #507). */
export type Transcript = { text: string; language: string | null; retried: boolean; via: string; confidence?: string; unsure?: boolean }

/** Khmer script in a transcript. */
const KHMER = /[ក-៿]/

/** Level, padding and 16 kHz mono WAV via ffmpeg; the original audio when ffmpeg is missing or fails. */
async function prepare(audio: Blob): Promise<{ blob: Blob; name: string }> {
  const id = randomUUID()
  const input = join(tmpdir(), `voice-${id}.ogg`)
  const output = join(tmpdir(), `voice-${id}.wav`)
  try {
    await writeFile(input, Buffer.from(await audio.arrayBuffer()))
    await new Promise<void>((resolve, reject) =>
      execFile(
        "ffmpeg",
        ["-hide_banner", "-loglevel", "error", "-i", input, "-af", "adelay=400:all=1,apad=pad_dur=0.8,loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", "-y", output],
        { timeout: 15_000 },
        (error) => (error ? reject(error) : resolve()),
      ),
    )
    return { blob: new Blob([await readFile(output)], { type: "audio/wav" }), name: "voice.wav" }
  } catch {
    return { blob: audio, name: "voice.ogg" }
  } finally {
    await Promise.all([unlink(input).catch(() => {}), unlink(output).catch(() => {})])
  }
}

/**
 * What Whisper says of each segment. Groq / OpenAI take no condition_on_previous_text or no_speech_threshold (those are
 * the local model's options): the same checks are made here on what it returns — no_speech_prob, and compression_ratio
 * for a loop (lib/bot/voice-guard.ts, Task #512).
 */
type Segment = { avg_logprob?: number; no_speech_prob?: number; compression_ratio?: number }

async function whisper(provider: Provider, audio: { blob: Blob; name: string }, language: Locale | null, hint: string) {
  const form = new FormData()
  form.append("file", audio.blob, audio.name)
  form.append("model", provider.model)
  if (language) form.append("language", language)
  form.append("temperature", "0")
  form.append("response_format", "verbose_json")
  form.append("prompt", hint)
  try {
    const res = await fetch(provider.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${provider.key}` },
      body: form,
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) {
      // Status and the provider's message only — never the key or the audio.
      console.error(`[voice] whisper failed: HTTP ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`)
      return null
    }
    const data = (await res.json()) as { text?: string; language?: string; segments?: Segment[] }
    const text = data.text?.trim()
    if (!text) return null
    const segs = data.segments ?? []
    const logprob = segs.length ? segs.reduce((s, x) => s + (x.avg_logprob ?? 0), 0) / segs.length : null
    const noSpeech = segs.length ? Math.max(...segs.map((x) => x.no_speech_prob ?? 0)) : null
    const compression = segs.length ? Math.max(...segs.map((x) => x.compression_ratio ?? 0)) : null
    const confidence = logprob === null ? undefined : `logprob ${logprob.toFixed(2)}, no-speech ${noSpeech?.toFixed(2)}, compression ${compression?.toFixed(2)}`
    return { text, language: data.language?.toLowerCase() ?? null, confidence, logprob, noSpeech, compression }
  } catch (error) {
    console.error(`[voice] whisper error: ${(error as Error).message}`)
    return null
  }
}

/**
 * Gemini (audio understanding): an exact transcription, numbers as digits — through the shared model chain
 * (lib/server/gemini.ts — Tasks #512–#514: gemini-3.5-flash, then gemini-flash-latest; on 26/10 gemini-flash-latest
 * answered 503 then 429 all day, and the voice notes of 06:58 and 12:54 fell to Whisper, which invented the words).
 * 12 s per model; «no clear speech» (an empty answer) is an answer, not a failure.
 */
async function gemini(key: string, audio: { blob: Blob; name: string }) {
  const data = Buffer.from(await audio.blob.arrayBuffer()).toString("base64")
  const got = await geminiChain(
    key,
    {
      contents: [
        {
          parts: [
            { inline_data: { mime_type: audio.blob.type || "audio/ogg", data } },
            {
              text: `Transcribe this Khmer voice note accurately for personal expense tracking (for example: ទិញទឹក ១០០០រៀល, កាហ្វេ ២ដុល្លារ). Notes are often only 2–4 everyday words, such as: ${KHMER_EVERYDAY}. Write amounts as digits. Output only the Khmer transcript without commentary or translation. If there is no clear speech, output nothing.`,
            },
          ],
        },
      ],
      // No «thinking» for a transcript (Task #512).
      generationConfig: { temperature: 0, maxOutputTokens: 256, thinkingConfig: NO_THINKING },
    },
    24_000,
  )
  if (!got.ok) {
    console.error(`[voice] gemini failed: ${got.line}`)
    return null
  }
  try {
    const body = (await got.res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
    const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join(" ").trim()
    return text ? { text, language: "khmer", model: got.model } : null
  } catch (error) {
    console.error(`[voice] gemini ${got.model} error: ${(error as Error).message}`)
    return null
  }
}

/**
 * Speech to text.
 *   Khmer chat: Gemini when configured; else Whisper with language=km and the
 *   Khmer domain prompt (no auto-detect).
 *   Other chats: the spoken language is detected (a chat set to English often
 *   speaks Khmer); Khmer heard as Thai / Lao is asked again with language=km.
 */
export async function transcribe(raw: Blob, chatLanguage: Locale, seconds?: number): Promise<Transcript | null> {
  const t = await heard(raw, chatLanguage, seconds)
  return t ? { ...t, unsure: transcriptUnsure({ text: t.text, seconds, logprob: t.logprob, noSpeech: t.noSpeech, compression: t.compression }) } : null
}

async function heard(raw: Blob, chatLanguage: Locale, seconds?: number): Promise<(Transcript & { logprob?: number | null; noSpeech?: number | null; compression?: number | null }) | null> {
  const provider = transcriptionProvider()
  const key = geminiKey()
  if (!provider && !key) return null
  const audio = await prepare(raw)

  if (chatLanguage === "km") {
    if (key) {
      const g = await gemini(key, audio)
      if (g) return { ...g, retried: false, via: `gemini ${g.model}` }
    }
    if (!provider) return null
    // A short clip: the everyday words as the bias, temperature 0 (Task #507).
    const w = await whisper(provider, audio, "km", khmerHint(seconds, HINT_KM))
    return w ? { ...w, retried: false, via: `whisper${audio.name.endsWith(".wav") ? "+ffmpeg" : ""}` } : null
  }

  if (!provider) return null
  const via = `whisper${audio.name.endsWith(".wav") ? "+ffmpeg" : ""}`
  const hint = chatLanguage === "zh" ? HINT_ZH : HINT_EN
  const first = await whisper(provider, audio, null, hint)
  const looksKhmer = first ? KHMER.test(first.text) || first.language === "khmer" || first.language === "km" : false
  const misheard = first?.language === "thai" || first?.language === "lao" || first?.language === "th" || first?.language === "lo"
  if (first && !looksKhmer && !misheard) return { ...first, retried: false, via }
  // Khmer speech in a non-Khmer chat: Gemini if configured, else Whisper again with Khmer set.
  if (key) {
    const g = await gemini(key, audio)
    if (g) return { ...g, retried: true, via: `gemini ${g.model}` }
  }
  const khmer = await whisper(provider, audio, "km", khmerHint(seconds, HINT_KM))
  if (khmer) return { ...khmer, language: "khmer", retried: true, via }
  return first ? { ...first, retried: false, via } : null
}
