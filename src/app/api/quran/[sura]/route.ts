import { NextResponse } from "next/server"

import { parseSurah, QURAN_TRANSLATION, surahByNumber, type QuranSurahText } from "@/lib/quran"
import { clientIp, rateLimit } from "@/lib/server/guard"

/**
 * One surah — Uthmani Arabic + the Khmer translation (Islamic Community
 * Development Association, Cambodia) — from QuranEnc.com, cached on this
 * server (Next data cache) so readers don't wait on QuranEnc, and cached
 * again by the app's service worker for offline reading.
 *
 * QuranEnc's conditions: the text is passed through unmodified, and the
 * translation is kept at the latest version: the version list is checked
 * daily and is part of the cache key, so a new version replaces the old text.
 */
export const runtime = "nodejs"

const API = "https://quranenc.com/api/v1"
const DAY = 86_400

type ApiVerse = { sura: string; aya: string; arabic_text: string; translation: string; footnotes: string }

async function currentVersion(): Promise<string | null> {
  try {
    const res = await fetch(`${API}/translations/list/km`, { next: { revalidate: DAY } })
    if (!res.ok) return null
    const list = (await res.json()) as { translations?: { key: string; version: string }[] }
    return list.translations?.find((t) => t.key === QURAN_TRANSLATION.key)?.version ?? null
  } catch {
    return null
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ sura: string }> }) {
  const sura = parseSurah((await params).sura)
  if (!sura) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const limit = rateLimit(`quran:${clientIp(request)}`, 120, 60_000)
  if (!limit.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } })

  const version = await currentVersion()
  let rows: ApiVerse[]
  try {
    // The version in the URL makes a new translation version a new cache entry.
    const res = await fetch(`${API}/translation/sura/${QURAN_TRANSLATION.key}/${sura}?v=${encodeURIComponent(version ?? "0")}`, {
      next: { revalidate: 30 * DAY },
    })
    if (!res.ok) throw new Error(`QuranEnc ${res.status}`)
    rows = ((await res.json()) as { result: ApiVerse[] }).result
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 502 })
  }

  // Only a complete surah is served (and so cached by the app).
  if (!Array.isArray(rows) || rows.length !== surahByNumber(sura).ayat) {
    return NextResponse.json({ error: "incomplete" }, { status: 502 })
  }

  const body: QuranSurahText = {
    sura,
    version,
    verses: rows.map((r) => ({ aya: Number(r.aya), ar: r.arabic_text, km: r.translation, fn: r.footnotes?.trim() || null })),
  }
  return NextResponse.json(body, {
    headers: { "Cache-Control": `public, max-age=${DAY}, stale-while-revalidate=${7 * DAY}` },
  })
}
