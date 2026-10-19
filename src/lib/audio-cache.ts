/**
 * Quran recitations offline (founder, 19/10/2026): the MP3s from MP3Quran's CDN kept in the phone's CacheStorage,
 * in their own cache — played offline, freed in one tap from Settings. The service worker (public/sw.js) keeps a
 * surah streamed to the end (no second download) and serves a kept one, by the byte range the player asks for; the
 * ⬇️ button downloads one on purpose. The same cache name and range rules in sw.js (audio-cache.test.ts checks).
 * Nothing personal is ever stored here — only public recitations.
 */
import { QURAN_AUDIO_HOST } from "@/lib/quran-audio"

export const AUDIO_CACHE = "luysmart-quran-audio-v1"

/** A recitation the cache may keep: an MP3 on MP3Quran's CDN, or one of our du'a recordings (/audio/duas/). */
export const isCacheableAudio = (url: string) =>
  (url.startsWith(`${QURAN_AUDIO_HOST}/audio/`) && /\.mp3$/i.test(url.split("?")[0])) || /^(https:\/\/app\.luychlat\.com)?\/audio\/duas\/[a-z0-9-]+\.(mp3|m4a)$/.test(url)

/** «bytes=0-», «bytes=100-199», «bytes=-500» → the byte span within `size`; null when absent or unusable. */
export function parseRange(header: string | null, size: number): { start: number; end: number } | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec((header ?? "").trim())
  if (!m || (!m[1] && !m[2]) || size <= 0) return null
  let start: number
  let end: number
  if (!m[1]) {
    start = Math.max(0, size - Number(m[2]))
    end = size - 1
  } else {
    start = Number(m[1])
    end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1
  }
  return start <= end && start < size ? { start, end } : null
}

/** Did this answer carry the whole file — a 200, or a 206 from byte 0 to the last («bytes 0-584093/584094»)? */
export function isWholeBody(status: number, contentRange: string | null): boolean {
  if (status === 200) return true
  if (status !== 206 || !contentRange) return false
  const m = /^bytes 0-(\d+)\/(\d+)$/.exec(contentRange.trim())
  return Boolean(m && Number(m[1]) + 1 === Number(m[2]))
}

const cacheApi = () => (typeof caches === "undefined" ? null : caches)

/** The recitations kept on this phone (their URLs). */
export async function cachedAudioUrls(): Promise<Set<string>> {
  const api = cacheApi()
  if (!api) return new Set()
  const cache = await api.open(AUDIO_CACHE)
  return new Set((await cache.keys()).map((r) => r.url))
}

/** ⬇️: download a surah whole and keep it (the service worker may keep it too — the same file, once). */
export async function downloadAudio(url: string): Promise<void> {
  const api = cacheApi()
  if (!api || !isCacheableAudio(url)) throw new Error("unsupported")
  const res = await fetch(url, { mode: "cors" })
  if (!res.ok || !isWholeBody(res.status, res.headers.get("Content-Range"))) throw new Error(`HTTP ${res.status}`)
  const blob = await res.blob()
  const cache = await api.open(AUDIO_CACHE)
  await cache.put(url, new Response(blob, { headers: { "Content-Type": "audio/mpeg", "Content-Length": String(blob.size) } }))
}

/** The bytes the kept recitations take. */
export async function audioCacheBytes(): Promise<number> {
  const api = cacheApi()
  if (!api) return 0
  const cache = await api.open(AUDIO_CACHE)
  let total = 0
  for (const req of await cache.keys()) total += Number((await cache.match(req))?.headers.get("Content-Length") ?? 0)
  return total
}

/** «សម្អាតទំហំចម្រៀង/គួរអាន»: every kept recitation removed. */
export async function clearAudioCache(): Promise<void> {
  await cacheApi()?.delete(AUDIO_CACHE)
}

/** «12.4 MB» / «840 KB». */
export const formatBytes = (n: number) => (n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(0, Math.round(n / 1024))} KB`)
