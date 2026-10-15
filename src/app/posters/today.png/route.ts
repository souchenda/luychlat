import { NextResponse } from "next/server"

import { morningPoster } from "@/lib/server/community-routine"
import { phnomPenhToday } from "@/lib/server/market-sync"
import { posterAssetsReady } from "@/lib/server/poster-kit"
import { botDb } from "@/lib/server/telegram-bot"

/**
 * https://app.luychlat.com/posters/today.png — today's morning poster (Cambodia date), drawn by the
 * same generator as the 07:00 post. Shown only once that post was published: never while it waits for
 * the founder's 06:15 decision, never after «❌ ផ្អាកថ្ងៃនេះ». Drawn once per day per server.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

let cached: { day: string; png: Buffer } | null = null

export async function GET() {
  const { day } = phnomPenhToday()
  const { data: published, error } = await botDb().rpc("morning_post_published", { p_day: day })
  if (error) return NextResponse.json({ error: "unavailable" }, { status: 503 })
  if (published !== true) return NextResponse.json({ error: "not_published_yet", day }, { status: 404, headers: { "Cache-Control": "no-store" } })
  if (cached?.day !== day) {
    await posterAssetsReady
    cached = { day, png: morningPoster(day) }
  }
  return new NextResponse(new Uint8Array(cached.png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=600", "Content-Disposition": `inline; filename="poster-${day}.png"` },
  })
}
