/**
 * The Adhan as audio in Telegram (founder, 20/10/2026): which recording @luychlat_bot sends at a prayer, and its
 * caption. The same choice as the app's alerts (lib/adhan-presets.ts): the Fajr recording at Fajr when there is one,
 * else the app-wide default the admin set, else the first built-in recording. Pure (adhan-audio-alert.test.ts).
 */
import { adhanForPrayer, FAJR_ADHAN, globalAdhanPreset, type AdhanDefaults, type AdhanPreset, type GlobalAdhanRow } from "@/lib/adhan-presets"

export type AdhanTracks = { defaults?: AdhanDefaults | null; global?: GlobalAdhanRow[] | null }

/** The recording's public URL (Telegram fetches it once; the bot then reuses its file id) — or null. */
export function adhanTrackFor(prayer: string, tracks: AdhanTracks, supabaseUrl: string, siteUrl: string): { id: string; url: string } | null {
  const global = (tracks.global ?? []).map((r) => globalAdhanPreset(r, supabaseUrl)).filter((p): p is AdhanPreset => Boolean(p))
  const pickd = adhanForPrayer(prayer, null, true, false, FAJR_ADHAN, global, tracks.defaults ?? {})
  if (!pickd.presetFile || !pickd.presetId) return null
  const url = /^https:\/\//.test(pickd.presetFile) ? pickd.presetFile : `${siteUrl.replace(/\/+$/, "")}${pickd.presetFile}`
  return { id: pickd.presetId, url }
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

/** The caption under the Adhan (HTML): the founder's Khmer card; English for the other languages. */
export function adhanAudioCaption(o: { khmer: boolean; prayerName: string; time: string; place: string }): string {
  return o.khmer
    ? [`🕌 <b>ដល់ម៉ោងសឡាត ${esc(o.prayerName)} ហើយ!</b>`, `⏰ ម៉ោង៖ ${esc(o.time)}`, `📍 ទីតាំង៖ ${esc(o.place)}`, "— អេប លុយឆ្លាត សហគមន៍ឥស្លាម"].join("\n")
    : [`🕌 <b>It's time for ${esc(o.prayerName)}!</b>`, `⏰ Time: ${esc(o.time)}`, `📍 Place: ${esc(o.place)}`, "— App Luy Chlat Islamic Community"].join("\n")
}
