// Server only: «🔔 សំឡេង Voice Telegram» — each KHQR sale also sent as a spoken Khmer voice note
// («ទទួលបានប្រាក់ ប្រាំបីពាន់រៀល») to the business owner's chats that turned it on (/voice), so it is
// heard with the phone in a pocket. Joined from the recorded Khmer clips (public/audio/soundbox/khmer —
// see docs/soundbox-khmer-audio.md); Telegram's sendVoice takes MP3. No clips yet → no voice note
// (the text message still goes), logged once.
import { readFile } from "node:fs/promises"
import { join } from "node:path"

import { announcementText, joinMp3, khmerClipSequence, KHMER_CLIPS, type KhmerClip } from "@/lib/soundbox"

import { logEvent } from "./events"
import { botDb, botKey, botToken } from "./telegram-bot"

const DIR = join(process.cwd(), "public", "audio", "soundbox", "khmer")
let clips: Map<KhmerClip, Uint8Array> | null | undefined

/** The 27 clips read once from disk; null while any is missing. */
async function loadClips(): Promise<Map<KhmerClip, Uint8Array> | null> {
  if (clips !== undefined) return clips
  try {
    const entries = await Promise.all(KHMER_CLIPS.map(async (name) => [name, new Uint8Array(await readFile(join(DIR, `${name}.mp3`)))] as const))
    clips = new Map(entries)
  } catch {
    clips = null
    logEvent("warn", "voice-alert", "Khmer voice clips are not installed yet (public/audio/soundbox/khmer) — voice notes skipped", { fold: true })
  }
  return clips
}

/** The voice note for a payment, or null without the clips. */
export async function paymentVoiceNote(amount: number, currency: "KHR" | "USD"): Promise<Uint8Array | null> {
  const all = await loadClips()
  if (!all) return null
  return joinMp3(khmerClipSequence(amount, currency).map((name) => all.get(name)!))
}

/** A sale recorded by /api/khqr/ingest (status "ok" — the caller's guard): the voice note to the chats that want it. */
export async function sendPaymentVoice(workspaceId: string, amount: number, currency: "KHR" | "USD"): Promise<number> {
  const { data, error } = await botDb().rpc("bot_voice_alert_chats", { p_key: botKey(), p_workspace_id: workspaceId })
  const chats = ((data as { chat_id: number }[] | null) ?? []).map((c) => Number(c.chat_id))
  if (error || !chats.length) return 0
  const note = await paymentVoiceNote(amount, currency)
  const token = botToken()
  if (!note || !token) return 0
  let sent = 0
  for (const chatId of chats) {
    const form = new FormData()
    form.append("chat_id", String(chatId))
    form.append("caption", announcementText({ amount, currency }, "km"))
    form.append("voice", new Blob([Buffer.from(note)], { type: "audio/mpeg" }), "payment.mp3")
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendVoice`, { method: "POST", body: form, signal: AbortSignal.timeout(15_000) })
      const body = (await res.json()) as { ok: boolean; description?: string }
      if (body.ok) sent += 1
      else logEvent("error", "voice-alert", `Payment voice note not sent: ${body.description ?? res.status}`, { fold: true })
    } catch (e) {
      logEvent("error", "voice-alert", `Payment voice note not sent: ${(e as Error).message}`, { fold: true })
    }
  }
  return sent
}
