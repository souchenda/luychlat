// Server only: a du'a recording from the super admin (the du'a card's «📤 បញ្ចូលសំឡេង» or /setdua in the bot) is
// cleaned by ffmpeg — mono MP3, −16 LUFS, a short lead-in, at most DUA_MAX_SECONDS — and stored in the public bucket
// «dua-audio» (the service key; no member can write there). The database records it only for a super admin
// (dua_recording_put); a refused or failed record deletes the new file, a replaced one deletes the old.
import { execFile } from "child_process"
import { randomUUID } from "crypto"
import { readFile, unlink, writeFile } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"

import { createClient } from "@supabase/supabase-js"

import { DUA_AUDIO_BUCKET, DUA_MAX_SECONDS, duaAudioPath, isDuaAudioPath, isDuaId } from "@/lib/dua-audio"
import { logEvent } from "@/lib/server/events"
import { withCleanFetch } from "@/lib/supabase/clean-fetch"
import { supabaseUrl } from "@/lib/supabase/config"

const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null
export const duaStoreConfigured = () => Boolean(serviceKey() && supabaseUrl)
const service = () => createClient(supabaseUrl, serviceKey()!, withCleanFetch({ auth: { persistSession: false, autoRefreshToken: false } }))

/**
 * Any phone recording (MP3, M4A, a Telegram voice note's OGG/Opus, WAV…) → a clean MP3 (mono, −16 LUFS, cut at
 * `maxSeconds`); null when it isn't audio. Also used for the admin's global Adhan presets (lib/server/adhan-presets-store).
 */
export async function cleanDuaAudio(bytes: Uint8Array, maxSeconds: number = DUA_MAX_SECONDS): Promise<Uint8Array | null> {
  const id = randomUUID()
  const input = join(tmpdir(), `dua-${id}.in`)
  const output = join(tmpdir(), `dua-${id}.mp3`)
  try {
    await writeFile(input, bytes)
    await new Promise<void>((resolve, reject) =>
      execFile(
        "ffmpeg",
        ["-hide_banner", "-loglevel", "error", "-i", input, "-vn", "-t", String(maxSeconds), "-af", "adelay=250:all=1,apad=pad_dur=0.4,loudnorm=I=-16:TP=-1.5:LRA=11", "-ac", "1", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "96k", "-y", output],
        { timeout: 120_000 },
        (error) => (error ? reject(error) : resolve()),
      ),
    )
    const out = new Uint8Array(await readFile(output))
    return out.length > 1000 ? out : null
  } catch (e) {
    logEvent("error", "dua-audio", `ffmpeg could not read the recording: ${(e as Error).message.slice(0, 160)}`, { fold: true })
    return null
  } finally {
    await Promise.all([unlink(input).catch(() => {}), unlink(output).catch(() => {})])
  }
}

export type DuaSaveResult = { ok: true; path: string } | { ok: false; error: "not_configured" | "bad_dua" | "not_audio" | "upload_failed" | "forbidden" | "failed" }

/**
 * Clean, store and record one du'a's recording. `record` writes the row as the caller (the app's signed-in super
 * admin, or the bot for the super admin's chat) and returns the replaced file's path.
 */
export async function saveDuaRecording(
  dua: string,
  bytes: Uint8Array,
  record: (path: string) => Promise<{ old: string | null; error: string | null }>,
): Promise<DuaSaveResult> {
  if (!duaStoreConfigured()) return { ok: false, error: "not_configured" }
  if (!isDuaId(dua)) return { ok: false, error: "bad_dua" }
  const mp3 = await cleanDuaAudio(bytes)
  if (!mp3) return { ok: false, error: "not_audio" }
  const db = service()
  const path = duaAudioPath(dua, Date.now())
  const up = await db.storage.from(DUA_AUDIO_BUCKET).upload(path, new Blob([new Uint8Array(mp3)], { type: "audio/mpeg" }), { contentType: "audio/mpeg", upsert: false, cacheControl: "31536000" })
  if (up.error) {
    logEvent("error", "dua-audio", `Upload failed for ${dua}: ${up.error.message}`, { fold: true })
    return { ok: false, error: "upload_failed" }
  }
  const { old, error } = await record(path)
  if (error) {
    await db.storage.from(DUA_AUDIO_BUCKET).remove([path])
    return { ok: false, error: /super admin only/.test(error) ? "forbidden" : "failed" }
  }
  if (old && old !== path && isDuaAudioPath(dua, old)) await db.storage.from(DUA_AUDIO_BUCKET).remove([old])
  logEvent("info", "dua-audio", `Du'a recording set: ${dua} (${Math.round(mp3.length / 1024)} KB)`)
  return { ok: true, path }
}

/** After «🗑 លុបសំឡេង»: the file goes too. */
export async function deleteDuaFile(dua: string, path: string | null) {
  if (path && duaStoreConfigured() && isDuaAudioPath(dua, path)) await service().storage.from(DUA_AUDIO_BUCKET).remove([path])
}
