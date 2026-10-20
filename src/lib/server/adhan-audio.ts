// Server only: the Adhan as a Telegram audio message at a prayer (founder, 20/10/2026 — lib/adhan-audio-alert.ts).
// Telegram fetches the recording from its public URL once; its file id is then reused for every other member, so
// one prayer means one download. A failure returns false and the dispatcher sends the usual text alert instead.
import { adhanAudioCaption, adhanTrackFor, type AdhanTracks } from "@/lib/adhan-audio-alert"
import { SITE_URL } from "@/lib/app-site"
import { logEvent } from "@/lib/server/events"
import { botDb, botKey, tg } from "@/lib/server/telegram-bot"
import { supabaseUrl } from "@/lib/supabase/config"

let tracksCache: { value: AdhanTracks; at: number } | null = null
/** The defaults and the published Adhans, cached 10 minutes. */
async function tracks(): Promise<AdhanTracks> {
  if (tracksCache && Date.now() - tracksCache.at < 10 * 60_000) return tracksCache.value
  const { data } = await botDb().rpc("bot_adhan_tracks", { p_key: botKey() })
  const value = (data as AdhanTracks | null) ?? {}
  tracksCache = { value, at: Date.now() }
  return value
}

/** Telegram's file id per recording URL (this process). */
const fileIds = new Map<string, string>()

export async function sendAdhanAudio(chatId: number, o: { prayer: string; khmer: boolean; prayerName: string; time: string; place: string }): Promise<boolean> {
  const track = adhanTrackFor(o.prayer, await tracks(), supabaseUrl, SITE_URL)
  if (!track) return false
  const caption = adhanAudioCaption(o)
  const res = await tg<{ audio?: { file_id: string } }>("sendAudio", {
    chat_id: chatId,
    audio: fileIds.get(track.url) ?? track.url,
    caption,
    parse_mode: "HTML",
    title: o.khmer ? `អាហ្សាន · ${o.prayerName}` : `Adhan · ${o.prayerName}`,
    performer: o.khmer ? "អេប លុយឆ្លាត" : "App Luy Chlat",
  })
  if (res.ok && res.result?.audio?.file_id) fileIds.set(track.url, res.result.audio.file_id)
  if (!res.ok) logEvent("warn", "prayer", `Adhan audio not sent (${track.id}): ${res.description ?? "?"} — text alert instead`, { fold: true })
  return res.ok
}
